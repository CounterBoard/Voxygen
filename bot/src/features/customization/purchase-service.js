export function createCustomizationPurchaseService({
  requireUser,
  ensureWorldTables,
  getTreasuryManagerCities,
  getRoleByTelegramId,
  calculateDiscountedPrice,
  notifyBankerOfPurchase,
  notifyTerritoryManagers,
  escapeHtml,
  formatTelegramNickname,
  ensureFirstCityMarker,
  evaluateAchievementsForTerritory,
  json,
  createId = () => crypto.randomUUID(),
} = {}) {
  async function purchaseCustomizationItem(request, env, ctx = null) {
    const auth = await requireUser(request, env); if (auth.error) return auth.error;
    await ensureWorldTables(env);
    const userId=Number(auth.user.id); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
    const itemId=String(body?.itemId||'').trim(),requested=String(body?.accountScope||'personal').toLowerCase();
    const managerCities=await getTreasuryManagerCities(env,userId); const territoryId=requested.startsWith('treasury:')?requested.slice(9):'';
    const accountCity=managerCities.find(c=>String(c.id)===territoryId)||null; const accountScope=accountCity?`treasury:${accountCity.id}`:'personal';
    if(accountCity) await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
    const item=await env.DB.prepare('SELECT id,name,price,government_marker,hidden_from_users FROM customization_items WHERE id=? AND active=1').bind(itemId).first(); if(!item)return json({ok:false,error:'Товар не найден'},404); if(!Number.isSafeInteger(Number(item.price))||Number(item.price)<0)return json({ok:false,error:'У товара некорректная цена'},500); if(Number(item.government_marker||0)===1)return json({ok:false,error:'Этот визуал недоступен для покупки'},403); const buyerRole=await getRoleByTelegramId(env,Number(auth.user.id),auth.user.username||''); if(Number(item.hidden_from_users||0)===1 && buyerRole!=='main_inspector')return json({ok:false,error:'Этот визуал недоступен для покупки'},403);
    const purchaseNow=Date.now();
    const activeDiscount=await env.DB.prepare('SELECT percent,expires_at FROM customization_discounts WHERE item_id=? AND expires_at>?').bind(itemId,purchaseNow).first();
    const discountPercent=Math.max(0,Math.min(100,Math.floor(Number(activeDiscount?.percent)||0)));
    const purchasePrice=discountPercent>0?calculateDiscountedPrice(item.price,discountPercent):Number(item.price);
    const already=accountCity
      ? await env.DB.prepare('SELECT item_id FROM city_items WHERE territory_id=? AND item_id=?').bind(accountCity.id,itemId).first()
      : await env.DB.prepare('SELECT item_id FROM user_items WHERE telegram_id=? AND item_id=?').bind(userId,itemId).first();
    if(already)return json({ok:true,alreadyOwned:true,accountScope});
    await env.DB.prepare('INSERT OR IGNORE INTO user_currency(telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)').bind(userId,userId).run();
    const balance=accountCity?await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first():await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first();
    if(Number(balance?.balance||0)<purchasePrice)return json({ok:false,error:'Недостаточно самоцветов'},400);
    const acquiredAt=Date.now();
    const attributedCity=accountCity||managerCities[0]||((await env.DB.prepare(`SELECT t.id,t.name FROM city_memberships cm JOIN territories t ON t.id=cm.territory_id WHERE cm.telegram_id=? AND t.status='approved' ORDER BY t.created_at ASC LIMIT 1`).bind(userId).first())||null);
    const spendLogId=createId();
    const spendLogStatement=env.DB.prepare(`INSERT INTO gem_spend_log(id,territory_id,telegram_id,item_id,amount,created_at)
      SELECT ?,?,?,?,?,? WHERE changes()=1 AND ? IS NOT NULL AND ? > 0`)
      .bind(spendLogId,attributedCity?.id||null,userId,itemId,purchasePrice,acquiredAt,attributedCity?.id||null,purchasePrice);
    // Debit, inventory grant and achievement-spend journal are one D1 transaction.
    // The NOT EXISTS predicate makes simultaneous/retried purchases idempotent for the selected account.
    let purchaseBatch;
    try {
      purchaseBatch=accountCity
      ?await env.DB.batch([
        env.DB.prepare(`UPDATE city_treasury SET balance=balance-?,updated_at=? WHERE territory_id=? AND balance>=? AND NOT EXISTS (SELECT 1 FROM city_items WHERE territory_id=? AND item_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(purchasePrice,acquiredAt,accountCity.id,purchasePrice,accountCity.id,itemId,userId),
        env.DB.prepare(`INSERT INTO city_items (territory_id,item_id,acquired_at,source) SELECT ?,?,?,'treasury_purchase' WHERE changes()=1`).bind(accountCity.id,itemId,acquiredAt),
        spendLogStatement,
      ])
      :await env.DB.batch([
        env.DB.prepare(`UPDATE user_currency SET balance=balance-? WHERE telegram_id=? AND balance>=? AND NOT EXISTS (SELECT 1 FROM user_items WHERE telegram_id=? AND item_id=?) AND NOT EXISTS (SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(purchasePrice,userId,purchasePrice,userId,itemId,userId),
        env.DB.prepare(`INSERT INTO user_items (telegram_id,item_id,acquired_at,source) SELECT ?,?,?,'purchase' WHERE changes()=1`).bind(userId,itemId,acquiredAt),
        spendLogStatement,
      ]);
    } catch (error) {
      const locked=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=?`).bind(userId).first().catch(()=>null);
      if(locked)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
      throw error;
    }
    if(!purchaseBatch?.[0]?.meta?.changes){
      const ownedNow=accountCity
        ?await env.DB.prepare('SELECT item_id FROM city_items WHERE territory_id=? AND item_id=?').bind(accountCity.id,itemId).first()
        :await env.DB.prepare('SELECT item_id FROM user_items WHERE telegram_id=? AND item_id=?').bind(userId,itemId).first();
      if(ownedNow)return json({ok:true,alreadyOwned:true,accountScope});
      return json({ok:false,error:'Недостаточно самоцветов'},400);
    }
    const purchaseNotification = (async () => {
      const buyer = await env.DB.prepare(`SELECT mc_nickname,telegram_username FROM users WHERE telegram_id=? LIMIT 1`).bind(userId).first();
      await notifyBankerOfPurchase(env,{
        buyerNickname:buyer?.mc_nickname,
        buyerUsername:buyer?.telegram_username || auth.user.username,
        buyerTelegramId:userId,
        itemName:item.name,
        price:purchasePrice,
        territoryName:accountCity?.name || null,
      });
      if(accountCity){
        const buyerNickname=String(buyer?.mc_nickname||'').trim()||'Ник не указан';
        const notice=`💸 <b>Трата из казны</b>\n\n🏙 <b>${escapeHtml(accountCity.name)}</b>\n👤 Кто: ${formatTelegramNickname(buyerNickname)}\n🎨 Покупка: <b>${escapeHtml(item.name)}</b>\n💎 Сумма: <b>${purchasePrice} сц</b>`;
        await notifyTerritoryManagers(env,accountCity.id,notice,userId,{managersOnly:true});
      }
    })().catch(error => {
      // The item and balance are already committed; notification data is best-effort.
      console.error('Purchase notification preparation failed:', error);
    });
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(purchaseNotification);
    else await purchaseNotification;
    if(attributedCity){
      await ensureFirstCityMarker(env,attributedCity.id).catch(error=>console.error('City marker check after visual purchase:',error));
      await evaluateAchievementsForTerritory(env,attributedCity.id).catch(error=>console.error('Achievement evaluation after visual purchase:',error));
    }
    const finalBalance=accountCity?await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first():await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first();
    return json({ok:true,balance:Number(finalBalance?.balance||0),accountScope});
  }

  return { purchaseCustomizationItem };
}