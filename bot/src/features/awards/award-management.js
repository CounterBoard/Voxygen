export async function getAdminAwards(request, env, { requireMainInspector, ensureWorldTables, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  const awardRows = await env.DB.prepare(`SELECT a.id,a.territory_id,t.name AS territory_name,a.name,a.emoji,a.awarded_at,a.slot_index,a.sticker_format,a.sticker_set_name,a.sticker_thumbnail_file_id
    FROM territory_awards a JOIN territories t ON t.id=a.territory_id
    ORDER BY a.awarded_at DESC,a.id ASC`).all();
  if (new URL(request.url).searchParams.get('view') === 'issued') {
    return json({ ok: true, awards: awardRows.results || [] });
  }
  const [packRows, stickerRows] = await Promise.all([
    env.DB.prepare(`SELECT id,set_name,title,created_at FROM telegram_award_packs ORDER BY created_at DESC,id ASC`).all(),
    env.DB.prepare(`SELECT id,pack_id,emoji,custom_emoji_id,format,thumbnail_file_id,width,height FROM telegram_award_pack_stickers ORDER BY rowid ASC`).all(),
  ]);
  const stickersByPack = new Map();
  for (const sticker of stickerRows.results || []) {
    if (!stickersByPack.has(sticker.pack_id)) stickersByPack.set(sticker.pack_id, []);
    stickersByPack.get(sticker.pack_id).push(sticker);
  }
  const packs = (packRows.results || []).map(pack => ({ ...pack, stickers: stickersByPack.get(pack.id) || [] }));
  return json({ ok: true, packs, awards: awardRows.results || [] });
}

export async function addTelegramAwardPack(request, env, { requireMainInspector, ensureWorldTables, json, telegram, parseTelegramEmojiSetName, isTelegramCustomEmojiSet, getTelegramStickerFormat }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const setName = parseTelegramEmojiSetName(body?.url);
  if (!setName) return json({ ok: false, error: 'Укажите публичную ссылку вида https://t.me/addemoji/НазваниеНабора' }, 400);
  await ensureWorldTables(env);
  const exists = await env.DB.prepare(`SELECT id FROM telegram_award_packs WHERE lower(set_name)=lower(?) LIMIT 1`).bind(setName).first();
  if (exists) return json({ ok: false, error: 'Этот эмодзи-пак уже добавлен' }, 409);
  let result;
  try { result = await telegram(env, 'getStickerSet', { name: setName }); }
  catch { return json({ ok: false, error: 'Не удалось получить эмодзи-пак из Telegram' }, 502); }
  const stickerSet = result.data?.result;
  if (!result.response.ok || !result.data?.ok || !Array.isArray(stickerSet?.stickers)) {
    return json({ ok: false, error: 'Telegram не нашёл этот набор. Проверьте ссылку и доступность пакета.' }, 404);
  }
  if (!isTelegramCustomEmojiSet(stickerSet)) {
    return json({ ok: false, error: 'Ссылка должна вести на набор пользовательских эмодзи, а не обычных стикеров' }, 400);
  }
  const sourceStickers = stickerSet.stickers.filter(sticker => sticker?.file_id && sticker?.file_unique_id);
  if (!sourceStickers.length) return json({ ok: false, error: 'В этом наборе нет доступных эмодзи' }, 400);
  if (sourceStickers.length > 500) return json({ ok: false, error: 'В наборе слишком много элементов для добавления' }, 400);
  const packId = crypto.randomUUID();
  const now = Date.now();
  const title = String(stickerSet.title || setName).trim().slice(0, 100) || setName;
  await env.DB.prepare(`INSERT INTO telegram_award_packs(id,set_name,title,added_by_telegram_id,created_at) VALUES(?,?,?,?,?)`)
    .bind(packId, setName, title, Number(auth.user.id), now).run();
  try {
    const statements = sourceStickers.map(sticker => env.DB.prepare(`INSERT OR IGNORE INTO telegram_award_pack_stickers
      (id,pack_id,file_id,file_unique_id,emoji,custom_emoji_id,format,thumbnail_file_id,width,height)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), packId, sticker.file_id, sticker.file_unique_id,
        String(sticker.emoji || '').slice(0, 32) || null,
        sticker.custom_emoji_id ? String(sticker.custom_emoji_id) : null,
        getTelegramStickerFormat(sticker),
        sticker.thumbnail?.file_id || null,
        Number.isFinite(Number(sticker.width)) ? Number(sticker.width) : null,
        Number.isFinite(Number(sticker.height)) ? Number(sticker.height) : null
      ));
    for (let offset = 0; offset < statements.length; offset += 40) {
      await env.DB.batch(statements.slice(offset, offset + 40));
    }
  } catch (error) {
    await env.DB.prepare(`DELETE FROM telegram_award_pack_stickers WHERE pack_id=?`).bind(packId).run().catch(() => {});
    await env.DB.prepare(`DELETE FROM telegram_award_packs WHERE id=?`).bind(packId).run().catch(() => {});
    console.error('Telegram award pack save failed:', String(error?.message || error).slice(0, 180));
    return json({ ok: false, error: 'Не удалось сохранить состав эмодзи-пака' }, 500);
  }
  return json({ ok: true, packId, title, setName, stickersCount: sourceStickers.length });
}

export async function deleteTelegramAwardPack(request, env, packId, { requireMainInspector, ensureWorldTables, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  const pack = await env.DB.prepare(`SELECT id FROM telegram_award_packs WHERE id=? LIMIT 1`).bind(packId).first();
  if (!pack) return json({ ok: false, error: 'Эмодзи-пак не найден' }, 404);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM telegram_award_pack_stickers WHERE pack_id=?`).bind(packId),
    env.DB.prepare(`DELETE FROM telegram_award_packs WHERE id=?`).bind(packId),
  ]);
  return json({ ok: true, deleted: true });
}

export async function grantTerritoryAward(request, env, { requireMainInspector, ensureWorldTables, json, notifyTerritoryManagers, escapeHtml }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const territoryId = String(body?.territoryId || '').trim();
  const stickerId = String(body?.stickerId || '').trim();
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ');
  const awardedAt = Number(body?.awardedAt);
  if (!territoryId || !stickerId || !name || name.length > 80 || !Number.isSafeInteger(awardedAt) || awardedAt <= 0) {
    return json({ ok: false, error: 'Выберите город и эмодзи, укажите название награды и корректную дату' }, 400);
  }
  await ensureWorldTables(env);
  const [territory, sticker] = await Promise.all([
    env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved' LIMIT 1`).bind(territoryId).first(),
    env.DB.prepare(`SELECT s.file_id,s.file_unique_id,s.emoji,s.custom_emoji_id,s.format,s.thumbnail_file_id,p.set_name
      FROM telegram_award_pack_stickers s JOIN telegram_award_packs p ON p.id=s.pack_id
      WHERE s.id=? LIMIT 1`).bind(stickerId).first(),
  ]);
  if (!territory) return json({ ok: false, error: 'Выбранный город не найден или не опубликован' }, 404);
  if (!sticker?.file_id) return json({ ok: false, error: 'Выбранный эмодзи больше недоступен. Обновите список паков.' }, 404);
  const normalizedName = name.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
  const awardId = crypto.randomUUID();
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO territory_awards
    (id,territory_id,name,name_key,emoji,awarded_by_telegram_id,awarded_at,slot_index,
      sticker_file_id,sticker_file_unique_id,sticker_format,sticker_thumbnail_file_id,sticker_set_name,custom_emoji_id)
    VALUES(?,?,?,?,?,?,?,NULL,?,?,?,?,?,?)`).bind(
      awardId, territoryId, name, normalizedName, String(sticker.emoji || '✨'),
      Number(auth.user.id), awardedAt, sticker.file_id, sticker.file_unique_id,
      sticker.format, sticker.thumbnail_file_id || null, sticker.set_name, sticker.custom_emoji_id || null
    ).run();
  if (!Number(inserted.meta?.changes || 0)) {
    return json({ ok: false, error: 'У этого города уже есть награда с таким названием' }, 409);
  }
  const notificationText = `🏆 <b>${escapeHtml(territory.name)}</b> получил(а) награду «${escapeHtml(name)}»

<i>Экипированные награды появляются на странице территории</i>`;
  await notifyTerritoryManagers(env, territoryId, notificationText);
  return json({ ok: true, awardId, territoryId, territoryName: territory.name, name, awardedAt });
}

export async function deleteTerritoryAwardById(request, env, awardId, { requireMainInspector, ensureWorldTables, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  const award = await env.DB.prepare(`SELECT territory_id,slot_index FROM territory_awards WHERE id=? LIMIT 1`).bind(awardId).first();
  if (!award) return json({ ok: false, error: 'Выданная награда не найдена' }, 404);
  const statements = [env.DB.prepare(`DELETE FROM territory_awards WHERE id=?`).bind(awardId)];
  if (award.slot_index !== null && award.slot_index !== undefined) {
    statements.push(env.DB.prepare(`UPDATE territory_awards SET slot_index=slot_index-1 WHERE territory_id=? AND slot_index>?`).bind(award.territory_id, Number(award.slot_index)));
  }
  await env.DB.batch(statements);
  return json({ ok: true, deleted: true, awardId });
}
