import { THEME_CATALOG, normalizeThemeId as normalizeVoxygenTheme } from '../../../../shared/theme-catalog.js';
import { normalizeMapZoomPercent } from '../../../../shared/world-map-coordinates.js';

export const USER_DEFAULT_TIMEZONE = 'UTC+3';

function normalizeUserTimezone(value) {
  const raw = String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().toUpperCase();
  const offset = raw.startsWith('UTC') ? raw.slice(3).trim() : raw;
  const match = offset.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return 'UTC+3';

  const sign = match[1];
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  const maxHours = sign === '-' ? 12 : 14;
  if (hours > maxHours || minutes % 15 !== 0 || minutes >= 60) return 'UTC+3';
  if ((hours === 14 && (sign !== '+' || minutes !== 0)) || (sign === '-' && hours === 12 && minutes !== 0)) return 'UTC+3';

  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

export async function getUserSettings(request, env, dependencies) {
  const { requireUser, ensureWorldTables, ensureUserPreferenceTables, ensureGlobalSettingsTable, readGlobalSettingOverrides, getRoleByTelegramId, json } = dependencies;
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  const uid = Number(auth.user.id);
  await ensureWorldTables(env);
  await ensureUserPreferenceTables(env);
  await ensureGlobalSettingsTable(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO user_preferences(telegram_id,default_theme,timezone,all_notifications,event_notifications,map_zoom_percent,updated_at) VALUES(?,'vox','UTC+3',1,0,88,?)`).bind(uid, Date.now()).run();
  const [settings, globalOverrides,themeAccessRows,userRow] = await Promise.all([
    env.DB.prepare(`SELECT default_theme,timezone,all_notifications,event_notifications,map_zoom_percent,map_zoom_global_updated_at,theme_global_updated_at FROM user_preferences WHERE telegram_id=? LIMIT 1`).bind(uid).first(),
    readGlobalSettingOverrides(env),
    env.DB.prepare('SELECT theme_id,visibility,usernames_json FROM theme_access_settings').all(),
    env.DB.prepare('SELECT telegram_username FROM users WHERE telegram_id=? LIMIT 1').bind(uid).first(),
  ]);
  const territories = await env.DB.prepare(`SELECT t.id,t.name,
      CASE WHEN t.owner_telegram_id=? OR EXISTS(SELECT 1 FROM territory_managers tm WHERE tm.territory_id=t.id AND tm.telegram_id=?) THEN 1 ELSE 0 END AS is_manager,
      EXISTS(SELECT 1 FROM city_memberships cm WHERE cm.territory_id=t.id AND cm.telegram_id=?) AS is_member,
      p.enabled AS preference_enabled
    FROM territories t LEFT JOIN territory_notification_preferences p ON p.territory_id=t.id AND p.telegram_id=?
    WHERE t.status='approved' AND (t.owner_telegram_id=? OR EXISTS(SELECT 1 FROM territory_managers tm WHERE tm.territory_id=t.id AND tm.telegram_id=?) OR EXISTS(SELECT 1 FROM city_memberships cm WHERE cm.territory_id=t.id AND cm.telegram_id=?))
    ORDER BY t.name COLLATE NOCASE ASC`).bind(uid,uid,uid,uid,uid,uid,uid).all();
  const personalMapZoomPercent = normalizeMapZoomPercent(settings?.map_zoom_percent ?? 88);
  const personalTheme = normalizeVoxygenTheme(settings?.default_theme ?? 'vox');
  const personalZoomOptedOut = Number(settings?.map_zoom_global_updated_at || 0) === Number(globalOverrides.mapZoomPercent?.updatedAt || -1);
  const personalThemeOptedOut = Number(settings?.theme_global_updated_at || 0) === Number(globalOverrides.theme?.updatedAt || -1);
  const effectiveZoom = globalOverrides.mapZoomPercent && !personalZoomOptedOut ? globalOverrides.mapZoomPercent.value : personalMapZoomPercent;
  const username=String(auth.user.username||userRow?.telegram_username||'').replace(/^@+/,'').trim().toLowerCase();
  const userRole=await getRoleByTelegramId(env,uid,auth.user.username||'');
  const isMainInspector=userRole==='main_inspector';
  const accessRows=themeAccessRows.results||[];
  const availableThemes=Object.keys(THEME_CATALOG).filter(themeId=>{
    if(isMainInspector)return true;
    const rule=accessRows.find(row=>String(row.theme_id)===themeId);
    if(!rule)return true;
    const names=(()=>{try{return JSON.parse(rule.usernames||rule.usernames_json||'[]').map(v=>String(v).replace(/^@+/,'').trim().toLowerCase())}catch{return []}})();
    const named=Boolean(username&&names.includes(username));
    return rule.visibility==='private'?named:!named;
  });
  if(!availableThemes.includes('vox'))availableThemes.unshift('vox');
  const safePersonalTheme=availableThemes.includes(personalTheme)?personalTheme:'vox';
  if(safePersonalTheme!==personalTheme)await env.DB.prepare('UPDATE user_preferences SET default_theme=?,updated_at=? WHERE telegram_id=?').bind('vox',Date.now(),uid).run();
  const effectiveThemeCandidate = globalOverrides.theme && !personalThemeOptedOut ? globalOverrides.theme.value : safePersonalTheme;
  const effectiveTheme=availableThemes.includes(effectiveThemeCandidate)?effectiveThemeCandidate:'vox';
  return json({ ok: true, settings: {
    defaultTheme: effectiveTheme,
    theme: effectiveTheme,
    personalTheme:safePersonalTheme,
    availableThemes,
    personalMapZoomPercent,
    mapZoomPercent: effectiveZoom,
    globalOverrides,
    timezone: normalizeUserTimezone(settings?.timezone || 'UTC+3'),
    // Kept in the response for older clients; the global notification switch is retired.
    allNotifications: true,
    eventNotifications: Number(settings?.event_notifications ?? 0) === 1,
    territories: (territories.results || []).map(row => ({
      id: String(row.id), name: String(row.name || ''), role: Number(row.is_manager || 0) ? 'manager' : 'resident',
      enabled: (row.preference_enabled === null || row.preference_enabled === undefined)
        ? Number(row.is_manager || 0) === 1
        : Number(row.preference_enabled) === 1,
    }))
  }});
}

export async function saveUserSettings(request, env, dependencies) {
  const { requireUser, ensureWorldTables, ensureUserPreferenceTables, readGlobalSettingOverrides, getRoleByTelegramId, ensureGlobalSettingsTable, json } = dependencies;
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const uid = Number(auth.user.id), now = Date.now();
  await ensureWorldTables(env);
  await ensureUserPreferenceTables(env);
  // Older open Mini App sessions may still submit only timezone/notification
  // fields. Preserve newer personal settings when those fields are omitted.
  const existing = await env.DB.prepare(`SELECT default_theme,timezone,event_notifications,map_zoom_percent
    FROM user_preferences WHERE telegram_id=? LIMIT 1`).bind(uid).first();
  const activeGlobal = await readGlobalSettingOverrides(env, now);
  const submittedTheme = body?.personalThemeChanged === true;
  const submittedZoom = body?.personalMapZoomChanged === true;
  const themeGlobalMarker = submittedTheme && activeGlobal.theme ? Number(activeGlobal.theme.updatedAt) : 0;
  const zoomGlobalMarker = submittedZoom && activeGlobal.mapZoomPercent ? Number(activeGlobal.mapZoomPercent.updatedAt) : 0;
  const defaultTheme = normalizeVoxygenTheme(body?.defaultTheme ?? existing?.default_theme ?? 'vox');
  const timezone = normalizeUserTimezone(body?.timezone ?? existing?.timezone ?? 'UTC+3');
  const mapZoomPercent = normalizeMapZoomPercent(body?.mapZoomPercent ?? existing?.map_zoom_percent ?? 88);
  // The former global switch is retired; preserve the column for DB compatibility.
  const allNotifications = 1;
  const eventNotifications = body?.eventNotifications === undefined
    ? Number(existing?.event_notifications ?? 0)
    : body.eventNotifications === true ? 1 : 0;
  await env.DB.prepare(`INSERT INTO user_preferences(telegram_id,default_theme,timezone,all_notifications,event_notifications,map_zoom_percent,map_zoom_global_updated_at,theme_global_updated_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(telegram_id) DO UPDATE SET default_theme=excluded.default_theme,timezone=excluded.timezone,all_notifications=excluded.all_notifications,event_notifications=excluded.event_notifications,map_zoom_percent=excluded.map_zoom_percent,
    map_zoom_global_updated_at=CASE WHEN ? THEN excluded.map_zoom_global_updated_at ELSE user_preferences.map_zoom_global_updated_at END,
    theme_global_updated_at=CASE WHEN ? THEN excluded.theme_global_updated_at ELSE user_preferences.theme_global_updated_at END,
    updated_at=excluded.updated_at`)
    .bind(uid, defaultTheme, timezone, allNotifications, eventNotifications, mapZoomPercent, zoomGlobalMarker, themeGlobalMarker, now, submittedZoom?1:0, submittedTheme?1:0).run();
  const allowedRows = await env.DB.prepare(`SELECT t.id FROM territories t WHERE t.status='approved' AND (t.owner_telegram_id=? OR EXISTS(SELECT 1 FROM territory_managers tm WHERE tm.territory_id=t.id AND tm.telegram_id=?) OR EXISTS(SELECT 1 FROM city_memberships cm WHERE cm.territory_id=t.id AND cm.telegram_id=?))`).bind(uid,uid,uid).all();
  const allowed = new Set((allowedRows.results || []).map(row => String(row.id)));
  for (const item of (Array.isArray(body?.territories) ? body.territories : [])) {
    const tid = String(item?.id || '').trim();
    if (!tid || !allowed.has(tid)) continue;
    const enabled = item.enabled === true ? 1 : 0;
    await env.DB.prepare(`INSERT INTO territory_notification_preferences(telegram_id,territory_id,enabled,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(telegram_id,territory_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at`).bind(uid,tid,enabled,now).run();
  }
  const settingsRequest = new Request(request.url, { method: 'GET', headers: { 'X-Telegram-Init-Data': String(request.headers.get('X-Telegram-Init-Data') || body?.initData || '') } });
  return getUserSettings(settingsRequest, env, dependencies);
}
