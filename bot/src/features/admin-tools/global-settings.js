import { isSupportedTheme, normalizeThemeId as normalizeVoxygenTheme } from '../../../../shared/theme-catalog.js';
import { normalizeMapZoomPercent } from '../../../../shared/world-map-coordinates.js';

export const GLOBAL_SETTING_KEYS = new Set(['theme', 'map_zoom']);

export async function getAdminGlobalSettings(request, env, { requireMainInspector, ensureGlobalSettingsTable, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureGlobalSettingsTable(env);
  const rows = await env.DB.prepare(`SELECT setting_key,value,expires_at,updated_at,updated_by
    FROM global_setting_overrides WHERE setting_key IN ('map_zoom','theme')`).all();
  const now = Date.now();
  const accessRows=await env.DB.prepare('SELECT theme_id,visibility,usernames_json,updated_at,updated_by FROM theme_access_settings').all();
  const themeAccess=Object.fromEntries((accessRows.results||[]).map(row=>[String(row.theme_id),{
    visibility:row.visibility==='private'?'private':'public',
    usernames:(()=>{try{return JSON.parse(row.usernames_json||'[]').map(v=>String(v).replace(/^@+/,'').trim().toLowerCase()).filter(Boolean)}catch{return []}})(),
    updatedAt:Number(row.updated_at||0),updatedBy:Number(row.updated_by||0)
  }]));
  return json({
    ok: true,
    settings: (rows.results || []).map(row => ({
      key: row.setting_key,
      value: row.setting_key === 'map_zoom'
        ? normalizeMapZoomPercent(row.value)
        : normalizeVoxygenTheme(row.value),
      expiresAt: row.expires_at == null ? null : Number(row.expires_at),
      active: row.expires_at == null || Number(row.expires_at) > now,
      updatedAt: Number(row.updated_at || 0),
      updatedBy: Number(row.updated_by || 0),
    })),
    themeAccess,
  });
}

export async function saveAdminGlobalSetting(request, env, { requireMainInspector, ensureGlobalSettingsTable, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  await ensureGlobalSettingsTable(env);
  const requestHeaders = { 'X-Telegram-Init-Data': String(request.headers.get('X-Telegram-Init-Data') || body?.initData || '') };
  const refresh = () => getAdminGlobalSettings(new Request(request.url, { headers: requestHeaders }), env, { requireMainInspector, ensureGlobalSettingsTable, json });

  if(body?.themeAccess&&typeof body.themeAccess==='object'){
    const themeId=String(body.themeAccess.themeId||'').trim().toLowerCase();
    if(!isSupportedTheme(themeId))return json({ok:false,error:'Неизвестная тема оформления'},400);
    const visibility=body.themeAccess.visibility==='private'?'private':'public';
    const raw=Array.isArray(body.themeAccess.usernames)?body.themeAccess.usernames:[];
    const usernames=[...new Set(raw.map(value=>String(value||'').replace(/^@+/,'').trim().toLowerCase()).filter(value=>/^[a-z0-9_]{5,32}$/.test(value)))].slice(0,200);
    await env.DB.prepare(`INSERT INTO theme_access_settings(theme_id,visibility,usernames_json,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(theme_id) DO UPDATE SET visibility=excluded.visibility,usernames_json=excluded.usernames_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(themeId,visibility,JSON.stringify(usernames),Date.now(),Number(auth.user.id)).run();
    return refresh();
  }

  if (body?.clear === true) {
    const keys = body.key ? [String(body.key).trim()] : [...GLOBAL_SETTING_KEYS];
    if (keys.some(key => !GLOBAL_SETTING_KEYS.has(key))) return json({ ok: false, error: 'Неизвестная глобальная настройка' }, 400);
    await env.DB.batch(keys.map(key => env.DB.prepare('DELETE FROM global_setting_overrides WHERE setting_key=?').bind(key)));
    return refresh();
  }

  const rawSettings = body?.settings && typeof body.settings === 'object' && !Array.isArray(body.settings)
    ? body.settings
    : { [String(body?.key || '').trim()]: body?.value };
  const keys = Object.keys(rawSettings);
  if (!keys.length || keys.some(key => !GLOBAL_SETTING_KEYS.has(key))) {
    return json({ ok: false, error: 'Неизвестная глобальная настройка' }, 400);
  }

  let expiresAt = null;
  const now = Date.now();
  if (body?.permanent === true) {
    expiresAt = null;
  } else if (body?.expiresAt !== undefined) {
    const requestedExpiry = Number(body.expiresAt);
    const maxExpiry = now + 10 * 365 * 24 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(requestedExpiry) || requestedExpiry <= now || requestedExpiry > maxExpiry) {
      return json({ ok: false, error: 'Выберите будущую дату в пределах ближайших 10 лет или нажмите «Навсегда»' }, 400);
    }
    expiresAt = requestedExpiry;
  } else {
    const durationMinutes = body?.durationMinutes == null ? null : Number(body.durationMinutes);
    if (durationMinutes !== null && (!Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 5256000)) {
      return json({ ok: false, error: 'Срок действия должен быть от 1 минуты до 10 лет или «Навсегда»' }, 400);
    }
    expiresAt = durationMinutes === null ? null : now + durationMinutes * 60000;
  }

  const statements = [];
  for (const key of keys) {
    let value;
    if (key === 'map_zoom') {
      const raw = Number(rawSettings[key]);
      if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1 || raw > 100) {
        return json({ ok: false, error: 'Масштаб должен быть от 1 до 100%' }, 400);
      }
      value = String(normalizeMapZoomPercent(raw));
    } else {
      const theme = String(rawSettings[key] || '').trim().toLowerCase();
      if (!isSupportedTheme(theme)) return json({ ok: false, error: 'Неизвестная тема оформления' }, 400);
      value = normalizeVoxygenTheme(theme);
    }
    statements.push(env.DB.prepare(`INSERT INTO global_setting_overrides(setting_key,value,expires_at,updated_at,updated_by)
      VALUES(?,?,?,?,?) ON CONFLICT(setting_key) DO UPDATE SET value=excluded.value,
      expires_at=excluded.expires_at,updated_at=excluded.updated_at,updated_by=excluded.updated_by`)
      .bind(key, value, expiresAt, now, Number(auth.user.id)));
  }
  await env.DB.batch(statements);
  return refresh();
}
