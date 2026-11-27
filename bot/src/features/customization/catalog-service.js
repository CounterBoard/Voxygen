export function createCustomizationCatalogService({
  requireUser,
  ensureWorldTables,
  getTreasuryManagerCities,
  cleanupCustomizationCategories,
  getRoleByTelegramId,
  calculateDiscountedPrice,
  getTerritoryManagerRows,
  ensureFirstCityMarker,
  json,
} = {}) {
  async function getCustomization(request, env) {
    const auth=await requireUser(request,env); if(auth.error)return auth.error;
    await ensureWorldTables(env);
    const userId=Number(auth.user.id);
    await env.DB.prepare(`INSERT OR IGNORE INTO user_currency (telegram_id,balance) SELECT ?,0 WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(userId,userId).run();
    const managerCities=await getTreasuryManagerCities(env,userId);
    const url=new URL(request.url);
    if(String(url.searchParams.get('lite')||'')==='1'){
      const requested=String(url.searchParams.get('account')||'personal').toLowerCase();
      const requestedTerritoryId=requested.startsWith('treasury:')?requested.slice(9):'';
      let accountScope='personal',accountCity=null;
      if(requestedTerritoryId && managerCities.some(c=>String(c.id)===requestedTerritoryId)) { accountScope=`treasury:${requestedTerritoryId}`; accountCity=managerCities.find(c=>String(c.id)===requestedTerritoryId); }
      const currentUser=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1').bind(userId).first();
      let balance=Number((await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first())?.balance||0);
      if(accountCity){
        await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
        balance=Number((await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first())?.balance||0);
      }
      return json({ok:true,balance,personalBalance:Number((await env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first())?.balance||0),accountScope,accountLabel:accountScope==='personal'?(currentUser?.mc_nickname||'Ник не указан'):`Казна: ${accountCity?.name||'город'}`});
    }
    const requested=String(url.searchParams.get('account')||'personal').toLowerCase();
    const requestedTerritoryId=requested.startsWith('treasury:')?requested.slice(9):'';
    let accountScope='personal',accountCity=null;
    if(requestedTerritoryId && managerCities.some(c=>String(c.id)===requestedTerritoryId)) { accountScope=`treasury:${requestedTerritoryId}`; accountCity=managerCities.find(c=>String(c.id)===requestedTerritoryId); }
    let profileTerritoryId=String(url.searchParams.get('territoryId')||'').trim();
    if(profileTerritoryId && !managerCities.some(c=>String(c.id)===profileTerritoryId)) {
      const membership=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=? LIMIT 1`).bind(profileTerritoryId,userId).first();
      if(!membership) profileTerritoryId='';
    }
    if(!profileTerritoryId && accountCity) profileTerritoryId=String(accountCity.id);
    if(accountCity) await env.DB.prepare(`INSERT OR IGNORE INTO city_treasury(territory_id,balance,updated_at) VALUES(?,?,?)`).bind(accountCity.id,0,Date.now()).run();
    const currentUser=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=? LIMIT 1').bind(userId).first();
    await cleanupCustomizationCategories(env);
    const [cats,items,personalOwned,owned,personalBalance]=await Promise.all([
      env.DB.prepare('SELECT id,name,sort_order FROM customization_categories ORDER BY sort_order ASC, created_at ASC, name ASC').all(),
      env.DB.prepare(`SELECT i.id,i.category_id,c.name AS category_name,i.name,i.price,i.image_data,i.categories_text,i.color,i.active,i.sort_order,i.achievement_enabled,i.achievement_residents,i.achievement_gems,i.achievement_inspector_score,i.achievement_player_score,i.achievement_screenshots,i.achievement_comments,i.achievement_visuals,i.government_marker,i.hidden_from_users,d.percent AS discount_percent,d.expires_at AS discount_expires_at FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id LEFT JOIN customization_discounts d ON d.item_id=i.id AND d.expires_at>? WHERE i.active=1 ORDER BY i.sort_order ASC, i.created_at ASC`).bind(Date.now()).all(),
      env.DB.prepare('SELECT item_id,source,acquired_at FROM user_items WHERE telegram_id=?').bind(userId).all(),
      accountCity
        ? env.DB.prepare('SELECT item_id,source,acquired_at FROM city_items WHERE territory_id=?').bind(accountCity.id).all()
        : env.DB.prepare('SELECT item_id,source,acquired_at FROM user_items WHERE telegram_id=?').bind(userId).all(),
      env.DB.prepare('SELECT balance FROM user_currency WHERE telegram_id=?').bind(userId).first(),
    ]);
    let balance=Number(personalBalance?.balance||0);
    if(accountCity){ const row=await env.DB.prepare('SELECT balance FROM city_treasury WHERE territory_id=?').bind(accountCity.id).first(); balance=Number(row?.balance||0); }
    const viewerRole=await getRoleByTelegramId(env,userId,auth.user.username);
    const visibleItems=(viewerRole==='main_inspector' ? (items.results||[]) : (items.results||[]).filter(i=>Number(i.government_marker||0)!==1 && Number(i.hidden_from_users||0)!==1)).map(item=>{
      const discountPercent=Math.max(0,Math.min(100,Math.floor(Number(item.discount_percent)||0)));
      return {...item,discount_percent:discountPercent,discounted_price:discountPercent>0?calculateDiscountedPrice(item.price,discountPercent):Number(item.price||0)};
    });
    const itemMap=new Map(visibleItems.map(i=>[i.id,i]));
    const myItems=(personalOwned.results||[]).map(x=>({...x,...(itemMap.get(x.item_id)||{})})).filter(x=>x.item_id&&itemMap.has(x.item_id));
    let cityInventory=[],territoryAwards=[],equippedMarkerItemId=null,bannerColor='none',bannerGradient='aurora';
    if(profileTerritoryId){
      const city=await env.DB.prepare('SELECT marker_item_id,banner_color,banner_gradient FROM city_customization WHERE territory_id=?').bind(profileTerritoryId).first();
      equippedMarkerItemId=city?.marker_item_id||null;
      bannerColor=city?.banner_color||'none';
      bannerGradient=city?.banner_gradient||'aurora';
      const managerIds=(await getTerritoryManagerRows(env,profileTerritoryId)).map(x=>Number(x.telegram_id)).filter(Boolean);
      const members=await env.DB.prepare('SELECT telegram_id FROM city_memberships WHERE territory_id=?').bind(profileTerritoryId).all();
      const ids=[...managerIds,...(members.results||[]).map(x=>Number(x.telegram_id)).filter(Boolean)].filter((x,i,a)=>a.indexOf(x)===i);
      const ph=ids.map(()=>'?').join(',')||'NULL';
      const [cityOnly,userOwned]=await Promise.all([
        env.DB.prepare(`SELECT ci.territory_id,ci.item_id,i.name,i.price,i.image_data,c.name AS category_name,i.categories_text,i.color,i.government_marker,i.hidden_from_users,ci.source FROM city_items ci JOIN customization_items i ON i.id=ci.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ci.territory_id=?`).bind(profileTerritoryId).all(),
        env.DB.prepare(`SELECT ui.telegram_id,ui.item_id,i.name,i.price,i.image_data,c.name AS category_name,i.categories_text,i.color,i.government_marker,i.hidden_from_users,ui.source FROM user_items ui JOIN customization_items i ON i.id=ui.item_id LEFT JOIN customization_categories c ON c.id=i.category_id WHERE ui.telegram_id IN (${ph})`).bind(...ids).all(),
      ]);
      cityInventory=[...(cityOnly.results||[]),...(userOwned.results||[])].filter((x,i,a)=>a.findIndex(y=>y.item_id===x.item_id)===i);
      territoryAwards=(await env.DB.prepare(`SELECT id,name,emoji,awarded_by_telegram_id,awarded_at,slot_index,sticker_format,sticker_thumbnail_file_id,sticker_set_name FROM territory_awards WHERE territory_id=? ORDER BY awarded_at DESC,id ASC`).bind(profileTerritoryId).all()).results||[];
      if(!equippedMarkerItemId){const first=await ensureFirstCityMarker(env,profileTerritoryId);equippedMarkerItemId=first?.id||null;}
    }
    return json({ok:true,balance,personalBalance:Number(personalBalance?.balance||0),accountScope,accountLabel:accountScope==='personal'?(currentUser?.mc_nickname||'Ник не указан'):`Казна: ${accountCity?.name||'город'}`,accountOptions:[{scope:'personal',label:currentUser?.mc_nickname||'Ник не указан'},...managerCities.map(c=>({scope:`treasury:${c.id}`,label:`Казна: ${c.name}`}))],managerCities,cityName:accountCity?.name||null,categories:cats.results||[],items:visibleItems,owned:owned.results||[],myItems,cityId:profileTerritoryId||null,cityRole:profileTerritoryId?'manager':null,cityInventory,territoryAwards,equippedAwards:territoryAwards.filter(award=>award.slot_index!==null&&award.slot_index!==undefined).sort((a,b)=>Number(a.slot_index)-Number(b.slot_index)),equippedMarkerItemId,bannerColor,bannerGradient});
  }
  
  function decodeDataUrl(dataUrl) {
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/s);
    if (!m) return null;
    try { return { mime: m[1].toLowerCase(), bytes: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)) }; }
    catch { return null; }
  }
  
  function imageDimensions(dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return null;
    const b = decoded.bytes;
    if (decoded.mime === 'image/png' && b.length >= 24 && b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71) {
      return { width: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], height: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
    }
    if ((decoded.mime === 'image/webp') && b.length >= 30 && b[0] === 82 && b[1] === 73 && b[2] === 70 && b[3] === 70) {
      if (b[12] === 86 && b[13] === 80 && b[14] === 56 && b[15] === 88 && b.length >= 30) {
        const width = 1 + b[24] + (b[25] << 8) + (b[26] << 16);
        const height = 1 + b[27] + (b[28] << 8) + (b[29] << 16);
        return { width, height };
      }
    }
    if (decoded.mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1]; i += 2;
        if (marker === 0xd8 || marker === 0xd9) continue;
        if (i + 1 >= b.length) break;
        const len = (b[i] << 8) | b[i + 1];
        if (marker >= 0xc0 && marker <= 0xc3 && i + 7 < b.length) {
          return { height: (b[i + 3] << 8) | b[i + 4], width: (b[i + 5] << 8) | b[i + 6] };
        }
        i += len;
      }
    }
    return null;
  }

  return { getCustomization };
}