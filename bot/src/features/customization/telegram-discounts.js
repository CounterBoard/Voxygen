function stripMinecraftFormatting(value) {
  return String(value ?? '')
    .replace(/§x(?:§[0-9a-fA-F]){6}/gi, '')
    .replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fA-Fk-oK-OrR])/g, '');
}

export function parseVisualDiscountCommand(raw) {
  const text=String(raw||'').trim();
  const match=text.match(/^(.+?)\s+([−-]?)(\d{1,3})%\s+(\d{1,6})\s*([мmчh])$/i);
  if(!match)return null;
  const percent=Number(match[3]),count=Number(match[4]),unit=String(match[5]).toLowerCase();
  if(!Number.isSafeInteger(percent)||percent<1||percent>100||!Number.isSafeInteger(count)||count<1)return null;
  const durationMs=count*(unit==='м'||unit==='m'?60_000:3_600_000);
  if(!Number.isSafeInteger(Date.now()+durationMs))return null;
  const targets=[...new Set(match[1].split(',').map(value=>stripMinecraftFormatting(value).trim()).filter(Boolean))];
  if(!targets.length)return null;
  const all=targets.some(value=>value.toLocaleLowerCase('ru-RU')==='все');
  return {targets,all,percent,mode:match[2]?'decrease':'set',durationMs,durationLabel:`${count}${unit==='м'||unit==='m'?'м':'ч'}`};
}

export function createVisualDiscountHandler({
  ensureWorldTables,
  normalizeVisualCommandText,
  stripMinecraftFormatting,
  visualHasTag,
  telegram,
  json,
} = {}) {
  async function handleVisualDiscountMessage(env,update,message,command) {
    const updateId=Number(update?.update_id),chatId=Number(message.chat?.id||message.from?.id||0),messageId=Number(message.message_id||0);
    if(!Number.isSafeInteger(updateId)||updateId<0||!chatId||!messageId)return json({ok:true,handled:'bank_discount_invalid_update'});
    await ensureWorldTables(env);
    const reply=async value=>{try{await telegram(env,'sendMessage',{chat_id:chatId,text:value,reply_to_message_id:messageId});}catch(error){console.error('Visual discount banker reply failed:',error);}};
    const items=(await env.DB.prepare(`SELECT i.id,i.name,i.categories_text,c.name AS category_name FROM customization_items i LEFT JOIN customization_categories c ON c.id=i.category_id WHERE i.active=1`).all()).results||[];
    const selected=command.all?items:items.filter(item=>{
      const name=stripMinecraftFormatting(String(item.name||'')).trim().toLocaleLowerCase('ru-RU');
      return command.targets.some(target=>target.toLocaleLowerCase('ru-RU')===name||visualHasTag(item,target));
    });
    const now=Date.now(),expiresAt=now+command.durationMs;
    const summary=command.all?'Все':command.targets.join(', ').slice(0,300);
    const statements=[
      env.DB.prepare(`INSERT OR IGNORE INTO visual_discount_operations(update_id,actor_telegram_id,mode,target_summary,percent,expires_at,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'processing',?,?)`).bind(updateId,Number(message.from.id),command.mode,summary,command.percent,expiresAt,now,now),
      env.DB.prepare(`UPDATE visual_discount_operations SET status='applying',updated_at=? WHERE update_id=? AND status='processing' AND changes()=1`).bind(now,updateId),
    ];
    if(selected.length){
      const placeholders=selected.map(()=>'?').join(',');
      const itemIds=selected.map(item=>item.id);
      if(command.mode==='set'){
        statements.push(env.DB.prepare(`INSERT INTO customization_discounts(item_id,percent,expires_at,updated_at,updated_by_telegram_id)
          SELECT id,?,?,?,? FROM customization_items WHERE active=1 AND id IN (${placeholders})
            AND EXISTS(SELECT 1 FROM visual_discount_operations WHERE update_id=? AND status='applying')
          ON CONFLICT(item_id) DO UPDATE SET percent=excluded.percent,expires_at=excluded.expires_at,updated_at=excluded.updated_at,updated_by_telegram_id=excluded.updated_by_telegram_id`)
          .bind(command.percent,expiresAt,now,Number(message.from.id),...itemIds,updateId));
      }else{
        statements.push(env.DB.prepare(`UPDATE customization_discounts SET percent=MAX(0,percent-?),expires_at=?,updated_at=?,updated_by_telegram_id=?
          WHERE item_id IN (${placeholders}) AND expires_at>?
            AND EXISTS(SELECT 1 FROM visual_discount_operations WHERE update_id=? AND status='applying')`)
          .bind(command.percent,expiresAt,now,Number(message.from.id),...itemIds,now,updateId));
        statements.push(env.DB.prepare(`DELETE FROM customization_discounts WHERE item_id IN (${placeholders}) AND percent<=0
          AND EXISTS(SELECT 1 FROM visual_discount_operations WHERE update_id=? AND status='applying')`)
          .bind(...itemIds,updateId));
      }
    }
    statements.push(env.DB.prepare(`UPDATE visual_discount_operations SET status='completed',updated_at=? WHERE update_id=? AND status='applying'`).bind(now,updateId));
    const batch=await env.DB.batch(statements);
    const operation=await env.DB.prepare('SELECT status FROM visual_discount_operations WHERE update_id=?').bind(updateId).first();
    const claimed=Number(batch?.[0]?.meta?.changes||0)>0&&Number(batch?.[1]?.meta?.changes||0)>0;
    if(!claimed){
      await reply(String(operation?.status||'')==='completed'?'🏦 Эта команда уже обработана.':'🏦 Команда скидки уже обрабатывается. Повторная обработка не запущена.');
      return json({ok:true,handled:'bank_visual_discount_duplicate'});
    }
    if(String(operation?.status||'')!=='completed'){
      await reply('🏦 Не удалось подтвердить применение скидки. Проверьте состояние операции.');
      return json({ok:true,handled:'bank_visual_discount_pending'});
    }
    if(!selected.length){
      await reply('🏦 Не найдено ни одного активного визуала по указанным названиям или тегам.');
      return json({ok:true,handled:'bank_visual_discount_no_matches'});
    }
    if(command.mode==='set'){
      await reply(`🏦 Скидка ${command.percent}% установлена для ${selected.length} визуалов на ${command.durationLabel}.`);
    }else{
      const placeholders=selected.map(()=>'?').join(',');
      const active=Number((await env.DB.prepare(`SELECT COUNT(*) AS count FROM customization_discounts WHERE item_id IN (${placeholders}) AND percent>0 AND expires_at>?`).bind(...selected.map(item=>item.id),now).first())?.count||0);
      const removed=Math.max(0,selected.length-active);
      await reply(`🏦 Скидка уменьшена на ${command.percent} п.п. для ${selected.length} визуалов. Скидка осталась у ${active}, удалено: ${removed}. Срок новой скидки: ${command.durationLabel}.`);
    }
    return json({ok:true,handled:command.mode==='set'?'bank_visual_discount_set':'bank_visual_discount_decrease',count:selected.length});
  }

  return handleVisualDiscountMessage;
}