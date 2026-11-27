export function parseVisualInventoryCandidates(rawText, items, normalizeVisualCommandText) {
  const text = normalizeVisualCommandText(rawText);
  if (!text) return [];
  const parsed = [];
  for (const item of items || []) {
    const name = normalizeVisualCommandText(item.name);
    if (!name) continue;
    const ending = text.endsWith(` -${name}`) ? { remove: true, token: ` -${name}` }
      : text.endsWith(`-${name}`) ? { remove: true, token: `-${name}` }
        : text.endsWith(` ${name}`) ? { remove: false, token: ` ${name}` } : null;
    if (ending && text.length > ending.token.length) {
      const rawTarget = text.slice(0, text.length - ending.token.length).trim();
      if (rawTarget) parsed.push({ item, name, remove: ending.remove, rawTarget });
    }
    const beginning = text.startsWith(`-${name} `) ? { remove: true, token: `-${name} ` }
      : text.startsWith(`${name} `) ? { remove: false, token: `${name} ` } : null;
    if (beginning && text.length > beginning.token.length) {
      const rawTarget = text.slice(beginning.token.length).trim();
      if (rawTarget) parsed.push({ item, name, remove: beginning.remove, token: beginning.token, rawTarget });
    }
  }
  return parsed;
}

export function createVisualInventoryHandler({
  ensureWorldTables,
  ensureUserDirectoryTable,
  normalizeVisualCommandText,
  stripMinecraftFormatting,
  reconcileTerritoryVisualEquipment,
  evaluateAchievementsForTerritory,
  ensureFirstCityMarker,
  escapeHtml,
  formatTelegramNickname,
  telegram,
  json,
} = {}) {
  async function resolveVisualCommandTarget(env, rawTarget) {
    const target=normalizeVisualCommandText(rawTarget).replace(/^@+/,'');
    if(!target)return {kind:'none',matches:[]};
    const cities=await env.DB.prepare(`SELECT id,name FROM territories WHERE status='approved'`).all();
    const territoryMatches=(cities.results||[]).filter(row=>normalizeVisualCommandText(row.name)===target)
      .map(row=>({kind:'territory',id:String(row.id),name:String(row.name||'')}));
    await ensureUserDirectoryTable(env);
    const users=await env.DB.prepare(`
      SELECT telegram_id,telegram_username,mc_nickname FROM users
        WHERE lower(trim(COALESCE(mc_nickname,'')))=?
           OR lower(replace(trim(COALESCE(telegram_username,'')),'@',''))=?
      UNION
      SELECT telegram_id,telegram_username,mc_nickname FROM user_directory
        WHERE lower(trim(COALESCE(mc_nickname,'')))=?
           OR lower(replace(trim(COALESCE(telegram_username,'')),'@',''))=?
    `).bind(target,target,target,target).all();
    const byId=new Map();
    for(const row of users.results||[]){
      const id=Number(row.telegram_id); if(!Number.isSafeInteger(id)||id<=0)continue;
      if(!byId.has(id))byId.set(id,{kind:'user',id,name:String(row.mc_nickname||row.telegram_username||`id${id}`),telegram_username:row.telegram_username||null,mc_nickname:row.mc_nickname||null});
    }
    // Territory names take precedence over a same-spelled player nickname, which is
    // important for commands such as `City -Visual` when the city's stored name has colours.
    if (territoryMatches.length) return { matches: territoryMatches };
    return {matches:[...byId.values()]};
  }

  async function handleVisualInventoryCommand(env, message, rawText) {
    
      const text = normalizeVisualCommandText(rawText);
      if (!text) return null;
      await ensureWorldTables(env);
      const rows = await env.DB.prepare(`SELECT id,name,active FROM customization_items ORDER BY length(name) DESC,created_at ASC`).all();
      const items = rows.results || [];
      const parsed = parseVisualInventoryCandidates(text, items);
      if (!parsed.length) return null;
      // Longest exact visual name wins; this prevents a shorter visual suffix from
      // capturing commands intended for a longer item name.
      const longest = Math.max(...parsed.map(item => item.name.length));
      const best = parsed.filter(item => item.name.length === longest);
      const candidates = [];
      for (const candidate of best) {
        const resolved = await resolveVisualCommandTarget(env, candidate.rawTarget);
        if (resolved.matches.length === 1) candidates.push({ ...candidate, target: resolved.matches[0] });
        else if (resolved.matches.length > 1) candidates.push({ ...candidate, target: null, ambiguousTarget: true });
        else candidates.push({ ...candidate, target: null, unknownTarget: true });
      }
      const valid = candidates.filter(item => item.target);
      const distinct = new Map(valid.map(item => [`${item.remove ? 'remove' : 'grant'}:${item.target.kind}:${item.target.id}:${item.item.id}`, item]));
      if (distinct.size > 1) {
        await telegram(env, 'sendMessage', { chat_id: Number(message.chat.id), text: '⚠️ Команда неоднозначна: найдено несколько совпадений. Проверьте точное название территории/никнейм и название визуала.' });
        return json({ ok: true, handled: 'visual_inventory_ambiguous' });
      }
        let command=[...distinct.values()][0];
      if(!command){
        const unresolved=candidates[0];
        const note=unresolved.ambiguousTarget?'⚠️ Найдено несколько пользователей/территорий с таким именем. Уточните получателя.':'⚠️ Не удалось найти получателя. Используйте точное название одобренной территории, Minecraft-ник или Telegram username.';
        await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:note});
        return json({ok:true,handled:'visual_inventory_target_not_found'});
      }
      const target=command.target,item=command.item,now=Date.now();
      const dbName=String(item.name||'').trim();
      if (!command.remove && Number(item.active ?? 1) !== 1) {
        await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:`⚠️ Визуал «${String(item.name||'').trim()}» неактивен и не может быть выдан.`});
        return json({ok:true,handled:'visual_inventory_item_inactive'});
      }
      if(target.kind==='territory'){
        if(command.remove){
          const changed=await env.DB.prepare(`DELETE FROM city_items WHERE territory_id=? AND item_id=?`).bind(target.id,item.id).run();
          await reconcileTerritoryVisualEquipment(env,target.id);
          await evaluateAchievementsForTerritory(env,target.id).catch(error=>console.error('Achievement check after inspector visual removal:',error));
          const outcome=changed.meta?.changes?'отнят':'не найден в инвентаре территории';
          await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:`${changed.meta?.changes?'✅':'ℹ️'} Визуал «${dbName}» ${outcome}: территория «${target.name}».`});
          return json({ok:true,handled:'visual_inventory_removed',target:'territory'});
        }
        const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO city_items(territory_id,item_id,acquired_at,source) VALUES(?,?,?,'main_inspector')`).bind(target.id,item.id,now).run();
        await ensureFirstCityMarker(env,target.id).catch(error=>console.error('Marker setup after inspector visual grant:',error));
        await evaluateAchievementsForTerritory(env,target.id).catch(error=>console.error('Achievement check after inspector visual grant:',error));
        await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:`${inserted.meta?.changes?'✅':'ℹ️'} Визуал «${dbName}» ${inserted.meta?.changes?'выдан':'уже есть'} территории «${target.name}».`});
        return json({ok:true,handled:'visual_inventory_granted',target:'territory'});
      }
      if(command.remove){
        const affected=await env.DB.prepare(`
          SELECT territory_id FROM city_memberships WHERE telegram_id=?
          UNION SELECT territory_id FROM territory_managers WHERE telegram_id=?
          UNION SELECT id AS territory_id FROM territories WHERE owner_telegram_id=? AND status='approved'
          UNION SELECT territory_id FROM city_customization WHERE marker_item_id IN (SELECT item_id FROM user_items WHERE telegram_id=?)
        `).bind(Number(target.id),Number(target.id),Number(target.id),Number(target.id)).all();
        const changed=await env.DB.prepare(`DELETE FROM user_items WHERE telegram_id=? AND item_id=?`).bind(Number(target.id),item.id).run();
        for(const row of affected.results||[])await reconcileTerritoryVisualEquipment(env,row.territory_id).catch(error=>console.error('Equipment reconciliation after personal visual removal:',error));
        await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:`${changed.meta?.changes?'✅':'ℹ️'} Визуал «${escapeHtml(dbName)}» ${changed.meta?.changes?'отнят':'не найден в личном инвентаре'} у пользователя ${formatTelegramNickname(target.name)}.`,parse_mode:'HTML'});
        return json({ok:true,handled:'visual_inventory_removed',target:'user'});
      }
      const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO user_items(telegram_id,item_id,acquired_at,source) SELECT ?,?,?, 'main_inspector' WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)`).bind(Number(target.id),item.id,now,Number(target.id)).run();
      const inventoryMessage=inserted.meta?.changes?'выдан':(await env.DB.prepare(`SELECT 1 FROM account_deletion_locks WHERE telegram_id=?`).bind(Number(target.id)).first())?'не выдан: аккаунт находится в процессе удаления':'уже есть';
      await telegram(env,'sendMessage',{chat_id:Number(message.chat.id),text:`${inserted.meta?.changes?'✅':'ℹ️'} Визуал «${escapeHtml(dbName)}» ${inventoryMessage} пользователю ${formatTelegramNickname(target.name)}.`,parse_mode:'HTML'});
      return json({ok:true,handled:'visual_inventory_granted',target:'user'});
  }

  return handleVisualInventoryCommand;
}