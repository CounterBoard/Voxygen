// Voxygen-Version: v54
// ============================================================
// VOXYGEN BACKEND
// v43: GitHub Releases is the only map-file storage; D1 stores only its URL and content type
// Cloudflare Worker + D1 + Telegram Mini App
// ============================================================

import {
  isValidWorldCoordinate,
  worldCoordinateToPercent,
  normalizeMapZoomPercent,
} from '../../shared/world-map-coordinates.js';
import { THEME_CATALOG, isSupportedTheme, normalizeThemeId as normalizeVoxygenTheme } from '../../shared/theme-catalog.js';
import { json, withCors } from './shared/responses.js';
import { verifyInitData, getCurrentUser } from './auth/telegram.js';
import { createPermissions } from './auth/permissions.js';
import { TELEGRAM_API, telegram } from './telegram/api.js';
import { formatTelegramNickname } from './telegram/formatting.js';
import { createTelegramWebhookHandler } from './telegram/webhook.js';
import { createEventsService } from './features/events/service.js';
import { createTreasuryService } from './features/treasury/service.js';
import { createAchievementService, achievementPayload, achievementRequirementError } from './features/customization/achievements.js';
import { createCustomizationAdminService } from './features/customization/admin-service.js';
import { createCustomizationCatalogService } from './features/customization/catalog-service.js';
import { createCityAppearanceService } from './features/customization/city-appearance-service.js';
import { createVisualEquipmentService, visualHasTag } from './features/customization/visual-equipment-service.js';
import { createCustomizationImageService } from './features/customization/image-service.js';
import { cleanupCustomizationCategories } from './features/customization/category-maintenance.js';
import { createManagerChangeService } from './features/territories/manager-change-service.js';
import { createTerritoryFeedbackService } from './features/territories/feedback-service.js';
import { createTerritoryScreenshotsService } from './features/territories/screenshots-service.js';
import { createTerritoryMembershipService } from './features/territories/membership-service.js';
import { createManagerChangeVotingService } from './features/territories/manager-change-voting-service.js';
import { createCustomizationPurchaseService } from './features/customization/purchase-service.js';
import { createVisualDiscountHandler, parseVisualDiscountCommand } from './features/customization/telegram-discounts.js';
import { createVisualInventoryHandler, parseVisualInventoryCandidates as parseVisualInventoryCandidatesFromFeature } from './features/customization/telegram-inventory.js';
import { createTelegramBankHandler, parseBankCommand, isPrivateBankerMessage, applyBankBalanceChange } from './features/treasury/telegram-bank.js';
import { createGemWithdrawalHandler, formatGemWithdrawalBankerNotification, parseGemWithdrawalCommand } from './features/treasury/telegram-withdrawal.js';
import { createDatabaseInitialization } from './db/initialization.js';
import { parseRequestCoords, parseTwoCoordinates } from './shared/validation.js';
import { getD1Diagnostics } from './features/diagnostics/d1-diagnostics.js';
import { GLOBAL_SETTING_KEYS, getAdminGlobalSettings, saveAdminGlobalSetting } from './features/admin-tools/global-settings.js';
import {
  getFaq,
  saveFaq,
  getHomeFeatureButton,
  saveHomeFeatureButton,
} from './features/admin-tools/site-content.js';
import {
  isSafeTelegramTgsAnimation,
  parseTelegramEmojiSetName,
  isTelegramCustomEmojiSet,
  getTelegramStickerFormat,
  getTelegramStickerFileExtension,
  isTelegramStickerExtensionAllowed,
  serveTelegramAwardSticker,
} from './features/awards/sticker-delivery.js';
import {
  getAdminAwards,
  addTelegramAwardPack,
  deleteTelegramAwardPack,
  grantTerritoryAward,
  deleteTerritoryAwardById,
} from './features/awards/award-management.js';
import { createTerritoryAwardPlacementService } from './features/awards/placement-service.js';
export {
  isSafeTelegramTgsAnimation,
  parseTelegramEmojiSetName,
  isTelegramCustomEmojiSet,
  getTelegramStickerFormat,
  getTelegramStickerFileExtension,
  isTelegramStickerExtensionAllowed,
};


const {
  ensureWorldTables,
  ensureManagerChangeTables,
  ensureRecruitmentTable,
  ensureMapSettingsTable,
  ensureApprovalSessionsTable,
  ensureUserPreferenceTables,
  ensureGlobalSettingsTable,
  ensureUserDirectoryTable,
  ensureEventsTables,
} = createDatabaseInitialization({
  cleanupCustomizationCategories,
});
const {
  getRoleByTelegramId,
  requireUser,
  requireVerifiedUser,
  requireMainInspector,
  isInspector,
  isTerritoryManager,
} = createPermissions({ getCurrentUser, json, ensureWorldTables });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function stripMinecraftFormatting(value) {
  return String(value ?? '')
    .replace(/§x(?:§[0-9a-fA-F]){6}/gi, '')
    .replace(/§(?:#[0-9a-fA-F]{6}|[0-9a-fA-Fk-oK-OrR])/g, '');
}

function formatTerritoryCoords(raw) {
  const value=String(raw??'').trim().replace(/−/g,'-');
  const parsed=parseRequestCoords(value);
  if(parsed)return `${parsed.x} / ${parsed.z}`;
  return value||'Координаты не указаны';
}


function normalizeUsername(username) {
  const value = String(username || "").trim().replace(/^@+/, "");
  return value ? `@${value}` : "";
}

async function getTerritoryManagerRows(env, territoryId) {
  const tid=String(territoryId||'').trim();
  if(!tid)return [];
  const territory=await env.DB.prepare(`SELECT id,owner_telegram_id,owner_telegram_username FROM territories WHERE id=? AND status='approved'`).bind(tid).first();
  if(!territory)return [];
  const rows=await env.DB.prepare(`
    SELECT tm.telegram_id,tm.granted_by,tm.granted_at,u.telegram_username,u.mc_nickname,u.xuid,u.skin_texture_id
    FROM territory_managers tm LEFT JOIN users u ON u.telegram_id=tm.telegram_id
    WHERE tm.territory_id=? ORDER BY tm.granted_at ASC
  `).bind(tid).all();
  const result=[];
  if(territory.owner_telegram_id){
    const owner=await env.DB.prepare(`SELECT telegram_username,mc_nickname,xuid,skin_texture_id FROM users WHERE telegram_id=?`).bind(Number(territory.owner_telegram_id)).first();
    result.push({telegram_id:Number(territory.owner_telegram_id),telegram_username:owner?.telegram_username||territory.owner_telegram_username||null,mc_nickname:owner?.mc_nickname||null,xuid:owner?.xuid||null,skin_texture_id:owner?.skin_texture_id||null,skin_url:skinUrlFromTexture(owner?.skin_texture_id,owner?.mc_nickname),role:'founder'});
  }
  for(const r of rows.results||[]) if(!result.some(x=>String(x.telegram_id)===String(r.telegram_id))) result.push({...r,skin_url:skinUrlFromTexture(r.skin_texture_id,r.mc_nickname),role:'founder'});
  return result;
}

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

function formatEventTimeForUser(timestamp, timezoneOffset) {
  const normalized = normalizeUserTimezone(timezoneOffset || 'UTC+3');
  const match = normalized.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/);
  const sign = match?.[1] === '-' ? -1 : 1;
  const minutes = sign * (Number(match?.[2] || 3) * 60 + Number(match?.[3] || 0));
  const shifted = new Date(Number(timestamp) + minutes * 60000);
  if (Number.isNaN(shifted.getTime())) return 'Дата не указана';
  return shifted.toLocaleString('ru-RU', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
}


async function shouldReceiveTerritoryNotification(env, territoryId, telegramId) {
  const uid = Number(telegramId || 0), tid = String(territoryId || '').trim();
  if (!uid || !tid) return false;
  await ensureUserPreferenceTables(env);
  const explicit = await env.DB.prepare(`SELECT enabled FROM territory_notification_preferences WHERE telegram_id=? AND territory_id=? LIMIT 1`).bind(uid, tid).first();
  if (explicit) return Number(explicit.enabled) === 1;
  if (await isTerritoryManager(env, tid, uid)) return true;
  // No explicit preference: ordinary residents are opted out by default.
  return false;
}

async function sendTerritoryNotificationToUser(env, territoryId, telegramId, text, options = {}) {
  if (!(await shouldReceiveTerritoryNotification(env, territoryId, telegramId))) return false;
  try {
    const result = await telegram(env, 'sendMessage', { chat_id: Number(telegramId), text, parse_mode: options.parse_mode || 'HTML', reply_markup: options.reply_markup });
    const delivered = Boolean(result.response.ok && result.data?.ok);
    if (!delivered) console.error('Territory notification rejected by Telegram:', territoryId, telegramId, result.data?.error_code || result.response.status, result.data?.description || '');
    return delivered;
  } catch (error) {
    console.error('Territory notification error:', territoryId, telegramId, error);
    return false;
  }
}

async function notifyTerritoryManagers(env, territoryId, text, excludeId = null, options = {}) {
  // Voting notices carry manager-only buttons. Other territory activity notices are
  // available to residents too, according to their per-territory preference.
  const recipients = new Map();
  for (const manager of await getTerritoryManagerRows(env, territoryId)) {
    recipients.set(String(manager.telegram_id), { telegram_id: Number(manager.telegram_id), manager: true });
  }
  if (!options.reply_markup && !options.managersOnly) {
    const residents = await env.DB.prepare(`SELECT telegram_id FROM city_memberships WHERE territory_id=?`).bind(String(territoryId)).all();
    for (const resident of residents.results || []) {
      if (!recipients.has(String(resident.telegram_id))) recipients.set(String(resident.telegram_id), { telegram_id: Number(resident.telegram_id), manager: false });
    }
  }
  for (const recipient of recipients.values()) {
    if (excludeId !== null && excludeId !== undefined && String(recipient.telegram_id) === String(excludeId)) continue;
    if (!(await shouldReceiveTerritoryNotification(env, territoryId, recipient.telegram_id))) continue;
    try {
      const result = await telegram(env, 'sendMessage', { chat_id: recipient.telegram_id, text, parse_mode: options.parse_mode || 'HTML', reply_markup: options.reply_markup });
      if (!result.response.ok || !result.data?.ok) console.error('Territory notification rejected by Telegram:', territoryId, recipient.telegram_id, result.data?.error_code || result.response.status, result.data?.description || '');
    } catch (error) { console.error('Territory notification error:', territoryId, recipient.telegram_id, error); }
  }
}

async function notifyTerritoryManagersDirect(env, territoryId, text) {
  // Membership changes are important ownership updates. Notify every current
  // founder/mayor directly instead of relying on resident broadcast preferences.
  let managers = [];
  try {
    managers = await getTerritoryManagerRows(env, territoryId);
  } catch (error) {
    console.error('Territory manager membership recipient lookup failed:', territoryId, error);
    return;
  }
  for (const manager of managers) {
    const chatId = Number(manager.telegram_id || 0);
    if (!chatId) continue;
    try {
      const result = await telegram(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
      if (!result.response.ok || !result.data?.ok) {
        console.error('Territory manager membership notification failed:', territoryId, chatId, result.data);
      }
    } catch (error) {
      console.error('Territory manager membership notification error:', territoryId, chatId, error);
    }
  }
}

async function notifyBankerOfPurchase(env, details) {
  const chatId = String(env.BANKER_TELEGRAM_ID || '').trim();
  if (!chatId) return;
  const buyerName = String(details?.buyerNickname || '').trim() || 'Ник не указан';
  const buyerContact = details?.buyerUsername
    ? `@${String(details.buyerUsername).replace(/^@+/, '')}`
    : `Telegram ID: ${Number(details?.buyerTelegramId || 0)}`;
  const paymentSource = details?.territoryName
    ? `Казна территории: ${escapeHtml(details.territoryName)}`
    : 'Личный баланс';
  const text = [
    '🛍 <b>Новая покупка в Voxygen</b>',
    '',
    `👤 Покупатель: ${formatTelegramNickname(buyerName)}`,
    `📨 ${escapeHtml(buyerContact)}`,
    `🎨 Визуал: <b>${escapeHtml(details?.itemName || 'Без названия')}</b>`,
    `💎 Стоимость: <b>${Number(details?.price || 0)} сц</b>`,
    `💳 Оплата: ${paymentSource}`,
  ].join('\n');
  try {
    const result = await telegram(env, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
    if (!result.response.ok || !result.data?.ok) {
      console.error('Banker purchase notification failed:', result.data);
    }
  } catch (error) {
    // A Telegram notification failure must never roll back a completed purchase.
    console.error('Banker purchase notification error:', error);
  }
}


async function readGlobalSettingOverrides(env, at = Date.now()) {
  await ensureGlobalSettingsTable(env);
  const rows = await env.DB.prepare(`SELECT setting_key,value,expires_at,updated_at,updated_by
    FROM global_setting_overrides`).all();
  const result = { theme: null, mapZoomPercent: null };
  for (const row of rows.results || []) {
    if (!GLOBAL_SETTING_KEYS.has(row.setting_key)) continue;
    const expiresAt = row.expires_at == null ? null : Number(row.expires_at);
    if (expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= at)) continue;
    const entry = {
      value: row.setting_key === 'map_zoom'
        ? normalizeMapZoomPercent(row.value)
        : normalizeVoxygenTheme(row.value),
      expiresAt,
      updatedAt: Number(row.updated_at || 0),
    };
    if (row.setting_key === 'map_zoom') result.mapZoomPercent = entry;
    if (row.setting_key === 'theme') result.theme = entry;
  }
  return result;
}



async function getUserSettings(request, env) {
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

async function saveUserSettings(request, env) {
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
  return getUserSettings(settingsRequest, env);
}


// v9: active territorial rights are derived only from the current Telegram ID; identity transfers must move owner/manager/currency relations atomically.
async function getTreasuryManagerCities(env, telegramId) {
  const uid=Number(telegramId||0); if(!uid)return [];
  const rows=await env.DB.prepare(`
    SELECT t.id,t.name FROM territories t
    WHERE t.status='approved' AND (t.owner_telegram_id=? OR EXISTS(SELECT 1 FROM territory_managers tm WHERE tm.territory_id=t.id AND tm.telegram_id=?))
    ORDER BY t.created_at ASC
  `).bind(uid,uid).all();
  return rows.results||[];
}


const mapSettingsCache = new WeakMap();
const legacyMapCleanupPromises = new WeakMap();
const MAP_SETTINGS_CACHE_TTL_MS = 30_000;
const WORLD_MAP_MAX_BYTES = 90_000_000;
const SUPPORTED_MAP_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAP_PIPELINE_REPOSITORY = 'CounterBoard/Voxygen-map-assets';

async function cleanupLegacyMapStorage(env) {
  let promise = legacyMapCleanupPromises.get(env);
  if (!promise) {
    promise = (async () => {
      await ensureMapSettingsTable(env);
      // D1 now stores only the GitHub asset URL/content type. Remove abandoned
      // object-storage pointers and old map payloads that were stored as data URLs.
      await env.DB.prepare(`DELETE FROM app_settings WHERE key IN ('world_map_object_key','vox_map_image','jorick_map_image')`).run();
    })().catch(error => {
      legacyMapCleanupPromises.delete(env);
      throw error;
    });
    legacyMapCleanupPromises.set(env, promise);
  }
  return promise;
}

async function getMapSettings(request, env) {
  const startedAt = Date.now();
  try {
    await cleanupLegacyMapStorage(env);
    const now = Date.now();
    let cached = mapSettingsCache.get(env);
    if (!cached || now - cached.fetchedAt >= MAP_SETTINGS_CACHE_TTL_MS) {
      const result = await env.DB.prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('world_map_github_url','world_map_github_content_type')"
      ).all();
      const rows = result?.results || [];
      cached = {
        githubUrl: rows.find(row => row.key === 'world_map_github_url')?.value || null,
        contentType: rows.find(row => row.key === 'world_map_github_content_type')?.value || null,
        fetchedAt: Date.now(),
      };
      mapSettingsCache.set(env, cached);
    }

    if (!cached.githubUrl) {
      if (request.method === 'HEAD') {
        return withCors(new Response(null, { status: 404, headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        }}));
      }
      return json({ ok: false, code: 'MAP_NOT_UPLOADED', error: 'Карта ещё не загружена. Главный инспектор может загрузить её в профиле.' }, 404);
    }

    let upstream = await fetch(cached.githubUrl, { method: request.method, redirect: 'follow' });
    if (!upstream.ok) {
      // Another Worker isolate may still have the previous URL cached while a
      // new image is being published. Refresh D1 once before returning an error.
      const latestResult = await env.DB.prepare(
        "SELECT key, value FROM app_settings WHERE key IN ('world_map_github_url','world_map_github_content_type')"
      ).all();
      const latestRows = latestResult?.results || [];
      const latestUrl = latestRows.find(row => row.key === 'world_map_github_url')?.value || null;
      if (latestUrl && latestUrl !== cached.githubUrl) {
        cached = {
          githubUrl: latestUrl,
          contentType: latestRows.find(row => row.key === 'world_map_github_content_type')?.value || null,
          fetchedAt: Date.now(),
        };
        mapSettingsCache.set(env, cached);
        upstream = await fetch(cached.githubUrl, { method: request.method, redirect: 'follow' });
      }
      if (!upstream.ok) {
        console.error(JSON.stringify({ event: 'github_map_fetch_failed', status: upstream.status }));
        return json({ ok: false, error: 'Не удалось получить карту из GitHub Releases.' }, 502);
      }
    }

    const storedType = String(cached.contentType || '').split(';')[0].trim().toLowerCase();
    const urlPath = new URL(cached.githubUrl).pathname.toLowerCase();
    const inferredType = urlPath.endsWith('.jpg') || urlPath.endsWith('.jpeg') ? 'image/jpeg'
      : urlPath.endsWith('.webp') ? 'image/webp' : 'image/png';
    const contentType = SUPPORTED_MAP_TYPES.has(storedType) ? storedType : inferredType;
    // Each upload receives a unique GitHub asset filename. Expose that filename
    // as a cache key so clients can cache this large, immutable image for a year
    // without keeping an obsolete map after the next upload.
    let mapVersion = 'map';
    try {
      const assetName = new URL(cached.githubUrl).pathname.split('/').pop() || '';
      mapVersion = decodeURIComponent(assetName).replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || 'map';
    } catch {}
    const requestedVersion = new URL(request.url).searchParams.get('v');
    const cacheControl = requestedVersion === mapVersion
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=300';
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'X-Map-Version': mapVersion,
      'X-Content-Type-Options': 'nosniff',
    });
    const length = upstream.headers.get('Content-Length');
    if (length) headers.set('Content-Length', length);
    const etag = upstream.headers.get('ETag');
    if (etag) headers.set('ETag', etag);
    const response = withCors(new Response(request.method === 'HEAD' ? null : upstream.body, { status: 200, headers }));
    response.headers.set('Server-Timing', `map-settings;dur=${Math.max(0, Date.now() - startedAt)}`);
    return response;
  } catch (error) {
    console.error('GET world map error:', String(error?.message || error));
    const response = json({ ok: false, error: 'Не удалось загрузить карту мира' }, 500);
    response.headers.set('Server-Timing', `map-settings;dur=${Math.max(0, Date.now() - startedAt)}`);
    return response;
  }
}

async function saveMapSettings(request, env, requestId = null) {
  const startedAt = Date.now();
  let stage = 'authorization';
  const diagnostic = (event, fields = {}) => {
    console.error(JSON.stringify({
      event,
      requestId: requestId || null,
      route: '/api/map',
      stage,
      elapsedMs: Date.now() - startedAt,
      ...fields,
    }));
  };
  const parseGithubResponse = async response => {
    const raw = await response.text().catch(() => '');
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    const message = typeof payload?.message === 'string' ? payload.message.slice(0, 500) : null;
    const errors = Array.isArray(payload?.errors)
      ? payload.errors.slice(0, 5).map(item => {
          if (typeof item === 'string') return item.slice(0, 250);
          if (!item || typeof item !== 'object') return String(item).slice(0, 250);
          return {
            resource: typeof item.resource === 'string' ? item.resource.slice(0, 80) : undefined,
            field: typeof item.field === 'string' ? item.field.slice(0, 80) : undefined,
            code: typeof item.code === 'string' ? item.code.slice(0, 80) : undefined,
            message: typeof item.message === 'string' ? item.message.slice(0, 250) : undefined,
          };
        })
      : null;
    return { payload, diagnostic: {
      status: response.status,
      githubRequestId: response.headers.get('X-GitHub-Request-Id'),
      contentType: response.headers.get('Content-Type'),
      message,
      errors,
    } };
  };

  try {
    const auth = await requireMainInspector(request, env);
    if (auth.error) {
      diagnostic('world_map_save_authorization_rejected', { status: auth.error.status || 403 });
      return auth.error;
    }

    stage = 'd1_legacy_cleanup';
    await cleanupLegacyMapStorage(env);

    stage = 'validate_upload';
    const contentType = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!SUPPORTED_MAP_TYPES.has(contentType)) return json({ ok: false, error: 'Поддерживаются только PNG, JPG и WebP.' }, 415);

    // Content-Length is not consistently exposed for browser streams. The client
    // sends X-Map-Size from File.size; FixedLengthStream then enforces that size
    // while forwarding the upload without buffering the whole image in memory.
    const contentLengthHeader = Number(request.headers.get('Content-Length') || 0);
    const declaredSize = Number(request.headers.get('X-Map-Size') || contentLengthHeader || 0);
    if (!Number.isSafeInteger(declaredSize) || declaredSize <= 0) {
      return json({ ok: false, error: 'Не удалось определить размер файла. Повторите загрузку.' }, 411);
    }
    if (contentLengthHeader > 0 && contentLengthHeader !== declaredSize) {
      return json({ ok: false, error: 'Размер загружаемого файла не совпадает с указанным размером.' }, 400);
    }
    if (declaredSize > WORLD_MAP_MAX_BYTES) return json({ ok: false, error: 'Размер карты превышает 90 МБ.' }, 413);
    if (!request.body) return json({ ok: false, error: 'Файл карты не передан.' }, 400);

    const token = String(env.GITHUB_TOKEN || '').trim();
    const pipelineToken = String(env.MAP_PIPELINE_GITHUB_TOKEN || '').trim();
    const owner = String(env.GITHUB_OWNER || '').trim();
    const repo = String(env.GITHUB_REPO || '').trim();
    const tag = String(env.GITHUB_RELEASE_TAG || 'world-map').trim();
    if (!token || !owner || !repo) {
      diagnostic('world_map_save_github_configuration_missing', {
        hasToken: !!token, hasOwner: !!owner, hasRepo: !!repo, releaseTag: tag,
      });
      return json({ ok: false, error: 'GitHub не настроен: проверьте Worker secrets GITHUB_TOKEN и переменные GITHUB_OWNER, GITHUB_REPO.' }, 503);
    }
    if (!pipelineToken) {
      diagnostic('world_map_pipeline_configuration_missing', { repository: MAP_PIPELINE_REPOSITORY });
      return json({ ok: false, error: 'Не настроена автоматическая обработка карты. Добавьте в основной Worker secret MAP_PIPELINE_GITHUB_TOKEN с правом Actions: write для CounterBoard/Voxygen-map-assets.' }, 503);
    }

    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
    const assetName = `voxygen-world-map-${Date.now()}.${extension}`;
    const ghHeaders = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Voxygen-Map-Storage/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const repositoryPath = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

    stage = 'github_release_lookup';
    diagnostic('world_map_save_started', { size: declaredSize, contentType, releaseTag: tag });
    const releaseResponse = await fetch(`${repositoryPath}/releases/tags/${encodeURIComponent(tag)}`, { headers: ghHeaders });
    const releaseResult = await parseGithubResponse(releaseResponse);
    const release = releaseResult.payload;
    if (!releaseResponse.ok || !release?.id || !release?.upload_url) {
      diagnostic('github_map_release_lookup_failed', {
        ...releaseResult.diagnostic,
        repository: `${owner}/${repo}`,
        releaseTag: tag,
      });
      if (releaseResponse.status === 404) {
        return json({ ok: false, error: `GitHub Release «${tag}» не найден или недоступен токену. Проверьте репозиторий ${owner}/${repo} и GITHUB_TOKEN.` }, 502);
      }
      const reason = releaseResponse.status === 403
        ? 'GitHub запретил доступ. Проверьте GITHUB_TOKEN и разрешение Contents: write для репозитория.'
        : `GitHub не вернул нужный Release (HTTP ${releaseResponse.status}).`;
      return json({ ok: false, error: reason }, 502);
    }

    stage = 'github_asset_upload';
    const uploadUrl = release.upload_url.replace(/\{[^}]+\}$/, '') + `?name=${encodeURIComponent(assetName)}`;
    const fixedLengthBody = new FixedLengthStream(declaredSize);
    const uploadPromise = fetch(uploadUrl, {
      method: 'POST',
      headers: { ...ghHeaders, 'Content-Type': contentType },
      body: fixedLengthBody.readable,
    }).then(response => ({ response }), error => ({ error }));
    const pipePromise = request.body.pipeTo(fixedLengthBody.writable)
      .then(() => ({ ok: true }), error => ({ error }));
    const [uploadResult, pipeResult] = await Promise.all([uploadPromise, pipePromise]);

    if (pipeResult.error) {
      stage = 'client_to_github_stream';
      diagnostic('github_map_asset_stream_failed', {
        errorType: String(pipeResult.error?.name || 'Error').slice(0, 60),
        message: String(pipeResult.error?.message || pipeResult.error).slice(0, 500),
      });
      return json({ ok: false, error: 'Передача файла карты в GitHub прервалась. Проверьте соединение и повторите загрузку.' }, 502);
    }
    if (uploadResult.error) {
      stage = 'github_asset_upload';
      diagnostic('github_map_asset_request_failed', {
        errorType: String(uploadResult.error?.name || 'Error').slice(0, 60),
        message: String(uploadResult.error?.message || uploadResult.error).slice(0, 500),
      });
      return json({ ok: false, error: 'Не удалось связаться с GitHub при загрузке карты. Повторите попытку.' }, 502);
    }

    const uploadResponse = uploadResult.response;
    const uploadResponseResult = await parseGithubResponse(uploadResponse);
    const asset = uploadResponseResult.payload;
    if (!uploadResponse.ok || !asset?.browser_download_url) {
      diagnostic('github_map_asset_upload_failed', uploadResponseResult.diagnostic);
      const reason = uploadResponse.status === 403
        ? 'GitHub отклонил загрузку. Проверьте GITHUB_TOKEN и разрешение Contents: write для выбранного репозитория.'
        : uploadResponse.status === 422
          ? 'GitHub не принял файл. Повторите загрузку; возможно, имя файла уже занято.'
          : `GitHub отклонил загрузку карты (HTTP ${uploadResponse.status}).`;
      return json({ ok: false, error: reason }, 502);
    }

    const uploadedType = SUPPORTED_MAP_TYPES.has(String(asset.content_type || '').toLowerCase())
      ? String(asset.content_type).toLowerCase()
      : contentType;

    const mapVersion = assetName.replace(/\.[^.]+$/, '');
    stage = 'dispatch_map_pipeline';
    const pipelineHeaders = {
      Authorization: `Bearer ${pipelineToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Voxygen-Map-Pipeline/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
    const dispatchResponse = await fetch(`https://api.github.com/repos/${MAP_PIPELINE_REPOSITORY}/actions/workflows/publish-map.yml/dispatches`, {
      method: 'POST',
      headers: pipelineHeaders,
      body: JSON.stringify({
        ref: 'main',
        inputs: { image_url: asset.browser_download_url, map_version: mapVersion },
      }),
    });
    if (dispatchResponse.status !== 204) {
      const dispatchResult = await parseGithubResponse(dispatchResponse);
      diagnostic('world_map_pipeline_dispatch_failed', {
        ...dispatchResult.diagnostic,
        repository: MAP_PIPELINE_REPOSITORY,
        mapVersion,
      });
      const reason = dispatchResponse.status === 401 || dispatchResponse.status === 403
        ? 'GitHub не разрешил запустить обработку. Проверьте secret MAP_PIPELINE_GITHUB_TOKEN и разрешение Actions: write для Voxygen-map-assets.'
        : `Не удалось запустить обработку карты в GitHub Actions (HTTP ${dispatchResponse.status}).`;
      return json({ ok: false, error: reason }, 502);
    }

    stage = 'd1_save_github_asset_url';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('world_map_github_url',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(asset.browser_download_url, Date.now()),
      env.DB.prepare(`INSERT INTO app_settings(key,value,updated_at) VALUES('world_map_github_content_type',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).bind(uploadedType, Date.now()),
      env.DB.prepare(`DELETE FROM app_settings WHERE key IN ('world_map_object_key','vox_map_image','jorick_map_image')`),
    ]);

    stage = 'github_old_asset_cleanup';
    // This repository is dedicated to the world map: keep the new and recent
    // source assets for queued builds, then remove expired old map assets.
    const sourceAssetRetentionMs = 48 * 60 * 60 * 1000;
    const sourceAssetCleanupBefore = Date.now() - sourceAssetRetentionMs;
    const oldImageAssets = (Array.isArray(release.assets) ? release.assets : []).filter(item => {
      if (!item?.id || Number(item.id) === Number(asset.id)) return false;
      const createdAt = Date.parse(String(item.created_at || ''));
      // Keep recent uploads long enough for queued GitHub Actions jobs to download
      // their immutable source asset before a subsequent upload triggers cleanup.
      if (!Number.isFinite(createdAt) || createdAt >= sourceAssetCleanupBefore) return false;
      const name = String(item.name || '').toLowerCase();
      const mediaType = String(item.content_type || '').toLowerCase();
      return mediaType.startsWith('image/') || /\.(?:png|jpe?g|webp|gif|avif|bmp)$/i.test(name);
    });
    const cleanupResults = await Promise.allSettled(oldImageAssets.map(async previousAsset => {
      const response = await fetch(`${repositoryPath}/releases/assets/${previousAsset.id}`, { method: 'DELETE', headers: ghHeaders });
      if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}`);
    }));
    cleanupResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        diagnostic('github_old_map_asset_cleanup_failed', {
          assetId: oldImageAssets[index]?.id,
          error: String(result.reason?.message || result.reason).slice(0, 250),
        });
      }
    });

    mapSettingsCache.delete(env);
    diagnostic('world_map_save_completed', {
      size: declaredSize,
      githubAssetId: asset.id,
      mapVersion,
      pipeline: 'dispatched',
      removedOldImages: cleanupResults.filter(result => result.status === 'fulfilled').length,
      failedOldImageRemovals: cleanupResults.filter(result => result.status === 'rejected').length,
    });
    return json({ ok: true, size: declaredSize, storage: 'github-releases', mapVersion, processing: 'queued', removedOldImages: cleanupResults.filter(result => result.status === 'fulfilled').length });
  } catch (error) {
    diagnostic('world_map_save_unhandled_failure', {
      errorType: String(error?.name || 'Error').slice(0, 60),
      message: String(error?.message || error).slice(0, 500),
    });
    return json({ ok: false, error: 'Не удалось сохранить карту в GitHub Releases. Проверьте журнал Worker по requestId и этапу ошибки.' }, 500);
  }
}

function normalizeMcNickname(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

function makeEmptyVoxGrid() {
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 9 }, (_, col) => ({ row, col, state: '' }))
  ).flat();
}

async function getVoxGrid(env) {
  await ensureWorldTables(env);
  const rows = await env.DB.prepare(
    'SELECT row_index, col_index, state FROM vox_grid ORDER BY row_index, col_index'
  ).all();
  const cells = makeEmptyVoxGrid();
  for (const row of rows.results || []) {
    const cell = cells.find((c) => c.row === Number(row.row_index) && c.col === Number(row.col_index));
    if (cell) cell.state = row.state === '?' ? '?' : '';
  }
  return cells;
}

async function resetVoxGrid(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  await env.DB.prepare(`UPDATE vox_grid SET state='', updated_by=?, updated_at=?`).bind(Number(auth.user.id), Date.now()).run();
  return json({ ok: true });
}

async function saveVoxCell(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const row = Number(body?.row);
  const col = Number(body?.col);
  const state = body?.state === '?' ? '?' : '';
  if (!Number.isInteger(row) || row < 0 || row > 7 || !Number.isInteger(col) || col < 0 || col > 8) {
    return json({ ok: false, error: 'Invalid grid cell' }, 400);
  }
  await env.DB.prepare(`
    INSERT INTO vox_grid (row_index, col_index, state, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(row_index, col_index) DO UPDATE SET state = excluded.state, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).bind(row, col, state, Number(auth.user.id), Date.now()).run();
  return json({ ok: true, row, col, state });
}


async function hideRecruitmentIfContactLost(env, territoryId, targetId, usernameHint='') {
  await ensureRecruitmentTable(env);
  const recruitment=await env.DB.prepare(`SELECT contact_username,enabled FROM recruitment WHERE territory_id=?`).bind(territoryId).first();
  if(!recruitment || Number(recruitment.enabled||0)!==1 || !recruitment.contact_username) return false;
  const target=await env.DB.prepare(`SELECT telegram_username FROM users WHERE telegram_id=?`).bind(Number(targetId)).first();
  const contact=normalizeUsername(recruitment.contact_username).toLowerCase();
  const candidates=[target?.telegram_username,usernameHint].map(v=>normalizeUsername(v).toLowerCase()).filter(Boolean);
  if(!candidates.includes(contact)) return false;
  await env.DB.prepare(`UPDATE recruitment SET enabled=0,contact_username=NULL,updated_at=? WHERE territory_id=?`).bind(Date.now(),territoryId).run();
  return true;
}

async function promoteResident(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),targetId=Number(body?.telegramId); if(!territoryId||!Number.isSafeInteger(targetId)||targetId<=0)return json({ok:false,error:'territoryId и telegramId обязательны'},400);
  const accountLocks=await env.DB.prepare(`SELECT telegram_id FROM account_deletion_locks WHERE telegram_id IN (?,?)`).bind(Number(auth.user.id),targetId).all();
  if((accountLocks.results||[]).length)return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  if(String(targetId)===String(auth.user.id))return json({ok:false,error:'Нельзя повысить себя'},400);
  const member=await env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,targetId).first(); if(!member)return json({ok:false,error:'Житель не найден'},404);
  const managers=await getTerritoryManagerRows(env,territoryId); const voterCount=Math.max(0,managers.length-1);
  if(voterCount===0){
    try{
      const applied=await applyManagerChange(env,{territoryId,targetId,action:'promote',initiatorId:Number(auth.user.id)});
      if(!applied)return json({ok:false,error:'Не удалось изменить роль. Обновите данные и повторите действие.'},409);
      return json({ok:true,immediate:true});
    }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);throw error;}
  }
  await ensureManagerChangeTables(env);
  const pending=await env.DB.prepare(`SELECT id FROM manager_change_requests WHERE territory_id=? AND target_telegram_id=? AND action='promote' AND status IN ('pending','finalizing') AND expires_at>? LIMIT 1`).bind(territoryId,targetId,Date.now()).first(); if(pending)return json({ok:false,error:'Запрос уже находится на голосовании'},409);
  const id=crypto.randomUUID(),now=Date.now(),expires=now+24*60*60*1000,required=Math.floor(managers.length/2); try{await env.DB.prepare(`INSERT INTO manager_change_requests(id,territory_id,target_telegram_id,initiator_telegram_id,action,required_votes,voter_count,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,territoryId,targetId,Number(auth.user.id),'promote',required,voterCount,'pending',now,expires).run();}catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);throw error;}
  const city=await env.DB.prepare('SELECT name FROM territories WHERE id=?').bind(territoryId).first(); const target=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=?').bind(targetId).first();
  await notifyTerritoryManagers(env,territoryId,`👑 <b>Голосование за нового основателя/мэра</b>\n\n🏙 <b>${escapeHtml(city?.name||'Город')}</b>\n👤 Кандидат: ${formatTelegramNickname(target?.mc_nickname||`id${targetId}`)}\n\nИнициатор: ${formatTelegramNickname(auth.user.username?normalizeUsername(auth.user.username):`id${auth.user.id}`)}\n\nОдобрить повышение?`,auth.user.id,{reply_markup:{inline_keyboard:[[{text:'✅ Одобрить',callback_data:`manager_vote:yes:${id}`},{text:'❌ Отклонить',callback_data:`manager_vote:no:${id}`}]]}});
  try{await telegram(env,'sendMessage',{chat_id:targetId,text:`⏳ Вам предложено стать основателем/мэром города «${escapeHtml(city?.name||'Город')}». Решение будет принято после голосования действующих основателей/мэров.`,parse_mode:'HTML'})}catch{}
  return json({ok:true,pending:true});
}

async function demoteManager(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; await ensureWorldTables(env); let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),targetId=Number(body?.telegramId); if(!territoryId||!Number.isSafeInteger(targetId)||targetId<=0)return json({ok:false,error:'territoryId и telegramId обязательны'},400);
  const accountLocks=await env.DB.prepare(`SELECT telegram_id FROM account_deletion_locks WHERE telegram_id IN (?,?)`).bind(Number(auth.user.id),targetId).all();
  if((accountLocks.results||[]).length)return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  const territory=await env.DB.prepare(`SELECT owner_telegram_id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  if(!(await isTerritoryManager(env,territoryId,targetId)))return json({ok:false,error:'Основатель/мэр не найден'},404);
  const managers=await getTerritoryManagerRows(env,territoryId);
  if(managers.length<=1)return json({ok:false,error:'В городе должен быть как минимум ещё один основатель/мэр'},400);
  const excludedVoters=Number(auth.user.id)===targetId?1:2; const voterCount=Math.max(0,managers.length-excludedVoters);
  if(voterCount===0){
    try{
      const applied=await applyManagerChange(env,{territoryId,targetId,action:'demote',initiatorId:Number(auth.user.id)});
      if(!applied)return json({ok:false,error:'Не удалось изменить роль. Обновите данные и повторите действие.'},409);
      return json({ok:true,immediate:true});
    }catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);throw error;}
  }
  await ensureManagerChangeTables(env); const pending=await env.DB.prepare(`SELECT id FROM manager_change_requests WHERE territory_id=? AND target_telegram_id=? AND action='demote' AND status IN ('pending','finalizing') AND expires_at>? LIMIT 1`).bind(territoryId,targetId,Date.now()).first(); if(pending)return json({ok:false,error:'Запрос уже находится на голосовании'},409);
  const id=crypto.randomUUID(),now=Date.now(),expires=now+24*60*60*1000,required=Math.floor(managers.length/2); try{await env.DB.prepare(`INSERT INTO manager_change_requests(id,territory_id,target_telegram_id,initiator_telegram_id,action,required_votes,voter_count,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(id,territoryId,targetId,Number(auth.user.id),'demote',required,voterCount,'pending',now,expires).run();}catch(error){if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Один из аккаунтов находится в процессе удаления'},409);throw error;}
  const target=await env.DB.prepare('SELECT mc_nickname FROM users WHERE telegram_id=?').bind(targetId).first();
  const initiator=await env.DB.prepare('SELECT mc_nickname,telegram_username FROM users WHERE telegram_id=?').bind(Number(auth.user.id)).first();
  const initiatorName=String(initiator?.mc_nickname||'').trim() || String(initiator?.telegram_username||'').replace(/^@+/,'').trim() || `id${auth.user.id}`;
  await notifyTerritoryManagers(env,territoryId,`⚖️ <b>Голосование за понижение основателя/мэра</b>\n\n🏙 <b>${escapeHtml(territory.name)}</b>\n👤 Кандидат на понижение: ${formatTelegramNickname(target?.mc_nickname||`id${targetId}`)}\n\nИнициатор: ${formatTelegramNickname(initiatorName)}\n\nОдобрить понижение?`,auth.user.id,{reply_markup:{inline_keyboard:[[{text:'✅ Одобрить',callback_data:`manager_vote:yes:${id}`},{text:'❌ Отклонить',callback_data:`manager_vote:no:${id}`}]]}});
  try{await telegram(env,'sendMessage',{chat_id:targetId,text:`⏳ В отношении вас запущено голосование о понижении в городе «${escapeHtml(territory.name)}».`,parse_mode:'HTML'})}catch{}
  return json({ok:true,pending:true});
}

async function getTerritories(request, env) {
  const startedAt = Date.now();
  let phaseStarted = startedAt;
  const timings = [];
  const markTiming = label => {
    const now = Date.now();
    timings.push(`${label};dur=${Math.max(0, now - phaseStarted)}`);
    phaseStarted = now;
  };
  const requestUrl = new URL(request.url);
  const detailId = String(requestUrl.searchParams.get('detail') || '').trim();
  const summaryMode = !detailId && requestUrl.searchParams.get('view') === 'summary';
  try {
    await Promise.all([ensureRecruitmentTable(env), ensureWorldTables(env)]);
    markTiming('schema');

    const territorySql = `
      SELECT t.*,
        r.description AS recruitment_description,
        COALESCE(r.enabled,0) AS recruitment_enabled,
        CASE WHEN COALESCE(r.enabled,0)=1 THEN r.contact_username ELSE NULL END AS recruitment_contact_username,
        cc.marker_item_id,
        mi.name AS marker_name,
        mi.id AS marker_source_item_id,
        mi.categories_text AS marker_categories_text,
        mi.government_marker AS marker_government_marker,
        mic.name AS marker_category_name,
        cc.banner_color,
        cc.banner_gradient,
        ou.mc_nickname AS owner_mc_nickname,
        ou.xuid AS owner_xuid,
        ou.skin_texture_id AS owner_skin_texture_id
      FROM territories t
      LEFT JOIN recruitment r ON r.territory_id=t.id
      LEFT JOIN city_customization cc ON cc.territory_id=t.id
      LEFT JOIN customization_items mi ON mi.id=cc.marker_item_id AND mi.active=1
      LEFT JOIN customization_categories mic ON mic.id=mi.category_id
      LEFT JOIN users ou ON ou.telegram_id=t.owner_telegram_id
      WHERE t.status='approved' ${detailId ? 'AND t.id=?' : ''}
      ORDER BY t.created_at DESC
    `;
    const result = detailId
      ? await env.DB.prepare(territorySql).bind(detailId).all()
      : await env.DB.prepare(territorySql).all();
    markTiming('territories');

    // A GET must be read-only. Previously every invalid/missing marker could launch
    // several inventory queries and writes for each territory on every refresh.
    for (const row of result.results || []) {
      const isGovernment = Number(row.is_government || 0) === 1;
      const markerTypeMatches = row.marker_item_id && (isGovernment
        ? Number(row.marker_government_marker || 0) === 1
        : Number(row.marker_government_marker || 0) !== 1);
      const selectedMarkerLooksValid = Boolean(markerTypeMatches) && visualHasTag({
        category_name: row.marker_category_name,
        categories_text: row.marker_categories_text,
      }, 'метка');
      if (!selectedMarkerLooksValid) {
        row.marker_item_id = null;
        row.marker_name = null;
        row.marker_image = null;
        row.marker_categories_text = null;
        row.marker_category_name = null;
        row.marker_government_marker = 0;
      }
    }
    markTiming('marker-checks');

    const partialFailures = [];
    const safeAll = async (component, sql, binds=[]) => {
      try {
        const statement = env.DB.prepare(sql);
        return await (binds.length ? statement.bind(...binds).all() : statement.all());
      } catch (error) {
        partialFailures.push(component);
        console.error(JSON.stringify({ event: "territories_optional_read_failed", component, code: "D1_OPTIONAL_READ_FAILED" }));
        return { results: [] };
      }
    };
    const scopedBind = detailId ? [detailId] : [];
    const memberSql = summaryMode
      ? `SELECT cm.territory_id,cm.telegram_id FROM city_memberships cm WHERE cm.territory_id IN (SELECT id FROM territories WHERE status='approved') ORDER BY cm.joined_at ASC`
      : `SELECT cm.territory_id,cm.telegram_id,u.mc_nickname,u.telegram_username,u.xuid,u.skin_texture_id FROM city_memberships cm LEFT JOIN users u ON u.telegram_id=cm.telegram_id WHERE 1=1${detailId ? ' AND cm.territory_id=?' : ''} ORDER BY cm.joined_at ASC`;
    const managerSql = summaryMode
      ? `SELECT tm.territory_id,tm.telegram_id FROM territory_managers tm WHERE tm.territory_id IN (SELECT id FROM territories WHERE status='approved') ORDER BY tm.granted_at ASC`
      : `SELECT tm.territory_id,tm.telegram_id,u.mc_nickname,u.telegram_username,u.xuid,u.skin_texture_id FROM territory_managers tm LEFT JOIN users u ON u.telegram_id=tm.telegram_id WHERE 1=1${detailId ? ' AND tm.territory_id=?' : ''} ORDER BY tm.granted_at ASC`;
    const commentsPromise = summaryMode
      ? Promise.resolve({ results: [] })
      : safeAll("comments", `SELECT c.id,c.territory_id,c.telegram_id,c.telegram_username,COALESCE(c.author_mc_nickname,u.mc_nickname) AS mc_nickname,u.xuid,u.skin_texture_id,c.text,c.role,c.created_at,cr.text AS reply_text FROM comments c LEFT JOIN users u ON u.telegram_id=c.telegram_id LEFT JOIN comment_replies cr ON cr.comment_id=c.id ${detailId ? 'WHERE c.territory_id=?' : ''} ORDER BY CASE WHEN c.role IN ('inspector','main_inspector') THEN 0 ELSE 1 END,c.created_at DESC`, scopedBind);
    const screensPromise = summaryMode
      ? Promise.resolve({ results: [] })
      : safeAll("screenshots", `SELECT s.id,s.territory_id,s.telegram_id,s.telegram_username,s.author_mc_nickname,s.status,s.created_at,COALESCE(s.author_mc_nickname,u.mc_nickname) AS mc_nickname,u.xuid,u.skin_texture_id FROM screenshots s LEFT JOIN users u ON u.telegram_id=s.telegram_id WHERE s.status='approved'${detailId ? ' AND s.territory_id=?' : ''} ORDER BY s.created_at DESC`, scopedBind);
    const awardsPromise = summaryMode
      ? Promise.resolve({ results: [] })
      : safeAll("territory_awards", `SELECT id,territory_id,name,emoji,awarded_by_telegram_id,awarded_at,slot_index,sticker_format,sticker_thumbnail_file_id,sticker_set_name FROM territory_awards WHERE slot_index IS NOT NULL AND territory_id IN (SELECT id FROM territories WHERE status='approved')${detailId ? ' AND territory_id=?' : ''} ORDER BY territory_id ASC,slot_index ASC`, scopedBind);
    // Aggregate ratings in D1 rather than transferring every historical rating to the Worker.
    // The calculation exactly preserves the existing weighting: top 5 community / top 2 inspector
    // ratings are averaged separately from older ratings, then combined 50/50 when history exists.
    const ratingSummarySql = (table, recentLimit, includeRole) => `
      WITH ranked AS (
        SELECT territory_id,
          (COALESCE(integrity,0)+COALESCE(comfort,0)+COALESCE(atmosphere,0)+COALESCE(detail,0))*0.5 AS score,
          ${includeRole ? "CASE WHEN COALESCE(role,'user')='resident' THEN (1.0/3.0) ELSE 1.0 END" : '1.0'} AS weight,
          ROW_NUMBER() OVER (PARTITION BY territory_id ORDER BY created_at DESC,id DESC) AS rn,
          COUNT(*) OVER (PARTITION BY territory_id) AS total_count
        FROM ${table}${detailId ? ' WHERE territory_id=?' : ''}
      ), aggregated AS (
        SELECT territory_id,
          SUM(CASE WHEN rn<=${recentLimit} THEN score*weight ELSE 0 END) AS recent_sum,
          SUM(CASE WHEN rn<=${recentLimit} THEN weight ELSE 0 END) AS recent_weight,
          SUM(CASE WHEN rn>${recentLimit} THEN score*weight ELSE 0 END) AS old_sum,
          SUM(CASE WHEN rn>${recentLimit} THEN weight ELSE 0 END) AS old_weight,
          MAX(total_count) AS total_count
        FROM ranked GROUP BY territory_id
      )
      SELECT territory_id,total_count,
        CASE WHEN recent_weight=0 THEN 0
          WHEN old_weight>0 THEN 0.5*(recent_sum/recent_weight)+0.5*(old_sum/old_weight)
          ELSE recent_sum/recent_weight END AS average
      FROM aggregated`;
    // Start identity/role lookup alongside the aggregate and detail queries; this removes a
    // serial wait for the viewer's own rating after every other territory read has completed.
    const viewerDataPromise = (async () => {
      const viewer = await getCurrentUser(request, env);
      const viewerRole = viewer?.id ? await getRoleByTelegramId(env, Number(viewer.id), viewer.username || '') : 'user';
      let ownRatings = { results: [] };
      if (viewer?.id) {
        if (viewerRole === 'inspector' || viewerRole === 'main_inspector') {
          const ownSql = `SELECT territory_id,integrity,comfort,atmosphere,detail,created_at FROM inspector_ratings WHERE telegram_id=?${detailId ? ' AND territory_id=?' : ''} ORDER BY created_at DESC`;
          const ownBinds = detailId ? [Number(viewer.id), detailId] : [Number(viewer.id)];
          ownRatings = await safeAll('my_inspector_rating', ownSql, ownBinds);
        } else {
          const ownSql = `SELECT territory_id,integrity,comfort,atmosphere,detail,created_at FROM ratings WHERE telegram_id=?${detailId ? ' AND territory_id=?' : ''}`;
          const ownBinds = detailId ? [Number(viewer.id), detailId] : [Number(viewer.id)];
          ownRatings = await safeAll('my_player_rating', ownSql, ownBinds);
        }
      }
      return { viewer, viewerRole, ownRatings };
    })();
    const [members, managersRaw, comments, screens, awards, ratings, inspectorRatings, viewerData] = await Promise.all([
      safeAll("members", memberSql, detailId ? [detailId] : []),
      safeAll("managers", managerSql, detailId ? [detailId] : []),
      commentsPromise,
      screensPromise,
      awardsPromise,
      safeAll("ratings", ratingSummarySql('ratings', 5, true), scopedBind),
      safeAll("inspector_ratings", ratingSummarySql('inspector_ratings', 2, false), scopedBind),
      viewerDataPromise,
    ]);
    markTiming('related-data');

    const byCity={},managersByCity={},commentsByCity={},screensByCity={},awardsByCity={},communityByCity={},curatorByCity={},votesByCity={},viewerRatingsByCity={};
    for(const m of members.results||[]) (byCity[m.territory_id]||=[]).push(m);
    for(const m of managersRaw.results||[]) (managersByCity[m.territory_id]||=[]).push(m);
    for(const c of comments.results||[]) (commentsByCity[c.territory_id]||=[]).push({...c,author:c.mc_nickname||`id${c.telegram_id}`,skin_url:skinUrlFromTexture(c.skin_texture_id,c.mc_nickname),reply:c.reply_text||null,likes:0,dislikes:0});
    for(const s of screens.results||[]) (screensByCity[s.territory_id]||=[]).push({...s,author:s.mc_nickname||`id${s.telegram_id}`,skin_url:skinUrlFromTexture(s.skin_texture_id,s.mc_nickname),url:`/api/screenshots/${s.id}`});
    for(const award of awards.results||[]) (awardsByCity[award.territory_id]||=[]).push(award);
    for(const r of ratings.results||[]) { communityByCity[r.territory_id]=Number(r.average||0); votesByCity[r.territory_id]=Number(r.total_count||0); }
    for(const r of inspectorRatings.results||[]) curatorByCity[r.territory_id]=Number(r.average||0);
    const { viewer, viewerRole, ownRatings } = viewerData;
    for (const r of ownRatings.results || []) {
      if (viewerRole === 'inspector' || viewerRole === 'main_inspector') {
        if (!viewerRatingsByCity[r.territory_id]) viewerRatingsByCity[r.territory_id] = r;
      } else {
        viewerRatingsByCity[r.territory_id] = r;
      }
    }
    const territories=(result.results||[]).map(row=>{
      const parsed=parseRequestCoords(row.coords),ms=byCity[row.id]||[];
      const markerPosition = parsed ? worldCoordinateToPercent(parsed.x, parsed.z) : null;
      const x = markerPosition?.x ?? null;
      const y = markerPosition?.y ?? null;
      const vr=viewerRatingsByCity[row.id];
      const myRating=vr?{rated:true,next_at:Number(vr.created_at)+20*60*60*1000,values:{integrity:Number(vr.integrity),comfort:Number(vr.comfort),atmosphere:Number(vr.atmosphere),detail:Number(vr.detail)}}:{rated:false,next_at:null,values:null};
      const isGovernment=Number(row.is_government||0)===1;
      const ownerNickname=row.owner_mc_nickname||(Number(row.owner_telegram_id||0)>0?String(row.owner_input||'').trim():null)||null;
      const managerRows=managersByCity[row.id]||[];
      const managerIds=isGovernment?[]:[...new Set([Number(row.owner_telegram_id||0),...managerRows.map(m=>Number(m.telegram_id||0))].filter(Boolean))];
      const managers=isGovernment||summaryMode?[]:[{telegram_id:Number(row.owner_telegram_id||0),telegram_username:row.owner_telegram_username||null,mc_nickname:ownerNickname,xuid:row.owner_xuid||null,skin_texture_id:row.owner_skin_texture_id||null,skin_url:skinUrlFromTexture(row.owner_skin_texture_id,ownerNickname),role:'founder'},...managerRows.map(m=>({...m,telegram_id:Number(m.telegram_id),skin_url:skinUrlFromTexture(m.skin_texture_id,m.mc_nickname),role:'founder'}))].filter((m,i,a)=>m.telegram_id&&a.findIndex(x=>String(x.telegram_id)===String(m.telegram_id))===i);
      const isManagerViewer=viewer?.id ? managerIds.map(String).includes(String(viewer.id)) : false;
      const residentRows=isGovernment||summaryMode?[]:ms.map(m=>({telegram_id:Number(m.telegram_id),mc_nickname:m.mc_nickname||null,telegram_username:m.telegram_username||null,xuid:m.xuid||null,skin_texture_id:m.skin_texture_id||null,skin_url:skinUrlFromTexture(m.skin_texture_id,m.mc_nickname)}));
      const assetUrl = itemId => itemId ? `${new URL(request.url).origin}/api/customization/items/${encodeURIComponent(String(itemId))}/image` : null;
      // Fetch selected marker images through the dedicated image endpoint.
      const markerImage=assetUrl(row.marker_source_item_id);
      return {...row,marker_image:markerImage,banner_color:row.banner_color||'none',banner_gradient:row.banner_gradient||'aurora',awards:awardsByCity[row.id]||[],x,y,vox_x:parsed?.x??null,vox_z:parsed?.z??null,curator:curatorByCity[row.id]||0,community:communityByCity[row.id]||0,votes:votesByCity[row.id]||0,my_rating:myRating,owner:isGovernment?'':(ownerNickname||'Ник не указан'),owner_mc_nickname:isGovernment?null:ownerNickname,founder_mc_nickname:isGovernment?null:ownerNickname,managers,manager_telegram_ids:managerIds,manager_count:managerIds.length,is_manager:isManagerViewer,residents:summaryMode?[]:(isGovernment?[]:ms.map(m=>m.mc_nickname).filter(Boolean)),resident_rows:residentRows,resident_telegram_ids:isGovernment?[]:ms.map(m=>Number(m.telegram_id)),resident_count:isGovernment?0:ms.length+managerIds.length,recruitment_contact_username:isGovernment?null:(row.recruitment_contact_username||null),reviews:commentsByCity[row.id]||[],screenshots:screensByCity[row.id]||[],marker_url:markerImage,is_government:isGovernment};
    });
    markTiming('transform');
    const response=json({ok:true,territories,degraded:partialFailures.length>0,degradedAreas:[...new Set(partialFailures)]});
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Server-Timing', [...timings, `total;dur=${Math.max(0, Date.now() - startedAt)}`].join(', '));
    return response;
  } catch(error) {
    console.error(JSON.stringify({event:'territories_read_failed',code:'D1_READ_FAILED'}));
    const response=json({ok:false,error:'Database error',details:String(error)},500);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Server-Timing', [...timings, `total;dur=${Math.max(0, Date.now() - startedAt)}`].join(', '));
    return response;
  }
}

async function createTerritory(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const initData = String(body?.initData || request.headers.get("X-Telegram-Init-Data") || "").trim();
  const user = await verifyInitData(initData, String(env.BOT_TOKEN || "").trim());
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
  await ensureWorldTables(env);
  const role = await getRoleByTelegramId(env, user.id, user.username || "");
  const isMainInspector = role === 'main_inspector';
  if (!isMainInspector) {
    const verifiedProfile = await env.DB.prepare(`SELECT status,mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(user.id)).first();
    if (verifiedProfile?.status !== 'verified' || !String(verifiedProfile?.mc_nickname || '').trim()) {
      return json({ ok: false, error: 'Для добавления города нужен подтверждённый никнейм Minecraft' }, 403);
    }
  }

  const name = String(body?.name || "").trim();
  const owner = String(body?.owner || "").trim();
  const coords = String(body?.coords || "").trim();
  const parsed = parseTwoCoordinates(coords);
  if (!name || (!isMainInspector && !owner) || !parsed || !isValidWorldCoordinate(parsed.x, parsed.z)) {
    const requirement = isMainInspector ? "Укажите название и две координаты от −3008 до 3007" : "Укажите название, владельца и две координаты от −3008 до 3007";
    return json({ ok: false, error: requirement }, 400);
  }
  if (name.length > 120 || owner.length > 120) return json({ ok: false, error: "Название или имя владельца слишком длинное" }, 400);

  const id = crypto.randomUUID();
  const username = String(user.username || "").trim();
  const createdAt = Date.now();
  const ownerUsername = normalizeUsername(owner).replace(/^@/, '');
  let ownerUser = null;
  if (ownerUsername) {
    ownerUser = await env.DB.prepare(`SELECT telegram_id, telegram_username FROM users WHERE lower(replace(telegram_username, '@', '')) = lower(?) AND status='verified' LIMIT 1`).bind(ownerUsername).first();
  }
  const palette = ["#A855F7", "#22C55E", "#38BDF8", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#8B5CF6", "#F97316"];
  const accent = palette[Math.floor(Math.random() * palette.length)];
  const status = isMainInspector ? 'approved' : 'pending';
  const inspectorChatId = String(env.INSPECTOR_CHAT_ID || "").trim();
  if (!isMainInspector && !inspectorChatId) {
    return json({ ok: false, error: "INSPECTOR_CHAT_ID is not configured" }, 500);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO territories
      (id, name, owner_input, coords, requested_by_id, requested_by_username,
       owner_telegram_id, owner_telegram_username, status, created_at, accent, is_government)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).bind(
      id, name, owner || '', `X ${Number(parsed.x)} / Z ${Number(parsed.z)}`,
      Number(user.id), username || null,
      ownerUser ? Number(ownerUser.telegram_id) : null,
      ownerUsername || null, status, createdAt, accent
    ).run();
  } catch (error) {
    console.error("INSERT territory error:", error);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }

  if (isMainInspector) {
    if (ownerUser?.telegram_id) {
      await evaluateAchievementsForTerritory(env, id).catch(error => console.error('Achievement evaluation after main inspector city create:', error));
    }
    return json({ ok: true, message: "Territory created and approved", id, status: "approved", direct: true });
  }

  const text =
    `🏙 Новая заявка на территорию\n\n` +
    `<code>${escapeHtml(name)}</code>\n\n` +
    `${escapeHtml(normalizeUsername(owner) || owner)}\n\n` +
    `<code>${escapeHtml(formatCoordinatePair(parsed.x, parsed.z))}</code>\n\n` +
    `🙋 Заявитель: ${escapeHtml(normalizeUsername(username) || "—")}\n` +
    `Telegram ID: <code>${escapeHtml(user.id)}</code>\n\n` +
    `Выберите действие:`;

  try {
    const { response, data } = await telegram(env, "sendMessage", {
      chat_id: inspectorChatId,
      parse_mode: "HTML",
      text,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: `territory_ok:${id}` },
        { text: "❌ Отклонить", callback_data: `territory_no:${id}` },
      ]] },
    });
    if (!response.ok || !data.ok) {
      console.error("Telegram territory notification error:", data);
      await env.DB.prepare(`DELETE FROM territories WHERE id=? AND status='pending'`).bind(id).run().catch(cleanupError=>console.error('Pending territory cleanup failed:',cleanupError));
      return json({ ok: false, error: "Telegram error" }, 502);
    }
  } catch (error) {
    console.error("Telegram notification error:", error);
    await env.DB.prepare(`DELETE FROM territories WHERE id=? AND status='pending'`).bind(id).run().catch(cleanupError=>console.error('Pending territory cleanup failed:',cleanupError));
    return json({ ok: false, error: "Failed to send Telegram notification" }, 502);
  }

  return json({ ok: true, message: "Territory request created", id, status: "pending", user: { id: user.id, username: username || null } });
}

async function fetchGeyserJson(url) {
  try {
    const response = await fetch(url, { headers: { Accept:'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Geyser API error:', url, error);
    return null;
  }
}

async function getTelegramUsernameById(env, telegramId) {
  const tid=Number(telegramId||0);
  if(!Number.isSafeInteger(tid)||tid<=0) return null;
  try {
    const tg=await telegram(env,'getChat',{chat_id:tid});
    if(tg?.response?.ok && tg?.data?.ok){
      const username=normalizeUsername(tg.data.result?.username||'');
      if(username) return username.replace(/^@/,'');
    }
  } catch(error) {
    console.error('Telegram username lookup by ID error:',tid,error);
  }
  return null;
}

async function syncTelegramUsernameEverywhere(env, telegramUser) {
  const tid=Number(telegramUser?.id||0);
  if(!Number.isSafeInteger(tid)||tid<=0) return null;
  const username=normalizeUsername(telegramUser?.username||'')||null,now=Date.now();
  await env.DB.prepare(`UPDATE users SET telegram_username=? WHERE telegram_id=?`).bind(username,tid).run();
  const updates=[
    env.DB.prepare(`UPDATE user_directory SET telegram_username=?,updated_at=? WHERE telegram_id=?`).bind(username,now,tid),
    env.DB.prepare(`UPDATE inspectors SET telegram_username=? WHERE telegram_id=?`).bind(username,tid),
    env.DB.prepare(`UPDATE comments SET telegram_username=? WHERE telegram_id=?`).bind(username,tid),
    env.DB.prepare(`UPDATE screenshots SET telegram_username=? WHERE telegram_id=?`).bind(username,tid),
    env.DB.prepare(`UPDATE territories SET owner_telegram_username=? WHERE owner_telegram_id=?`).bind(username,tid),
    env.DB.prepare(`UPDATE territories SET requested_by_username=? WHERE requested_by_id=?`).bind(username,tid),
  ];
  await Promise.all(updates.map(statement=>statement.run().catch(()=>null)));
  return username;
}

function isValidSkinTextureId(value) {
  return /^[0-9a-f]{32,64}$/i.test(String(value || '').trim());
}

function isValidJavaNickname(value) {
  return /^[A-Za-z0-9_]{1,16}$/.test(String(value || '').trim());
}

async function lookupJavaSkinTexture(nickname) {
  const name=String(nickname||'').trim();
  if(!isValidJavaNickname(name)) return null;

  // Mojang's older username endpoint can intermittently return 403. Prefer the
  // Minecraft Services public name lookup, then try Mojang's alternate routes.
  const endpoints=[
    `https://api.minecraftservices.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`,
    `https://api.mojang.com/minecraft/profile/lookup/name/${encodeURIComponent(name)}`,
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
  ];
  let uuid=null;
  for(const url of endpoints) {
    try {
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      if(!response.ok) {
        if(response.status===403||response.status===429||response.status>=500) {
          console.warn(JSON.stringify({event:'java_skin_name_lookup_retry',host:new URL(url).host,status:response.status}));
        }
        continue;
      }
      const profile=await response.json();
      const id=String(profile?.id||'').replace(/-/g,'');
      if(/^[0-9a-f]{32}$/i.test(id)){uuid=id;break;}
    } catch(error) {
      console.warn(JSON.stringify({event:'java_skin_name_lookup_fetch_failed',host:new URL(url).host,code:'JAVA_NAME_LOOKUP_FAILED'}));
    }
  }
  if(!uuid) return null;

  try {
    const response=await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`,{headers:{Accept:'application/json'}});
    if(!response.ok) {
      console.warn(JSON.stringify({event:'java_skin_session_lookup_failed',status:response.status,code:'JAVA_SESSION_LOOKUP_FAILED'}));
      return null;
    }
    const session=await response.json();
    const property=(session?.properties||[]).find(item=>item?.name==='textures'&&item?.value);
    if(!property) return null;
    const payload=JSON.parse(atob(String(property.value)));
    const skinUrl=String(payload?.textures?.SKIN?.url||'');
    const match=skinUrl.match(/textures\.minecraft\.net\/texture\/([0-9a-f]{32,64})/i);
    return match&&isValidSkinTextureId(match[1])?match[1]:null;
  } catch(error) {
    console.error(JSON.stringify({event:'java_skin_texture_lookup_failed',code:'JAVA_TEXTURE_LOOKUP_FAILED'}));
    return null;
  }
}

async function syncGeyserSkinForUser(env, telegramId, nickname, existingXuid=null, existingTextureId=null, force=false, existingCheckedAt=null) {
  const tid=Number(telegramId||0), gamertag=String(nickname||'').trim();
  if(!tid || !gamertag) return null;
  let xuid=String(existingXuid||'').trim()||null;
  const cachedCandidate=String(existingTextureId||'').trim();
  const cachedTexture=isValidSkinTextureId(cachedCandidate)?cachedCandidate:null;
  const lastCheckedAt=Number(existingCheckedAt||0);
  const skinRefreshDue=!lastCheckedAt || Date.now()-lastCheckedAt >= 6*60*60*1000;
  if(cachedTexture && !force && !skinRefreshDue){
    return {xuid,skin_texture_id:cachedTexture,skin_url:skinUrlFromTexture(cachedTexture,gamertag)};
  }
  // Bedrock/Xbox identity is the primary source: resolve XUID, then ask GeyserMC
  // for that XUID's skin. If Geyser has no usable texture, fall back to Java by nickname.
  let textureId=null;
  if(!xuid){
    const x=await fetchGeyserJson(`https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(gamertag)}`);
    xuid=String(x?.xuid||'').trim()||null;
  }
  if(xuid){
    const skin=await fetchGeyserJson(`https://api.geysermc.org/v2/skin/${encodeURIComponent(xuid)}`);
    textureId=isValidSkinTextureId(skin?.texture_id)?String(skin.texture_id).trim():null;
  }
  if(!textureId && isValidJavaNickname(gamertag)) textureId=await lookupJavaSkinTexture(gamertag);
  // A transient upstream error must not erase a previously resolved skin.
  // An unresolved name stays without an avatar instead of getting a false Steve face.
  const finalTextureId=textureId||cachedTexture;
  const checkedAt=Date.now();
  await env.DB.prepare(`UPDATE users SET xuid=?,skin_texture_id=?,skin_checked_at=? WHERE telegram_id=?`).bind(xuid,finalTextureId,checkedAt,tid).run();
  return {xuid,skin_texture_id:finalTextureId,skin_url:skinUrlFromTexture(finalTextureId),skin_checked_at:checkedAt};
}

function skinUrlFromTexture(textureId){
  const id=String(textureId||'').trim();
  // Never ask the avatar renderer to resolve a nickname. Unknown or Bedrock-only
  // names can be mistaken for a Java profile and rendered as Steve. Only a texture
  // ID resolved by GeyserMC or Mojang is safe to display.
  if(isValidSkinTextureId(id)) return `https://mc-heads.net/avatar/${encodeURIComponent(id)}/128.png`;
  return null;
}

async function getMe(request, env, ctx = null) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  const user = auth.user;
  await ensureWorldTables(env);
  const [role, profileRow] = await Promise.all([
    getRoleByTelegramId(env, user.id, user.username),
    env.DB.prepare(`SELECT telegram_id, telegram_username, mc_nickname, status, xuid, skin_texture_id, skin_checked_at FROM users WHERE telegram_id = ? LIMIT 1`).bind(Number(user.id)).first(),
  ]);
  const nextUsername=normalizeUsername(user.username||'');
  let profile=profileRow||null;
  try {
    const previousUsername=normalizeUsername(profileRow?.telegram_username||'');
    // Username updates touch several history tables. Avoid writing to all of them on every login.
    if(profileRow && previousUsername.toLowerCase()!==nextUsername.toLowerCase()) {
      if(previousUsername) {
        const contactRows=await env.DB.prepare(`SELECT territory_id FROM recruitment WHERE enabled=1 AND contact_username IS NOT NULL AND lower(replace(contact_username,'@',''))=lower(?)`).bind(previousUsername.replace(/^@/,'')).all();
        await Promise.all((contactRows.results||[]).map(row=>hideRecruitmentIfContactLost(env,row.territory_id,Number(user.id),previousUsername).catch(()=>null)));
      }
      await syncTelegramUsernameEverywhere(env,user);
      profile={...profileRow,telegram_username:nextUsername||null};
    }
  } catch (error) {
    console.error(JSON.stringify({event:'telegram_username_sync_failed',code:'USERNAME_SYNC_FAILED'}));
  }

  // Resolve the current user's skin before returning /api/me. Returning a raw
  // nickname URL caused unresolved Bedrock-only names to display a false Steve face.
  if(profile?.status==='verified' && profile?.mc_nickname) {
    const repairTask=repairOrphanedTerritoryOwnersForUser(env,Number(user.id),profile.mc_nickname).catch(()=>null);
    const hasTexture=isValidSkinTextureId(profile.skin_texture_id);
    const refreshInterval=hasTexture?6*60*60*1000:30*60*1000;
    const skinCheckDue=!Number(profile.skin_checked_at||0)||Date.now()-Number(profile.skin_checked_at||0)>=refreshInterval;
    if(skinCheckDue) {
      try {
        const refreshed=await syncGeyserSkinForUser(env,Number(user.id),profile.mc_nickname,profile.xuid,profile.skin_texture_id,false,profile.skin_checked_at);
        if(refreshed) profile={...profile,xuid:refreshed.xuid||profile.xuid,skin_texture_id:refreshed.skin_texture_id||null,skin_checked_at:refreshed.skin_checked_at||Date.now()};
      } catch(error) {
        console.error('Skin refresh on profile read failed:',String(error));
      }
    }
    if(ctx && typeof ctx.waitUntil==='function') ctx.waitUntil(repairTask);
    else await repairTask;
  }

  const [founderRows,managerRows,residentRows]=await Promise.all([
    env.DB.prepare(`SELECT id,name FROM territories WHERE owner_telegram_id=? AND status='approved' ORDER BY created_at ASC`).bind(Number(user.id)).all(),
    env.DB.prepare(`SELECT t.id,t.name FROM territory_managers tm JOIN territories t ON t.id=tm.territory_id WHERE tm.telegram_id=? AND t.status='approved' ORDER BY t.created_at ASC`).bind(Number(user.id)).all(),
    env.DB.prepare(`SELECT t.id,t.name FROM city_memberships cm JOIN territories t ON t.id=cm.territory_id WHERE cm.telegram_id=? AND t.status='approved' ORDER BY t.created_at ASC`).bind(Number(user.id)).all(),
  ]);
  const citiesMap=new Map();
  for(const c of founderRows.results||[])citiesMap.set(c.id,{...c,role:'founder'});
  for(const c of managerRows.results||[])citiesMap.set(c.id,{...c,role:'founder'});
  for(const c of residentRows.results||[])if(!citiesMap.has(c.id))citiesMap.set(c.id,{...c,role:'resident'});
  const cities=[...citiesMap.values()];
  if(profile) profile={...profile,skin_url:skinUrlFromTexture(profile.skin_texture_id,profile.mc_nickname)};
  return json({ok:true,city:cities[0]||null,cities,user:{id:user.id,username:user.username||null,first_name:user.first_name||null,last_name:user.last_name||null},role,profile:profile||null});
}


async function syncUserDirectory(env) {
  await ensureWorldTables(env);
  await ensureUserDirectoryTable(env);
  const users = await env.DB.prepare(`
    SELECT u.telegram_id, u.telegram_username, u.mc_nickname
    FROM users u
    WHERE u.status='verified'
      AND NOT EXISTS(SELECT 1 FROM account_deletion_locks l WHERE l.telegram_id=u.telegram_id)
    ORDER BY u.created_at ASC
  `).all();
  for (const u of users.results || []) {
    const existing = await env.DB.prepare(`SELECT id,auto_linked FROM user_directory WHERE telegram_id=? LIMIT 1`).bind(Number(u.telegram_id)).first();
    if (existing) {
      if (Number(existing.auto_linked) === 1) {
        await env.DB.prepare(`UPDATE user_directory SET telegram_username=?,mc_nickname=?,hidden=0,updated_at=? WHERE id=?`).bind(u.telegram_username || null,u.mc_nickname || '',Date.now(),existing.id).run();
      } else {
        await env.DB.prepare(`UPDATE user_directory SET telegram_username=?,hidden=0,updated_at=? WHERE id=?`).bind(u.telegram_username || null,Date.now(),existing.id).run();
      }
    } else {
      await env.DB.prepare(`INSERT INTO user_directory (id,telegram_id,telegram_username,mc_nickname,auto_linked,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`).bind(crypto.randomUUID(),Number(u.telegram_id),u.telegram_username||null,u.mc_nickname||'',Date.now(),Date.now()).run();
    }
  }
}

async function listManagedUsers(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  try{
    const verified=await env.DB.prepare(`SELECT telegram_id,mc_nickname FROM users WHERE status='verified' AND mc_nickname IS NOT NULL AND trim(mc_nickname)<>''`).all();
    for(const u of verified.results||[]) await repairOrphanedTerritoryOwnersForUser(env,Number(u.telegram_id),u.mc_nickname);
  }catch(error){console.error('Orphaned territory repair in managed users list failed:',error)}
  await syncUserDirectory(env);
  await purgeLegacyRemovedUsers(env);
  const verifiedRows = await env.DB.prepare(`
    SELECT id, telegram_id, telegram_username, mc_nickname, created_at, updated_at
    FROM user_directory
    WHERE hidden=0
    ORDER BY lower(mc_nickname) ASC, created_at ASC
  `).all();
  const preRows = await env.DB.prepare(`
    SELECT id, NULL AS telegram_id, telegram_username, mc_nickname, created_at, updated_at
    FROM pre_registered_users
    WHERE hidden=0
  `).all();
  const merged=[...(verifiedRows.results||[]),...(preRows.results||[]).map(x=>({...x,pre_registered:true}))];
  merged.sort((a,b)=>String(a.mc_nickname||'').localeCompare(String(b.mc_nickname||''),'ru'));
  return json({ ok:true, users:merged });
}

async function addManagedUser(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  let body; try { body=await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
  const nickname=String(body?.mcNickname||'').trim();
  const telegramId=Number(body?.telegramId);
  if(!nickname||!Number.isSafeInteger(telegramId)||telegramId<=0)return json({ok:false,error:'Укажите Minecraft никнейм и корректный Telegram ID'},400);

  const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
  if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
  const existingUser=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,status,xuid,skin_texture_id FROM users WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
  const resolvedUsername=await getTelegramUsernameById(env,telegramId);
  const username=resolvedUsername||normalizeUsername(existingUser?.telegram_username||'')||null;

  let skin=null;
  try{ skin=await syncGeyserSkinForUser(env,telegramId,nickname,existingUser?.xuid||null,existingUser?.skin_texture_id||null,true); }catch(error){ console.error('Geyser skin sync after addManagedUser:',error); }
  const xuid=skin?.xuid||existingUser?.xuid||null, textureId=skin?.skin_texture_id||existingUser?.skin_texture_id||null;

  const existing=await env.DB.prepare(`SELECT id FROM user_directory WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
  const directoryId=existing?.id||crypto.randomUUID(),now=Date.now();
  const statements=[existing
    ? env.DB.prepare(`UPDATE users SET telegram_username=?,mc_nickname=?,status='verified',xuid=?,skin_texture_id=? WHERE telegram_id=?`).bind(username,nickname,xuid,textureId,telegramId)
    : env.DB.prepare(`INSERT INTO users (telegram_id,telegram_username,mc_nickname,status,created_at,xuid,skin_texture_id) VALUES (?,?,?,?,?,?,?)`).bind(telegramId,username,nickname,'verified',now,xuid,textureId)];
  statements.push(existing
    ? env.DB.prepare(`UPDATE user_directory SET telegram_username=?,mc_nickname=?,auto_linked=0,hidden=0,updated_at=? WHERE id=?`).bind(username,nickname,now,directoryId)
    : env.DB.prepare(`INSERT INTO user_directory (id,telegram_id,telegram_username,mc_nickname,auto_linked,hidden,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?)`).bind(directoryId,telegramId,username,nickname,now,now));
  statements.push(env.DB.prepare(`DELETE FROM pre_registered_users WHERE (telegram_username IS NOT NULL AND lower(telegram_username)=lower(?)) OR (mc_nickname=? AND hidden=0)`).bind(username||'',nickname));
  try{await env.DB.batch(statements)}catch(error){
    if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    throw error;
  }
  return json({ok:true,user:{id:directoryId,telegram_id:telegramId,telegram_username:username,mc_nickname:nickname,skin_texture_id:textureId,skin_url:skinUrlFromTexture(textureId,nickname)}});
}

function buildStaleDestinationOwnerTransferStatements(env,territoryId,staleOwnerId) {
  const territory=String(territoryId||'').trim();
  const staleId=Number(staleOwnerId);
  const eligibleManager=`SELECT tm.telegram_id FROM territory_managers tm
    JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
    WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
      AND trim(COALESCE(u.mc_nickname,''))<>''
    ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1`;
  const update=env.DB.prepare(`UPDATE territories SET
    owner_telegram_id=(${eligibleManager}),
    owner_telegram_username=(SELECT u.telegram_username FROM territory_managers tm
      JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
      WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
        AND trim(COALESCE(u.mc_nickname,''))<>''
      ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1),
    owner_input=(SELECT u.mc_nickname FROM territory_managers tm
      JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
      WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
        AND trim(COALESCE(u.mc_nickname,''))<>''
      ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1)
    WHERE id=? AND status='approved' AND owner_telegram_id=?`)
    .bind(staleId,staleId,staleId,territory,staleId);
  // Remove the manager row belonging to the resulting owner, but only while
  // the territory still names that same Telegram ID as its owner.
  const removeOwnerManager=env.DB.prepare(`DELETE FROM territory_managers
    WHERE territory_id=? AND telegram_id=(
      SELECT owner_telegram_id FROM territories
      WHERE id=? AND owner_telegram_id IS NOT NULL AND owner_telegram_id<>?
    )
    AND EXISTS(SELECT 1 FROM territories
      WHERE id=? AND owner_telegram_id=territory_managers.telegram_id)`)
    .bind(territory,territory,staleId,territory);
  const removeStaleManager=env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=?`)
    .bind(territory,staleId);
  return [update,removeOwnerManager,removeStaleManager];
}

async function rekeyManagedUserId(env,{oldId,newId,username,nickname,xuid,skinTextureId}) {
  const oldTid=Number(oldId),newTid=Number(newId);
  if(oldTid===newTid)return;
  if(!Number.isSafeInteger(oldTid)||!Number.isSafeInteger(newTid)||oldTid<=0||newTid<=0) throw new Error('Некорректный Telegram ID');
  // Never merge an identity into or out of an account whose deletion cleanup
  // is in progress. The trigger barrier remains authoritative for races after
  // this read; the D1 batch is atomic and will roll back if a lock appears later.
  const deletionLocks=await env.DB.prepare(`SELECT telegram_id FROM account_deletion_locks WHERE telegram_id IN (?,?)`).bind(oldTid,newTid).all();
  if((deletionLocks.results||[]).length){
    throw new Error('Нельзя изменить Telegram ID: один из аккаунтов находится в процессе удаления');
  }
  await ensureRecruitmentTable(env);
  await ensureManagerChangeTables(env);
  await ensureUserPreferenceTables(env);
  await ensureEventsTables(env);

  const oldUser=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,status,created_at,xuid,skin_texture_id FROM users WHERE telegram_id=? LIMIT 1`).bind(oldTid).first();
  if(!oldUser) throw new Error('Пользователь с текущим Telegram ID не найден');

  const targetUser=await env.DB.prepare(`SELECT telegram_id,status,telegram_username,mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(newTid).first();
  if(targetUser && ['verified','pending'].includes(String(targetUser.status||''))) {
    throw new Error('Новый Telegram ID уже принадлежит другому активному пользователю');
  }

  // A deleted/legacy account may have historical records under this Telegram ID.
  // Its ACTIVE data must be discarded before the identity is moved here, while
  // comments/screenshots/ratings are intentionally kept as history.
  const targetDirectory=await env.DB.prepare(`SELECT id FROM user_directory WHERE telegram_id=? LIMIT 1`).bind(newTid).first();
  const targetVisualCities=await env.DB.prepare(`
    SELECT territory_id FROM city_memberships WHERE telegram_id=?
    UNION SELECT territory_id FROM territory_managers WHERE telegram_id=?
    UNION SELECT id AS territory_id FROM territories WHERE owner_telegram_id=? AND status='approved'
    UNION SELECT territory_id FROM city_customization WHERE marker_item_id IN (SELECT item_id FROM user_items WHERE telegram_id=?)
  `).bind(newTid,newTid,newTid,newTid).all();
  const targetOwned=await env.DB.prepare(`SELECT id,name,owner_telegram_username FROM territories WHERE owner_telegram_id=? AND status='approved'`).bind(newTid).all();
  const targetUsername=normalizeUsername(targetUser?.telegram_username||'');
  const targetNickname=String(targetUser?.mc_nickname||'').trim()||null;
  const statements=[];
  const now=Date.now();

  if(targetUser){
    try {
      statements.push(env.DB.prepare(`UPDATE comments SET author_mc_nickname=COALESCE(author_mc_nickname,?) WHERE telegram_id=?`).bind(targetNickname,newTid));
      statements.push(env.DB.prepare(`UPDATE screenshots SET author_mc_nickname=COALESCE(author_mc_nickname,?) WHERE telegram_id=?`).bind(targetNickname,newTid));
    } catch {}
  }

  // Remove stale/deleted target-account ownership. If other managers exist,
  // the earliest one inherits ownership; otherwise the territory becomes ownerless.
  for(const territory of targetOwned.results||[]){
    // Keep the stale destination-owner handoff inside the same D1 batch as
    // the identity rekey. The UPDATE chooses the eligible manager at write
    // time and only succeeds while this territory still belongs to newTid.
    statements.push(...buildStaleDestinationOwnerTransferStatements(env,territory.id,newTid));
    if(targetUsername){
      statements.push(env.DB.prepare(`UPDATE recruitment SET enabled=0,contact_username=NULL,updated_at=? WHERE territory_id=? AND enabled=1 AND contact_username IS NOT NULL AND lower(replace(contact_username,'@',''))=lower(replace(?,'@',''))`).bind(now,territory.id,targetUsername));
    }
  }

  // A stale destination account must not remain the contact for any active recruitment announcement.
  if(targetUsername && targetUsername.toLowerCase()!==normalizeUsername(oldUser.telegram_username||'').toLowerCase()){
    statements.push(env.DB.prepare(`UPDATE recruitment SET enabled=0,contact_username=NULL,updated_at=? WHERE enabled=1 AND contact_username IS NOT NULL AND lower(replace(contact_username,'@',''))=lower(replace(?,'@',''))`).bind(now,targetUsername));
  }

  // Remove all other ACTIVE relations belonging to the stale/deleted target ID.
  statements.push(env.DB.prepare(`DELETE FROM city_memberships WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM territory_managers WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM user_items WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM user_currency WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM user_preferences WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM territory_notification_preferences WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM event_reminders WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM event_create_requests WHERE telegram_id=?`).bind(newTid));
  statements.push(env.DB.prepare(`DELETE FROM inspectors WHERE telegram_id=?`).bind(newTid));
statements.push(env.DB.prepare(`DELETE FROM manager_change_votes WHERE voter_telegram_id=?`).bind(newTid));
  // Cancel destination workflows and source workflows already being finalized.
  // Pending source requests remain transferable to the new identity below.
  statements.push(env.DB.prepare(`UPDATE manager_change_requests SET status='rejected',decided_at=?,finalizing_at=NULL
    WHERE status IN ('pending','finalizing') AND (target_telegram_id=? OR initiator_telegram_id=?)`).bind(now,newTid,newTid));
  statements.push(env.DB.prepare(`UPDATE manager_change_requests SET status='rejected',decided_at=?,finalizing_at=NULL
    WHERE status='finalizing' AND (target_telegram_id=? OR initiator_telegram_id=?)`).bind(now,oldTid,oldTid));
  statements.push(env.DB.prepare(`DELETE FROM city_invites WHERE target_telegram_id=? OR invited_by=?`).bind(newTid,newTid));

  if(targetDirectory?.id){
    statements.push(env.DB.prepare(`DELETE FROM user_directory WHERE id=?`).bind(targetDirectory.id));
  }else{
    statements.push(env.DB.prepare(`DELETE FROM user_directory WHERE telegram_id=?`).bind(newTid));
  }
  if(targetUser){
    statements.push(env.DB.prepare(`DELETE FROM users WHERE telegram_id=?`).bind(newTid));
  }

  // Transfer the active identity itself.
  statements.push(env.DB.prepare(`UPDATE users SET telegram_id=?,telegram_username=?,mc_nickname=?,status=?,xuid=?,skin_texture_id=? WHERE telegram_id=?`)
    .bind(newTid,username||null,nickname||oldUser.mc_nickname||null,oldUser.status||'verified',xuid||oldUser.xuid||null,skinTextureId||oldUser.skin_texture_id||null,oldTid));

  // ACTIVE relations follow the new account. Historical target rows are preserved.
  statements.push(env.DB.prepare(`UPDATE city_memberships SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE territory_managers SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE territory_managers SET granted_by=? WHERE granted_by=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE user_items SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE user_currency SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE user_preferences SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE territory_notification_preferences SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE event_reminders SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE event_create_requests SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE events SET created_by=? WHERE created_by=?`).bind(newTid,oldTid));

  // Ratings are one row per city+Telegram ID. Preserve an old deleted user's
  // historical rating when the destination ID already has one; move the source
  // rating only where the destination has no row.
  statements.push(env.DB.prepare(`
    UPDATE ratings
    SET telegram_id=?
    WHERE telegram_id=?
      AND NOT EXISTS (
        SELECT 1 FROM ratings r2
        WHERE r2.territory_id=ratings.territory_id AND r2.telegram_id=?
      )
  `).bind(newTid,oldTid,newTid));
  statements.push(env.DB.prepare(`
    UPDATE inspector_ratings
    SET telegram_id=?
    WHERE telegram_id=?
      AND NOT EXISTS (
        SELECT 1 FROM inspector_ratings r2
        WHERE r2.territory_id=inspector_ratings.territory_id AND r2.telegram_id=?
      )
  `).bind(newTid,oldTid,newTid));

  statements.push(env.DB.prepare(`UPDATE inspectors SET telegram_id=?,telegram_username=? WHERE telegram_id=?`).bind(newTid,username||null,oldTid));
  statements.push(env.DB.prepare(`UPDATE comments SET telegram_id=?,telegram_username=? WHERE telegram_id=?`).bind(newTid,username||null,oldTid));
  statements.push(env.DB.prepare(`UPDATE screenshots SET telegram_id=?,telegram_username=? WHERE telegram_id=?`).bind(newTid,username||null,oldTid));
  statements.push(env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=? WHERE owner_telegram_id=?`).bind(newTid,username||null,nickname||oldUser.mc_nickname||null,oldTid));
  statements.push(env.DB.prepare(`UPDATE territories SET requested_by_id=?,requested_by_username=? WHERE requested_by_id=?`).bind(newTid,username||null,oldTid));
  statements.push(env.DB.prepare(`UPDATE city_invites SET target_telegram_id=? WHERE target_telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE city_invites SET invited_by=? WHERE invited_by=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`
    UPDATE comment_replies
    SET telegram_id=?
    WHERE telegram_id=?
      AND NOT EXISTS (
        SELECT 1 FROM comment_replies cr2
        WHERE cr2.comment_id=comment_replies.comment_id AND cr2.telegram_id=?
      )
  `).bind(newTid,oldTid,newTid));
  statements.push(env.DB.prepare(`UPDATE screenshots SET moderated_by=? WHERE moderated_by=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE gem_spend_log SET telegram_id=? WHERE telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE manager_change_requests SET target_telegram_id=? WHERE target_telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE manager_change_requests SET initiator_telegram_id=? WHERE initiator_telegram_id=?`).bind(newTid,oldTid));
  statements.push(env.DB.prepare(`UPDATE manager_change_votes SET voter_telegram_id=? WHERE voter_telegram_id=?`).bind(newTid,oldTid));

  statements.push(env.DB.prepare(`UPDATE user_directory SET telegram_id=?,telegram_username=?,mc_nickname=?,hidden=0,updated_at=? WHERE telegram_id=?`)
    .bind(newTid,username||null,nickname||oldUser.mc_nickname||'',now,oldTid));

  try {
    await env.DB.batch(statements);
  } catch(error) {
    const detail=String(error?.message||error);
    if(/deletion.?lock|account_deletion_locks|account deletion in progress|удалени/i.test(detail)){
      throw new Error('Нельзя изменить Telegram ID: один из аккаунтов находится в процессе удаления');
    }
    throw new Error(`Не удалось безопасно перенести Telegram ID: ${detail}`);
  }
  for(const row of targetVisualCities.results||[]){
    await reconcileTerritoryVisualEquipment(env,row.territory_id).catch(error=>console.error('Equipment reconciliation after Telegram ID rekey:',error));
  }
}

function buildOrphanedOwnerRepairStatement(env,{territoryId,staleOwnerId,telegramId,nickname,fallbackUsername}) {
  const tid=Number(telegramId),stale=Number(staleOwnerId),name=String(nickname||'').trim();
  const fallback=String(fallbackUsername||'').replace(/^@+/,'').trim();
  return env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,
      owner_telegram_username=(SELECT COALESCE(NULLIF(trim(u.telegram_username),''),?) FROM users u WHERE u.telegram_id=?),
      owner_input=(SELECT u.mc_nickname FROM users u WHERE u.telegram_id=?)
    WHERE id=? AND status='approved' AND owner_telegram_id=?
      AND NOT EXISTS(SELECT 1 FROM users current_owner
        WHERE current_owner.telegram_id=territories.owner_telegram_id AND current_owner.status='verified')
      AND EXISTS(SELECT 1 FROM users u WHERE u.telegram_id=? AND u.status='verified'
        AND trim(COALESCE(u.mc_nickname,''))<>''
        AND lower(trim(u.mc_nickname))=lower(trim(?))
        AND (SELECT COUNT(*) FROM users eligible WHERE eligible.status='verified'
          AND lower(trim(eligible.mc_nickname))=lower(trim(?)))=1)`)
    .bind(tid,fallback,tid,tid,String(territoryId),stale,tid,name,name);
}

function buildUnclaimedOwnerRepairStatement(env,{territoryId,telegramId,nickname,fallbackUsername,ownerInput}) {
  const tid=Number(telegramId),name=String(nickname||'').trim();
  const fallback=String(fallbackUsername||'').replace(/^@+/,'').trim();
  const input=String(ownerInput||'').trim(),inputUsername=input.replace(/^@+/,'');
  return env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,
      owner_telegram_username=(SELECT COALESCE(NULLIF(trim(u.telegram_username),''),?) FROM users u WHERE u.telegram_id=?),
      owner_input=(SELECT u.mc_nickname FROM users u WHERE u.telegram_id=?)
    WHERE id=? AND status='approved' AND owner_telegram_id IS NULL
      AND EXISTS(SELECT 1 FROM users u WHERE u.telegram_id=? AND u.status='verified'
        AND trim(COALESCE(u.mc_nickname,''))<>''
        AND (lower(trim(u.mc_nickname))=lower(trim(?))
          OR lower(replace(trim(COALESCE(NULLIF(u.telegram_username,''),?)),'@',''))=lower(?))
        AND (SELECT COUNT(*) FROM users eligible WHERE eligible.status='verified'
          AND (lower(trim(eligible.mc_nickname))=lower(trim(?))
            OR lower(replace(trim(eligible.telegram_username),'@',''))=lower(?)))=1)`)
    .bind(tid,fallback,tid,tid,String(territoryId),tid,input,fallback,inputUsername,input,inputUsername);
}

async function repairOrphanedTerritoryOwnersForUser(env, telegramId, nickname) {
  const tid=Number(telegramId||0),name=String(nickname||'').trim();
  if(!Number.isSafeInteger(tid)||tid<=0||!name)return;
  const user=await env.DB.prepare(`SELECT telegram_username,mc_nickname,status FROM users WHERE telegram_id=? LIMIT 1`).bind(tid).first();
  if(user?.status!=='verified')return;
  const username=String(user.telegram_username||'').replace(/^@+/,'').trim();

  const orphaned=await env.DB.prepare(`
    SELECT t.id,t.owner_telegram_id,t.owner_input
    FROM territories t
    LEFT JOIN users current_owner ON current_owner.telegram_id=t.owner_telegram_id AND current_owner.status='verified'
    WHERE t.status='approved' AND t.owner_telegram_id IS NOT NULL
      AND lower(trim(COALESCE(t.owner_input,'')))=lower(trim(?))
      AND current_owner.telegram_id IS NULL
  `).bind(name).all();
  for(const row of orphaned.results||[]){
    const matches=await env.DB.prepare(`SELECT telegram_id FROM users WHERE status='verified' AND lower(trim(mc_nickname))=lower(trim(?))`).bind(name).all();
    if((matches.results||[]).length!==1||Number(matches.results[0].telegram_id)!==tid)continue;
    const staleOwnerId=Number(row.owner_telegram_id);
    const transition=await env.DB.batch([
      buildOrphanedOwnerRepairStatement(env,{territoryId:row.id,staleOwnerId,telegramId:tid,nickname:user.mc_nickname||name,fallbackUsername:user.telegram_username||''}),
      env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id IN (?,?)
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(row.id,staleOwnerId,tid,row.id,tid),
      env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(row.id,staleOwnerId,row.id,tid),
      env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(row.id,tid,row.id,tid),
    ]);
    if(!transition[0]?.meta?.changes)continue;
    await reconcileTerritoryVisualEquipment(env,row.id).catch(error=>console.error('Equipment reconciliation after owner repair:',error));
  }

  // Approved applications can retain an owner_input even when the Telegram account
  // was not registered yet. Bind the owner later only when the identity is unique.
  const unclaimed=await env.DB.prepare(`
    SELECT id,owner_input FROM territories WHERE status='approved' AND owner_telegram_id IS NULL
      AND (lower(trim(owner_input))=lower(trim(?)) OR lower(replace(trim(owner_input),'@',''))=lower(?))
  `).bind(name,username).all();
  for(const row of unclaimed.results||[]){
    const candidates=await env.DB.prepare(`
      SELECT telegram_id FROM users WHERE status='verified'
        AND (lower(trim(mc_nickname))=lower(trim(?)) OR lower(replace(trim(telegram_username),'@',''))=lower(?))
    `).bind(String(row.owner_input||''),String(row.owner_input||'').replace(/^@+/,'')).all();
    if((candidates.results||[]).length!==1||Number(candidates.results[0].telegram_id)!==tid)continue;
    const transition=await env.DB.batch([
      buildUnclaimedOwnerRepairStatement(env,{territoryId:row.id,telegramId:tid,nickname:user.mc_nickname||name,fallbackUsername:user.telegram_username||'',ownerInput:row.owner_input}),
      env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(row.id,tid,row.id,tid),
      env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=?
        AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
        .bind(row.id,tid,row.id,tid),
    ]);
    if(!transition[0]?.meta?.changes)continue;
    await evaluateAchievementsForTerritory(env,row.id).catch(error=>console.error('Achievement evaluation after delayed owner binding:',error));
  }
}

async function updateManagedUser(request, env, userDirectoryId) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  let body; try { body=await request.json(); } catch { return json({ok:false,error:'Invalid JSON'},400); }
  const nickname=String(body?.mcNickname||'').trim();
  const requestedTelegramId=body?.telegramId===null||body?.telegramId===undefined||String(body?.telegramId).trim()===''?null:Number(body.telegramId);
  if(!nickname)return json({ok:false,error:'Укажите Minecraft никнейм'},400);
  if(requestedTelegramId!==null && (!Number.isSafeInteger(requestedTelegramId)||requestedTelegramId<=0))return json({ok:false,error:'Некорректный Telegram ID'},400);

  const pre=await env.DB.prepare(`SELECT id,telegram_username,mc_nickname,xuid,skin_texture_id FROM pre_registered_users WHERE id=? AND hidden=0 LIMIT 1`).bind(userDirectoryId).first();
  if(pre){
    if(requestedTelegramId===null)return json({ok:false,error:'Для этого пользователя укажите Telegram ID'},400);
    const duplicate=await env.DB.prepare(`SELECT id FROM user_directory WHERE telegram_id=? AND hidden=0 LIMIT 1`).bind(requestedTelegramId).first();
    if(duplicate)return json({ok:false,error:'Пользователь с таким Telegram ID уже есть в списке'},409);
    const resolvedUsername=await getTelegramUsernameById(env,requestedTelegramId);
    const username=resolvedUsername||normalizeUsername(pre.telegram_username)||null;
    const existingUser=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE telegram_id=? LIMIT 1`).bind(requestedTelegramId).first();
    if(existingUser && ['verified','pending'].includes(String(existingUser.status||''))) return json({ok:false,error:'Этот Telegram ID уже принадлежит другому активному пользователю'},409);
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(requestedTelegramId).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    const xuid=pre.xuid||null,textureId=pre.skin_texture_id||null;
    const directoryId=crypto.randomUUID(),now=Date.now();
    const statements=[];
    if(existingUser)statements.push(env.DB.prepare(`DELETE FROM users WHERE telegram_id=?`).bind(requestedTelegramId));
    statements.push(env.DB.prepare(`INSERT INTO users (telegram_id,telegram_username,mc_nickname,status,created_at,xuid,skin_texture_id) VALUES (?,?,?,?,?,?,?)`).bind(requestedTelegramId,username,nickname,'verified',now,xuid,textureId));
    statements.push(env.DB.prepare(`INSERT INTO user_directory (id,telegram_id,telegram_username,mc_nickname,auto_linked,hidden,created_at,updated_at) VALUES (?,?,?,?,0,0,?,?)`).bind(directoryId,requestedTelegramId,username,nickname,now,now));
    statements.push(env.DB.prepare(`UPDATE pre_registered_users SET hidden=1,updated_at=? WHERE id=?`).bind(now,userDirectoryId));
    try{await env.DB.batch(statements)}catch(error){
      if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
      throw error;
    }
    return json({ok:true,user:{id:directoryId,telegram_id:requestedTelegramId,telegram_username:username,mc_nickname:nickname,skin_texture_id:textureId,skin_url:skinUrlFromTexture(textureId,nickname)}});
  }

  const current=await env.DB.prepare(`SELECT id,telegram_id,mc_nickname AS directory_nickname FROM user_directory WHERE id=? LIMIT 1`).bind(userDirectoryId).first();
  if(!current)return json({ok:false,error:'Пользователь не найден'},404);
  const currentId=Number(current.telegram_id);
  const oldUser=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,xuid,skin_texture_id,status,created_at FROM users WHERE telegram_id=? LIMIT 1`).bind(currentId).first();
  if(!oldUser)return json({ok:false,error:'Пользователь с этим Telegram ID не найден в базе'},404);

  // Repair a possible half-finished transfer from v8 before applying new changes.
  try{await repairOrphanedTerritoryOwnersForUser(env,currentId,oldUser.mc_nickname||current.directory_nickname||nickname)}catch(error){console.error('Orphaned territory repair error:',error)}

  const duplicateNickname=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE lower(trim(mc_nickname))=lower(trim(?)) AND telegram_id<>? LIMIT 1`).bind(nickname,currentId).first();
  if(duplicateNickname){
    const status=String(duplicateNickname.status||'');
    if(status==='removed'){
      try{await env.DB.prepare(`DELETE FROM users WHERE telegram_id=?`).bind(Number(duplicateNickname.telegram_id)).run()}catch(error){console.error('Legacy removed nickname cleanup error:',error)}
    }else return json({ok:false,error:'Этот Minecraft никнейм уже привязан к другому Telegram аккаунту'},409);
  }

  const targetId=requestedTelegramId===null?currentId:requestedTelegramId;

  // Nickname-only edit: no Telegram lookup is required, so a temporary
  // username/API issue cannot make the save appear to do nothing.
  if(targetId===currentId){
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(currentId).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    let nextXuid=oldUser.xuid||null,nextTexture=oldUser.skin_texture_id||null;
    // Keep the profile, directory entry and every territory owned by this stable
    // Telegram ID synchronized. Ownership is keyed by Telegram ID, never by nickname.
    const renameNow=Date.now();
    try{await env.DB.batch([
      env.DB.prepare(`UPDATE users SET mc_nickname=?,status='verified' WHERE telegram_id=?`).bind(nickname,currentId),
      env.DB.prepare(`UPDATE user_directory SET mc_nickname=?,auto_linked=0,hidden=0,updated_at=? WHERE id=?`).bind(nickname,renameNow,userDirectoryId),
      env.DB.prepare(`UPDATE territories SET owner_input=? WHERE owner_telegram_id=?`).bind(nickname,currentId),
      // The owner is stored in territories.owner_telegram_id; remove duplicate
      // manager rows for the same owner so management lists stay consistent.
      env.DB.prepare(`DELETE FROM territory_managers WHERE telegram_id=? AND territory_id IN (SELECT id FROM territories WHERE owner_telegram_id=?)`).bind(currentId,currentId)
    ])}catch(error){
      if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
      throw error;
    }
    // Repair legacy rows left behind by earlier ID changes, now that the new
    // nickname is saved. This does not claim a city when the nickname is ambiguous.
    try{await repairOrphanedTerritoryOwnersForUser(env,currentId,nickname)}catch(error){console.error('Territory owner repair after nickname edit:',error)}
    try{
      const skin=await syncGeyserSkinForUser(env,currentId,nickname,null,null,true);
      if(skin?.xuid)nextXuid=skin.xuid;
      if(skin?.skin_texture_id)nextTexture=skin.skin_texture_id;
      await env.DB.prepare(`UPDATE users SET xuid=?,skin_texture_id=? WHERE telegram_id=?`).bind(nextXuid,nextTexture,currentId).run();
    }catch(error){console.error('Geyser skin sync on nickname edit:',error)}
    return json({ok:true,user:{id:userDirectoryId,telegram_id:currentId,telegram_username:oldUser.telegram_username||null,mc_nickname:nickname,skin_texture_id:nextTexture,skin_url:skinUrlFromTexture(nextTexture,nickname)}});
  }

  const targetUser=await env.DB.prepare(`SELECT telegram_id,status FROM users WHERE telegram_id=? LIMIT 1`).bind(targetId).first();
  if(targetUser && ['verified','pending'].includes(String(targetUser.status||''))) return json({ok:false,error:'Новый Telegram ID уже принадлежит другому активному пользователю'},409);

  // Do not use Bot API/Geyser as a prerequisite for the ID transfer.
  // The new account can supply its username and skin automatically on its first login.
  const resolvedUsername=await getTelegramUsernameById(env,targetId);
  const username=resolvedUsername||null;
  if(normalizeUsername(oldUser.telegram_username).toLowerCase()!==normalizeUsername(username).toLowerCase() && oldUser.telegram_username){
    const affected=await env.DB.prepare(`SELECT territory_id FROM recruitment WHERE enabled=1 AND contact_username IS NOT NULL AND lower(replace(contact_username,'@',''))=lower(replace(?,'@',''))`).bind(String(oldUser.telegram_username||'')).all();
    for(const row of affected.results||[]) await hideRecruitmentIfContactLost(env,row.territory_id,currentId,oldUser.telegram_username||'');
  }

  // Transfer first. Skin synchronization happens afterwards and cannot break ownership/rights.
  try{
    await rekeyManagedUserId(env,{oldId:currentId,newId:targetId,username,nickname,xuid:null,skinTextureId:null});
  }catch(error){
    return json({ok:false,error:error?.message||'Не удалось изменить Telegram ID'},409);
  }

  let finalXuid=null,finalTexture=null;
  try{
    const skin=await syncGeyserSkinForUser(env,targetId,nickname,null,null,true);
    finalXuid=skin?.xuid||null;finalTexture=skin?.skin_texture_id||null;
  }catch(error){console.error('Geyser skin sync on ID edit:',error)}

  return json({ok:true,user:{id:userDirectoryId,telegram_id:targetId,telegram_username:username,mc_nickname:nickname,skin_texture_id:finalTexture,skin_url:skinUrlFromTexture(finalTexture,nickname)}});
}

async function completeRequiredAccountCleanup(env,telegramId,affectedVisualCities=[]) {
  const tid=Number(telegramId);
  await ensureManagerChangeTables(env);
  await env.DB.prepare(`UPDATE manager_change_requests SET status='rejected',decided_at=?,finalizing_at=NULL
    WHERE status IN ('pending','finalizing') AND (target_telegram_id=? OR initiator_telegram_id=?)`).bind(Date.now(),tid,tid).run();
  await env.DB.prepare(`DELETE FROM manager_change_votes WHERE voter_telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM inspectors WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM user_items WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM user_currency WHERE telegram_id=?`).bind(tid).run();
  for(const row of affectedVisualCities||[]) await reconcileTerritoryVisualEquipment(env,row.territory_id);
}

async function transferTerritoryOwnerAfterAccountRemoval(env,territoryId,oldTelegramId) {
  const oldTid=Number(oldTelegramId);
  const eligibleManager=`SELECT tm.telegram_id FROM territory_managers tm
    JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
    WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
      AND trim(COALESCE(u.mc_nickname,''))<>''
    ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1`;
  const transfer=await env.DB.prepare(`UPDATE territories SET
    owner_telegram_id=(${eligibleManager}),
    owner_telegram_username=(SELECT u.telegram_username FROM territory_managers tm
      JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
      WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
        AND trim(COALESCE(u.mc_nickname,''))<>''
      ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1),
    owner_input=(SELECT u.mc_nickname FROM territory_managers tm
      JOIN users u ON u.telegram_id=tm.telegram_id AND u.status='verified'
      WHERE tm.territory_id=territories.id AND tm.telegram_id<>?
        AND trim(COALESCE(u.mc_nickname,''))<>''
      ORDER BY tm.granted_at ASC,tm.telegram_id ASC LIMIT 1)
    WHERE id=? AND status='approved' AND owner_telegram_id=?
    RETURNING owner_telegram_id`)
    .bind(oldTid,oldTid,oldTid,territoryId,oldTid).first();
  if(!transfer||!transfer.owner_telegram_id)return;
  const newOwnerId=Number(transfer.owner_telegram_id);
  await env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=?
    AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
    .bind(territoryId,newOwnerId,territoryId,newOwnerId).run();
}

async function preserveAccountHistoryAuthor(env,telegramId,nickname) {
  const tid=Number(telegramId);
  if(!Number.isSafeInteger(tid)||tid<=0)throw new Error('Некорректный Telegram ID для сохранения истории');
  await env.DB.prepare(`UPDATE comments SET author_mc_nickname=COALESCE(author_mc_nickname,?) WHERE telegram_id=?`).bind(nickname||null,tid).run();
  await env.DB.prepare(`UPDATE screenshots SET author_mc_nickname=COALESCE(author_mc_nickname,?) WHERE telegram_id=?`).bind(nickname||null,tid).run();
}

async function removeManagedUserRelations(env, telegramId) {
  const tid=Number(telegramId); if(!Number.isSafeInteger(tid)||tid<=0)return;
  await ensureUserPreferenceTables(env);
  await ensureEventsTables(env);
  const affectedVisualCities=await env.DB.prepare(`
    SELECT territory_id FROM city_memberships WHERE telegram_id=?
    UNION SELECT territory_id FROM territory_managers WHERE telegram_id=?
    UNION SELECT id AS territory_id FROM territories WHERE owner_telegram_id=? AND status='approved'
    UNION SELECT territory_id FROM city_customization WHERE marker_item_id IN (SELECT item_id FROM user_items WHERE telegram_id=?)
  `).bind(tid,tid,tid,tid).all();
  const actor=await env.DB.prepare(`SELECT telegram_username,mc_nickname FROM users WHERE telegram_id=? LIMIT 1`).bind(tid).first();
  const directoryActor=await env.DB.prepare(`SELECT telegram_username,mc_nickname FROM user_directory WHERE telegram_id=? LIMIT 1`).bind(tid).first();
  const oldUsername=actor?.telegram_username||directoryActor?.telegram_username||'';
  const oldNickname=actor?.mc_nickname||directoryActor?.mc_nickname||null;
  await preserveAccountHistoryAuthor(env,tid,oldNickname);

  const owned=await env.DB.prepare(`SELECT id,name FROM territories WHERE owner_telegram_id=? AND status='approved'`).bind(tid).all();
  for(const territory of owned.results||[]){
    await hideRecruitmentIfContactLost(env,territory.id,tid,oldUsername);
    await transferTerritoryOwnerAfterAccountRemoval(env,territory.id,tid);
  }
  const managerCities=await env.DB.prepare(`SELECT territory_id FROM territory_managers WHERE telegram_id=?`).bind(tid).all();
  for(const row of managerCities.results||[])await hideRecruitmentIfContactLost(env,row.territory_id,tid,oldUsername);
  await env.DB.prepare(`DELETE FROM territory_managers WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM city_memberships WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=?,notification_claimed_at=NULL
    WHERE status='pending' AND (target_telegram_id=? OR invited_by=? OR (target_telegram_id IS NULL AND ?<>'' AND lower(target_nickname)=lower(?)))`).bind(Date.now(),tid,tid,oldNickname||'',oldNickname||'').run();
  await env.DB.prepare(`DELETE FROM user_preferences WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM territory_notification_preferences WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM event_reminders WHERE telegram_id=?`).bind(tid).run();
  await env.DB.prepare(`DELETE FROM event_create_requests WHERE telegram_id=?`).bind(tid).run();
  // Required cleanup and equipment reconciliation must succeed before account rows are deleted.
  await completeRequiredAccountCleanup(env,tid,affectedVisualCities.results||[]);
}

async function purgeLegacyRemovedUsers(env) {
  await ensureWorldTables(env);
  const rows=await env.DB.prepare(`SELECT telegram_id FROM users WHERE status='removed'`).all();
  for(const row of rows.results||[]){
    const tid=Number(row.telegram_id); if(!Number.isSafeInteger(tid)||tid<=0)continue;
    try{
      await env.DB.prepare(`INSERT OR IGNORE INTO account_deletion_locks(telegram_id,locked_at,reason) VALUES(?,?,'legacy_purge')`).bind(tid,Date.now()).run();
      await removeManagedUserRelations(env,tid);
      await env.DB.prepare(`DELETE FROM users WHERE telegram_id=?`).bind(tid).run();
      await env.DB.prepare(`DELETE FROM user_directory WHERE telegram_id=?`).bind(tid).run();
      await env.DB.prepare(`DELETE FROM account_deletion_locks WHERE telegram_id=?`).bind(tid).run();
    }catch(error){console.error('Legacy removed user cleanup error:',tid,error)}
  }
}
async function deleteManagedUser(request, env, userDirectoryId) {
  const auth = await requireMainInspector(request, env); if (auth.error) return auth.error;
  await ensureWorldTables(env);
  const existing=await env.DB.prepare(`SELECT id,telegram_id FROM user_directory WHERE id=? LIMIT 1`).bind(userDirectoryId).first();
  if(existing){
    const tid=Number(existing.telegram_id);
    if(String(tid)===String(env.INSPECTOR_CHAT_ID||'').trim())return json({ok:false,error:'Главного инспектора удалить нельзя'},403);
    await env.DB.prepare(`INSERT OR IGNORE INTO account_deletion_locks(telegram_id,locked_at,reason) VALUES(?,?,'managed_delete')`).bind(tid,Date.now()).run();
    try {
      await removeManagedUserRelations(env,tid);
      await env.DB.prepare(`DELETE FROM users WHERE telegram_id=?`).bind(tid).run();
      await env.DB.prepare(`DELETE FROM user_directory WHERE id=?`).bind(userDirectoryId).run();
      await env.DB.prepare(`DELETE FROM account_deletion_locks WHERE telegram_id=?`).bind(tid).run();
      return json({ok:true,telegram_id:tid});
    } catch(error) {
      console.error('Managed account deletion blocked; lock retained:',tid,error);
      return json({ok:false,error:'Удаление не завершено; аккаунт временно заблокирован для повторных назначений. Повторите операцию.',details:String(error)},500);
    }
  }
  const pre=await env.DB.prepare(`SELECT id FROM pre_registered_users WHERE id=? AND hidden=0 LIMIT 1`).bind(userDirectoryId).first();
  if(pre){await env.DB.prepare(`UPDATE pre_registered_users SET hidden=1,updated_at=? WHERE id=?`).bind(Date.now(),userDirectoryId).run();return json({ok:true})}
  return json({ok:false,error:'Пользователь не найден'},404);
}
async function listInspectors(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;

  const rows = await env.DB.prepare(`
    SELECT telegram_id, telegram_username, added_by, created_at
    FROM inspectors
    ORDER BY created_at ASC
  `).all();

  return json({ ok: true, inspectors: rows.results || [] });
}

async function addInspector(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  let telegramId = Number(body?.telegramId);
  const usernameInput = String(body?.username || '').trim().replace(/^@+/, '');
  if ((!Number.isSafeInteger(telegramId) || telegramId <= 0) && !usernameInput) return json({ ok: false, error: 'Укажите Telegram ID или username' }, 400);
  if ((!Number.isSafeInteger(telegramId) || telegramId <= 0) && usernameInput) {
    const found = await env.DB.prepare(`SELECT telegram_id, telegram_username FROM users WHERE lower(replace(telegram_username, '@', '')) = lower(?) LIMIT 1`).bind(usernameInput).first();
    if (!found) return json({ ok: false, error: 'Пользователь с таким username ещё не запускал бота или не найден. Для первого добавления используйте Telegram ID.' }, 404);
    telegramId = Number(found.telegram_id);
  }
  if (String(telegramId) === String(env.INSPECTOR_CHAT_ID || '').trim()) return json({ ok: false, error: 'Главный инспектор уже имеет эту роль' }, 400);
  await ensureWorldTables(env);
  const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
  if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
  const username = usernameInput || (await env.DB.prepare('SELECT telegram_username FROM users WHERE telegram_id = ?').bind(telegramId).first())?.telegram_username || '';
  try{
    await env.DB.prepare(`INSERT INTO inspectors (telegram_id, telegram_username, added_by, created_at)
      SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM account_deletion_locks WHERE telegram_id=?)
      ON CONFLICT(telegram_id) DO UPDATE SET telegram_username = excluded.telegram_username`)
      .bind(telegramId, username || null, Number(auth.user.id), Date.now(), telegramId).run();
  }catch(error){
    if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error)))return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    throw error;
  }
  return json({ ok: true, telegramId, username: username || null });
}

async function removeInspector(request, env, url) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;

  const telegramId = Number(url.pathname.split("/").pop());
  if (!Number.isSafeInteger(telegramId)) {
    return json({ ok: false, error: "Invalid Telegram ID" }, 400);
  }

  await env.DB.prepare("DELETE FROM inspectors WHERE telegram_id = ?")
    .bind(telegramId).run();

  return json({ ok: true });
}

async function claimNickname(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const nickname = String(body?.nickname || "").trim();
  if (!nickname) return json({ ok: false, error: "Nickname is required" }, 400);

  try {
    await ensureWorldTables(env);
    const telegramId=Number(auth.user.id);
    const deletionLock=await env.DB.prepare(`SELECT 1 AS locked FROM account_deletion_locks WHERE telegram_id=? LIMIT 1`).bind(telegramId).first();
    if(deletionLock)return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    await env.DB.prepare(`
      INSERT INTO users (telegram_id, telegram_username, mc_nickname, status, created_at)
      VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        telegram_username = excluded.telegram_username,
        mc_nickname = excluded.mc_nickname,
        status = 'pending',
        xuid = NULL,
        skin_texture_id = NULL
    `).bind(telegramId, auth.user.username || null, nickname, Date.now()).run();

    const inspectorChatId = String(env.INSPECTOR_CHAT_ID || "").trim();
    if (!inspectorChatId) return json({ ok: false, error: "INSPECTOR_CHAT_ID is not configured" }, 500);

    const username = normalizeUsername(auth.user.username) || "без username";
    const text =
      `🧑 Новая заявка на регистрацию\n\n` +
      `🎮 Никнейм\n<code>${escapeHtml(nickname)}</code>\n\n` +
      `👤 ${escapeHtml(username)}\n` +
      `Telegram ID: <code>${escapeHtml(auth.user.id)}</code>\n\n` +
      `Выберите действие:`;

    const sent = await telegram(env, "sendMessage", {
      chat_id: inspectorChatId, parse_mode: "HTML", text,
      reply_markup: { inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: `nickname_ok:${auth.user.id}` },
        { text: "❌ Отклонить", callback_data: `nickname_no:${auth.user.id}` },
      ]] },
    });
    if (!sent.response.ok || !sent.data.ok) {
      console.error("Telegram nickname notification error:", sent.data);
      return json({ ok: false, error: "Не удалось отправить заявку инспектору", telegram: sent.data }, 502);
    }
    return json({ ok: true, status: "pending" });
  } catch (error) {
    if (/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error))) return json({ok:false,error:'Аккаунт находится в процессе удаления'},409);
    if (String(error).toLowerCase().includes("unique")) return json({ ok: false, error: "Этот ник уже привязан к другому Telegram аккаунту" }, 409);
    return json({ ok: false, error: "Database error", details: String(error) }, 500);
  }
}

function buildFounderClaimStatement(env,territoryId,telegramId,fallbackUsername) {
  const tid=Number(telegramId);
  const fallback=String(fallbackUsername||'').replace(/^@+/,'').trim();
  return env.DB.prepare(`UPDATE territories SET
      owner_telegram_id=?,
      owner_telegram_username=(SELECT COALESCE(NULLIF(trim(u.telegram_username),''),?) FROM users u WHERE u.telegram_id=?),
      owner_input=(SELECT u.mc_nickname FROM users u WHERE u.telegram_id=?)
    WHERE id=? AND status='approved' AND owner_telegram_id IS NULL
      AND EXISTS(SELECT 1 FROM users u WHERE u.telegram_id=? AND u.status='verified'
        AND trim(COALESCE(u.mc_nickname,''))<>''
        AND (lower(trim(owner_input))=lower(trim(u.mc_nickname))
          OR lower(replace(trim(owner_input),'@',''))=lower(replace(trim(COALESCE(NULLIF(u.telegram_username,''),?)),'@',''))))`)
    .bind(tid,fallback,tid,tid,String(territoryId||'').trim(),tid,fallback);
}

async function claimTerritoryOwner(request, env) {
  const auth=await requireUser(request,env);
  if(auth.error)return auth.error;
  await ensureWorldTables(env);
  let body;
  try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim();
  if(!territoryId)return json({ok:false,error:'territoryId is required'},400);

  const [territory,user]=await Promise.all([
    env.DB.prepare(`SELECT id,owner_input,owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(),
    env.DB.prepare(`SELECT telegram_username,mc_nickname,status FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first(),
  ]);
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.owner_telegram_id||0)===Number(auth.user.id))return json({ok:true,changed:false});
  if(territory.owner_telegram_id)return json({ok:false,error:'City already has another founder/mayor'},403);
  if(user?.status!=='verified'||!String(user.mc_nickname||'').trim())return json({ok:false,error:'Для назначения основателем нужен подтверждённый Minecraft-никнейм'},403);

  const ownerInput=String(territory.owner_input||'').trim();
  const username=String(user.telegram_username||auth.user.username||'').replace(/^@+/,'').trim();
  const matchesNickname=ownerInput.toLowerCase()===String(user.mc_nickname).trim().toLowerCase();
  const matchesUsername=ownerInput.replace(/^@+/,'').toLowerCase()===username.toLowerCase()&&Boolean(username);
  if(!matchesNickname&&!matchesUsername)return json({ok:false,error:'Эта территория указана для другого владельца'},403);

  const transition=await env.DB.batch([
    buildFounderClaimStatement(env,territoryId,Number(auth.user.id),user.telegram_username||auth.user.username||''),
    env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?
      AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(territoryId,Number(auth.user.id),territoryId,Number(auth.user.id)),
    env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=?
      AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(territoryId,Number(auth.user.id),territoryId,Number(auth.user.id)),
  ]);
  if(!transition[0]?.meta?.changes){
    const fresh=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=?`).bind(territoryId).first();
    if(Number(fresh?.owner_telegram_id||0)===Number(auth.user.id))return json({ok:true,changed:false});
    return json({ok:false,error:'Территорию уже успел занять другой пользователь. Обновите данные.'},409);
  }
  await evaluateAchievementsForTerritory(env,territoryId).catch(error=>console.error('Achievement evaluation after founder claim:',error));
  return json({ok:true,changed:true});
}

async function requestInspectorRating(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error; let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(); if(!territoryId)return json({ok:false,error:'territoryId is required'},400);
  const territory=await env.DB.prepare(`SELECT t.id,t.name,t.coords,t.owner_telegram_id,t.owner_telegram_username,t.owner_input,COALESCE(r.contact_username,t.owner_telegram_username) AS request_contact_username FROM territories t LEFT JOIN recruitment r ON r.territory_id=t.id WHERE t.id=? AND t.status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404); if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Только основатель/мэр может запросить оценку инспектора'},403);
  const rows=await env.DB.prepare('SELECT telegram_id FROM inspectors').all(),recipients=new Set(),mainChatId=String(env.INSPECTOR_CHAT_ID||'').trim(); if(mainChatId)recipients.add(mainChatId); for(const row of rows.results||[]){const id=String(row.telegram_id||'').trim();if(id)recipients.add(id);} if(!recipients.size)return json({ok:false,error:'Инспекторы не настроены'},500);
  const ownerUsername=normalizeUsername(territory.request_contact_username||territory.owner_telegram_username||auth.user.username)||'username не указан'; const parsed=parseRequestCoords(territory.coords),coords=parsed?`${parsed.x} / ${parsed.z}`:formatTerritoryCoords(territory.coords);
  const text=`⭐ <b>Запрос на оценку города</b>\n\n🏙 <b>${escapeHtml(territory.name||'Без названия')}</b>\n👤 ${escapeHtml(ownerUsername)}\n📍 <code>${escapeHtml(coords)}</code>\n\nОснователь/мэр просит инспекторов оценить свой город в Voxygen`;
  let sent=0,failed=0; for(const chatId of recipients){try{const result=await telegram(env,'sendMessage',{chat_id:chatId,text,parse_mode:'HTML'});if(result.response.ok&&result.data?.ok)sent++;else{failed++;console.error('Inspector rating request Telegram error:',chatId,result.data)}}catch(error){failed++;console.error('Inspector rating request error:',chatId,error)}}
  if(!sent)return json({ok:false,error:'Не удалось отправить запрос инспекторам',sent,failed},502); return json({ok:true,sent,failed});
}

async function calculateTerritoryScores(env, territoryId) {
  const [players, inspectors] = await Promise.all([
    env.DB.prepare(`SELECT integrity,comfort,atmosphere,detail,role,created_at,id FROM ratings WHERE territory_id=? ORDER BY created_at DESC,id DESC`).bind(territoryId).all(),
    env.DB.prepare(`SELECT integrity,comfort,atmosphere,detail,created_at,id FROM inspector_ratings WHERE territory_id=? ORDER BY created_at DESC,id DESC`).bind(territoryId).all(),
  ]);
  const avg = rows => {
    if (!rows.length) return 0;
    let scoreSum = 0, weightSum = 0;
    for (const r of rows) {
      const weight = String(r.role||'user')==='resident' ? (1/3) : 1;
      const score = (Number(r.integrity||0)+Number(r.comfort||0)+Number(r.atmosphere||0)+Number(r.detail||0))*0.5;
      scoreSum += score * weight;
      weightSum += weight;
    }
    return weightSum ? scoreSum / weightSum : 0;
  };
  const weighted = (rows, recentCount) => {
    if (!rows.length) return 0;
    const recent = rows.slice(0, recentCount);
    const old = rows.slice(recentCount);
    const recentAvg = avg(recent);
    if (!old.length) return recentAvg;
    return recentAvg * 0.5 + avg(old) * 0.5;
  };
  return { curator: weighted(inspectors.resul return withCors(new Response(response.body, {
    status: response.status,
    headers,
  }));
}

async function renameTerritory(request, env) {
  const auth=await requireUser(request,env);if(auth.error)return auth.error;let body;try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),name=String(body?.name||'').trim();if(!territoryId||!name||name.length>80)return json({ok:false,error:'Название обязательно'},400);
  const territory=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();if(!territory||!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403);
  await env.DB.prepare('UPDATE territories SET name=? WHERE id=?').bind(name,territoryId).run();return json({ok:true,name});
}

async function deleteTerritory(request, env) {
  const auth=await requireMainInspector(request,env);
  if(auth.error)return auth.error;
  let body={};
  try{body=await request.json()}catch{}
  const territoryId=String(body?.territoryId||'').trim();
  if(!territoryId)return json({ok:false,error:'territoryId is required'},400);

  await ensureWorldTables(env);
  await ensureApprovalSessionsTable(env);
  const deleted=await env.DB.batch([
    env.DB.prepare(`DELETE FROM manager_change_votes WHERE request_id IN
      (SELECT id FROM manager_change_requests WHERE territory_id=?)`).bind(territoryId),
    env.DB.prepare(`DELETE FROM manager_change_requests WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`DELETE FROM territory_approval_sessions WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`UPDATE city_invites SET status='cancelled',responded_at=?,notification_claimed_at=NULL
      WHERE territory_id=? AND status='pending'`).bind(Date.now(),territoryId),
    env.DB.prepare(`DELETE FROM city_items WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`DELETE FROM city_customization WHERE territory_id=?`).bind(territoryId),
    env.DB.prepare(`DELETE FROM territories WHERE id=?`).bind(territoryId),
  ]);
  if(!deleted[deleted.length-1]?.meta?.changes)return json({ok:false,error:'City not found'},404);
  return json({ok:true});
}

async function updateTerritoryCoords(request, env) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const territoryId = String(body?.territoryId || "").trim();
  const x = Number(body?.x);
  const z = Number(body?.z);

  if (!territoryId || !isValidWorldCoordinate(x, z)) {
    return json({ ok: false, error: "Invalid coordinates" }, 400);
  }

  await env.DB.prepare(`
    UPDATE territories SET coords = ? WHERE id = ?
  `).bind(`X ${x} / Z ${z}`, territoryId).run();

  return json({ ok: true });
}

async function updateTerritoryOwner(request, env) {
  const auth=await requireMainInspector(request,env); if(auth.error)return auth.error;
  await ensureWorldTables(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim();
  const targetId=Number(body?.telegramId);
  if(!territoryId||!Number.isSafeInteger(targetId)||targetId<=0)return json({ok:false,error:'territoryId и Telegram ID обязательны'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.is_government||0)===1)return json({ok:false,error:'У государственной территории нет основателя/мэра'},400);
  const target=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,status FROM users WHERE telegram_id=? LIMIT 1`).bind(targetId).first();
  if(!target||target.status!=='verified')return json({ok:false,error:'Подтверждённый пользователь с таким Telegram ID не найден'},404);
  if(!String(target.mc_nickname||'').trim())return json({ok:false,error:'У пользователя не указан Minecraft-никнейм'},409);
  const oldOwner=Number(territory.owner_telegram_id||0);
  if(oldOwner===targetId)return json({ok:true,changed:false,owner:{telegram_id:targetId,telegram_username:target.telegram_username||null,mc_nickname:target.mc_nickname||null}});

  const expectedOwner=territory.owner_telegram_id??null;
  const now=Date.now();
  const statements=[
    env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=?
      WHERE id=? AND status='approved' AND owner_telegram_id IS ?
        AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified'
          AND trim(COALESCE(mc_nickname,''))=? AND trim(COALESCE(mc_nickname,''))<>'')`)
      .bind(targetId,target.telegram_username||null,target.mc_nickname,territoryId,expectedOwner,targetId,String(target.mc_nickname||'').trim()),
  ];
  if(oldOwner){
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(oldOwner,territoryId,now,territoryId,targetId));
    statements.push(env.DB.prepare(`DELETE FROM territory_managers WHERE telegram_id=? AND territory_id=?
      AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(oldOwner,territoryId,territoryId,targetId));
  }
  statements.push(
    env.DB.prepare(`DELETE FROM city_memberships WHERE telegram_id=? AND territory_id=?
      AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(targetId,territoryId,territoryId,targetId),
    env.DB.prepare(`DELETE FROM territory_managers WHERE telegram_id=? AND territory_id=?
      AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`)
      .bind(targetId,territoryId,territoryId,targetId),
  );
  await env.DB.batch(statements);
  const fresh=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(Number(fresh?.owner_telegram_id||0)!==targetId)return json({ok:false,error:'Владелец территории уже был изменён. Обновите данные и повторите действие.'},409);

  if(oldOwner) await hideRecruitmentIfContactLost(env,territoryId,oldOwner).catch(error=>console.error('Recruitment cleanup after owner replacement:',error));
  try { await ensureFirstCityMarker(env, territoryId); }
  catch (error) { console.error(JSON.stringify({ event: 'owner_assigned_marker_init_failed', territoryId: String(territoryId).slice(0, 80), code: 'OWNER_MARKER_INIT_FAILED' })); }
  try{await telegram(env,'sendMessage',{chat_id:targetId,text:`👑 Вы назначены основателем/мэром города «${escapeHtml(territory.name)}» главным инспектором.`,parse_mode:'HTML'})}catch{}
  if(oldOwner){try{await telegram(env,'sendMessage',{chat_id:oldOwner,text:`ℹ️ В городе «${escapeHtml(territory.name)}» изменён основной основатель/мэр. Вы остались жителем города.`,parse_mode:'HTML'})}catch{}}
  await evaluateAchievementsForTerritory(env, territoryId).catch(error=>console.error('Achievement evaluation after main inspector assigned founder:',error));
  return json({ok:true,owner:{telegram_id:targetId,telegram_username:target.telegram_username||null,mc_nickname:target.mc_nickname||null}});
}

async function updateTerritoryManager(request, env) {
  const auth=await requireMainInspector(request,env); if(auth.error)return auth.error;
  await ensureWorldTables(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),currentTelegramId=Number(body?.currentTelegramId);
  const wanted=normalizeUsername(body?.username||'').replace(/^@/,'');
  if(!territoryId||!Number.isSafeInteger(currentTelegramId)||currentTelegramId<=0)return json({ok:false,error:'territoryId и currentTelegramId обязательны'},400);
  const territory=await env.DB.prepare(`SELECT id,name,owner_telegram_id,is_government FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first();
  if(!territory)return json({ok:false,error:'City not found'},404);
  if(Number(territory.is_government||0)===1)return json({ok:false,error:'У государственной территории нет основателей/мэров'},400);
  const managers=await getTerritoryManagerRows(env,territoryId),currentManager=managers.find(m=>Number(m.telegram_id)===currentTelegramId);
  if(!currentManager)return json({ok:false,error:'Основатель/мэр не найден'},404);
  const oldUsername=normalizeUsername(currentManager.telegram_username||'');
  if(wanted.toLowerCase()===oldUsername.toLowerCase())return json({ok:true,changed:false,managers});
  const ownerId=Number(territory.owner_telegram_id||0),now=Date.now();
  let target=null;

  if(!wanted){
    if(ownerId===currentTelegramId){
      const next=managers.find(m=>Number(m.telegram_id)!==currentTelegramId);
      if(next){
        const nextUser=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>''`).bind(Number(next.telegram_id)).first();
        if(!nextUser)return json({ok:false,error:'Не удалось найти следующего подтверждённого основателя/мэра'},404);
        await env.DB.batch([
          env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=? WHERE id=? AND status='approved' AND owner_telegram_id=? AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'') AND EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?) AND EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')`).bind(Number(next.telegram_id),nextUser.telegram_username||null,nextUser.mc_nickname,territoryId,currentTelegramId,territoryId,Number(next.telegram_id),Number(next.telegram_id)),
          env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(territoryId,Number(next.telegram_id),territoryId,Number(next.telegram_id)),
          env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(territoryId,currentTelegramId,territoryId,Number(next.telegram_id)),
          env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(currentTelegramId,territoryId,now,territoryId,Number(next.telegram_id)),
        ]);
        const fresh=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=?`).bind(territoryId).first();
        if(Number(fresh?.owner_telegram_id||0)!==Number(next.telegram_id))return json({ok:false,error:'Состав управляющих уже изменился. Обновите данные и повторите действие.'},409);
      }else{
        await env.DB.batch([
          env.DB.prepare(`UPDATE territories SET owner_telegram_id=NULL,owner_telegram_username=NULL WHERE id=? AND status='approved' AND owner_telegram_id=?`).bind(territoryId,currentTelegramId),
          env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id IS NULL)`).bind(territoryId,currentTelegramId,territoryId),
          env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id IS NULL)`).bind(currentTelegramId,territoryId,now,territoryId),
        ]);
        const fresh=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=?`).bind(territoryId).first();
        if(fresh?.owner_telegram_id!==null)return json({ok:false,error:'Состав управляющих уже изменился. Обновите данные и повторите действие.'},409);
      }
    }else{
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?)`).bind(currentTelegramId,territoryId,now,territoryId,currentTelegramId),
        env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?)`).bind(territoryId,currentTelegramId,territoryId,currentTelegramId),
      ]);
      const [m,member]=await Promise.all([
        env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?`).bind(territoryId,currentTelegramId).first(),
        env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,currentTelegramId).first(),
      ]);
      if(m||!member)return json({ok:false,error:'Состав управляющих уже изменился. Обновите данные и повторите действие.'},409);
    }
  }else{
    target=await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname FROM users WHERE status='verified' AND lower(replace(telegram_username,'@',''))=lower(?) LIMIT 1`).bind(wanted).first();
    if(!target)return json({ok:false,error:'Подтверждённый пользователь с таким Telegram username не найден'},404);
    if(Number(target.telegram_id)===currentTelegramId)return json({ok:true,changed:false,managers});
    if(managers.some(m=>Number(m.telegram_id)===Number(target.telegram_id)))return json({ok:false,error:'Этот пользователь уже является основателем/мэром'},409);
    if(ownerId===currentTelegramId){
      await env.DB.batch([
        env.DB.prepare(`UPDATE territories SET owner_telegram_id=?,owner_telegram_username=?,owner_input=? WHERE id=? AND status='approved' AND owner_telegram_id=?`).bind(Number(target.telegram_id),target.telegram_username||wanted,target.mc_nickname||'',territoryId,currentTelegramId,Number(target.telegram_id)),
        env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(territoryId,Number(target.telegram_id),territoryId,Number(target.telegram_id)),
        env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(territoryId,Number(target.telegram_id),territoryId,Number(target.telegram_id)),
        env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(territoryId,currentTelegramId,territoryId,Number(target.telegram_id)),
        env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territories WHERE id=? AND owner_telegram_id=?)`).bind(currentTelegramId,territoryId,now,territoryId,Number(target.telegram_id)),
      ]);
      const fresh=await env.DB.prepare(`SELECT owner_telegram_id FROM territories WHERE id=?`).bind(territoryId).first();
      if(Number(fresh?.owner_telegram_id||0)!==Number(target.telegram_id))return json({ok:false,error:'Состав управляющих уже изменился. Обновите данные и повторите действие.'},409);
    }else{
      await env.DB.batch([
        env.DB.prepare(`INSERT OR IGNORE INTO city_memberships(telegram_id,territory_id,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?)`).bind(currentTelegramId,territoryId,now,territoryId,currentTelegramId),
        env.DB.prepare(`DELETE FROM territory_managers WHERE territory_id=? AND telegram_id=? AND EXISTS(SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?)`).bind(territoryId,currentTelegramId,territoryId,currentTelegramId),
        env.DB.prepare(`DELETE FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,Number(target.telegram_id)),
        env.DB.prepare(`INSERT OR IGNORE INTO territory_managers(territory_id,telegram_id,granted_by,granted_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE telegram_id=? AND status='verified' AND trim(COALESCE(mc_nickname,''))<>'')`).bind(territoryId,Number(target.telegram_id),Number(auth.user.id),now,Number(target.telegram_id)),
      ]);
      const [m,member]=await Promise.all([
        env.DB.prepare(`SELECT 1 FROM territory_managers WHERE territory_id=? AND telegram_id=?`).bind(territoryId,Number(target.telegram_id)).first(),
        env.DB.prepare(`SELECT 1 FROM city_memberships WHERE territory_id=? AND telegram_id=?`).bind(territoryId,currentTelegramId).first(),
      ]);
      if(!m||!member)return json({ok:false,error:'Состав управляющих уже изменился. Обновите данные и повторите действие.'},409);
    }
  }

  await hideRecruitmentIfContactLost(env,territoryId,currentTelegramId,oldUsername).catch(error=>console.error('Recruitment cleanup after manager replacement:',territoryId,error));
  if(target){try{await telegram(env,'sendMessage',{chat_id:Number(target.telegram_id),text:`👑 Вы назначены основателем/мэром города «${escapeHtml(territory.name)}» главным инспектором.`,parse_mode:'HTML'})}catch{}}
  try{await telegram(env,'sendMessage',{chat_id:currentTelegramId,text:`ℹ️ В городе «${escapeHtml(territory.name)}» вы больше не являетесь основателем/мэром.`,parse_mode:'HTML'})}catch{}
  const freshManagers=await getTerritoryManagerRows(env,territoryId);
  await notifyTerritoryManagers(env,territoryId,`ℹ️ В городе «${escapeHtml(territory.name)}» обновлён состав основателей/мэров.`,null);
  await evaluateAchievementsForTerritory(env,territoryId).catch(error=>console.error('Achievement evaluation after founder/manager update:',error));
  return json({ok:true,changed:true,managers:freshManagers});
}

async function saveRecruitment(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error;
  await ensureRecruitmentTable(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),description=String(body?.description||'').trim(),enabled=!!body?.enabled; if(!territoryId||!description)return json({ok:false,error:'territoryId and description are required'},400);
  const territory=await env.DB.prepare(`SELECT id,name FROM territories WHERE id=? AND status='approved'`).bind(territoryId).first(); if(!territory)return json({ok:false,error:'City not found'},404);
  if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Только основатель/мэр может редактировать объявление'},403);
  const requestedUsername=normalizeUsername(body?.recruitmentUsername)||'';
  const managers=await getTerritoryManagerRows(env,territoryId);
  let contactUsername='';
  if(requestedUsername){
    const wanted=requestedUsername.replace(/^@/,'').toLowerCase();
    const manager=managers.find(m=>String(m.telegram_username||'').replace(/^@/,'').toLowerCase()===wanted);
    contactUsername=manager?.telegram_username ? normalizeUsername(manager.telegram_username) : '';
  }
  if(!contactUsername) contactUsername=normalizeUsername(managers.find(m=>m.telegram_username)?.telegram_username)||'';
  await env.DB.prepare(`INSERT INTO recruitment(territory_id,description,enabled,updated_at,contact_username) VALUES(?,?,?,?,?) ON CONFLICT(territory_id) DO UPDATE SET description=excluded.description,enabled=excluded.enabled,updated_at=excluded.updated_at,contact_username=excluded.contact_username`).bind(territoryId,description,enabled?1:0,Date.now(),contactUsername||null).run(); return json({ok:true,recruitmentUsername:contactUsername});
}

async function setRecruitmentContact(request, env) {
  const auth=await requireUser(request,env); if(auth.error)return auth.error;
  await ensureRecruitmentTable(env);
  let body; try{body=await request.json()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const territoryId=String(body?.territoryId||'').trim(),telegramId=Number(body?.telegramId); if(!territoryId||!Number.isSafeInteger(telegramId)||telegramId<=0)return json({ok:false,error:'territoryId и telegramId обязательны'},400); if(!(await isTerritoryManager(env,territoryId,auth.user.id)))return json({ok:false,error:'Недостаточно прав'},403); if(!(await isTerritoryManager(env,territoryId,telegramId)))return json({ok:false,error:'Пользователь не является основателем/мэром города'},400);
  const u=await env.DB.prepare(`SELECT telegram_username FROM users WHERE telegram_id=?`).bind(telegramId).first(); const username=normalizeUsername(u?.telegram_username)||''; if(!username)return json({ok:false,error:'У этого основателя/мэра нет username в Telegram'},400);
  const existing=await env.DB.prepare(`SELECT description,enabled FROM recruitment WHERE territory_id=?`).bind(territoryId).first(); if(!existing)return json({ok:false,error:'Сначала сохраните объявление о наборе'},400);
  await env.DB.prepare(`UPDATE recruitment SET contact_username=?,updated_at=? WHERE territory_id=?`).bind(username,Date.now(),territoryId).run(); return json({ok:true,recruitmentUsername:username});
}


async function finalizeTerritoryApproval(env, chatId, id, name, owner, x, z, isGovernment=false) {
  const nx=Number(String(x).replace(",",".")),nz=Number(String(z).replace(",","."));
  if(!name||(!isGovernment&&!owner)||!Number.isFinite(nx)||!Number.isFinite(nz)||!isValidWorldCoordinate(nx,nz)){
    try{await telegram(env,"sendMessage",{chat_id:chatId,text:"⚠️ В поле координат должно быть 2 числа. Допустимый диапазон: от −3008 до 3007."})}catch(error){console.error('Approval validation notice failed:',error)}
    return false;
  }

  const palette=["#A855F7","#22C55E","#38BDF8","#F59E0B","#EF4444","#EC4899","#14B8A6","#8B5CF6","#F97316"];
  const accent=palette[Math.floor(Math.random()*palette.length)];
  await ensureWorldTables(env);
  const ownerUsername=normalizeUsername(owner).replace(/^@/,'');
  const ownerUser=ownerUsername
    ? await env.DB.prepare(`SELECT telegram_id,telegram_username FROM users WHERE lower(replace(telegram_username,'@',''))=lower(?) AND status='verified' LIMIT 1`).bind(ownerUsername).first()
    : null;

  const result=await env.DB.prepare(`
    UPDATE territories
    SET name=?,owner_input=?,coords=?,accent=?,status='approved',
        owner_telegram_id=?,owner_telegram_username=?,is_government=?
    WHERE id=? AND status='pending'
  `).bind(
    name.trim(),isGovernment?'Multi-Punk':owner.trim(),`X ${nx} / Z ${nz}`,accent,
    isGovernment?null:(ownerUser?Number(ownerUser.telegram_id):null),
    isGovernment?null:(ownerUsername||null),isGovernment?1:0,id
  ).run();

  if(!result.meta?.changes){
    try{await telegram(env,"sendMessage",{chat_id:chatId,text:"⚠️ Заявка не найдена или уже обработана."})}catch(error){console.error('Approval stale-session notice failed:',error)}
    return false;
  }

  // Approval is already committed. Complete all local post-processing before
  // attempting Telegram delivery, so a Telegram outage cannot strand the city.
  if(isGovernment){
    try{
      const governmentVisuals=await env.DB.prepare(`
        SELECT i.id,i.categories_text,c.name AS category_name
        FROM customization_items i
        LEFT JOIN customization_categories c ON c.id=i.category_id
        WHERE i.active=1 AND i.government_marker=1
        ORDER BY i.created_at DESC
      `).all();
      const marker=(governmentVisuals.results||[]).find(v=>visualHasTag(v,'метка'));
      if(marker)await env.DB.prepare(`INSERT INTO city_customization(territory_id,marker_item_id,updated_at)
        VALUES(?,?,?) ON CONFLICT(territory_id) DO UPDATE SET marker_item_id=excluded.marker_item_id,updated_at=excluded.updated_at`).bind(id,marker.id,Date.now()).run();
    }catch(error){console.error(JSON.stringify({event:'government_territory_postprocess_failed',territoryId:String(id).slice(0,80),code:'GOVERNMENT_VISUAL_INIT_FAILED'}))}
  }
  if(ownerUser?.telegram_id){
    await evaluateAchievementsForTerritory(env,id).catch(error=>console.error('Achievement evaluation after city approval:',error));
  }

  try{
    await telegram(env,"sendMessage",{
      chat_id:chatId,
      text:`✅ Город добавлен на карту\n\n🏙 ${name.trim()}\n${isGovernment?'🏛 Государственная территория':`👤 ${normalizeUsername(owner)||owner.trim()}`}\n📍 ${formatCoordinatePair(nx,nz)}`,
    });
  }catch(error){
    console.error(JSON.stringify({event:'territory_approval_notice_failed',territoryId:String(id).slice(0,80),code:'APPROVAL_TELEGRAM_NOTICE_FAILED'}));
  }
  return true;
}

function parseInspectorCityMessage(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 3) return null;
  const name = lines[0];
  const government = String(lines[1]).trim().toLowerCase() === 'multi-punk';
  const owner = government ? '' : (normalizeUsername(lines[1]) || lines[1]);
  const coords = parseTwoCoordinates(lines[2]);
  if (!name || (!government && !owner) || !coords) return null;
  return { name, owner, x: coords.x, z: coords.z, isGovernment: government };
}

function formatCoordinatePair(x, z) {
  const fmt = (value) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  return `${fmt(x)} ${fmt(z)}`;
}

async function handleNicknameCallback(env, callbackQuery, approved) {
  const actorId = String(callbackQuery.from?.id || "");
  const role = await getRoleByTelegramId(env, actorId);
  if (role !== "main_inspector" && role !== "inspector") {
    await telegram(env, "answerCallbackQuery", { callback_query_id: callbackQuery.id, text: "⛔ Недостаточно прав", show_alert: true });
    return json({ ok: true });
  }
  const parts = String(callbackQuery.data || "").split(":");
  const telegramId = Number(parts[1]);
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) return json({ ok: false, error: "Invalid Telegram ID" }, 400);
  const status = approved ? "verified" : "rejected";
  let result;
  try{
    result=await env.DB.prepare(
      "UPDATE users SET status = ? WHERE telegram_id = ? AND status = 'pending'"
    ).bind(status, telegramId).run();
  }catch(error){
    if(/account deletion in progress|account_deletion_locks|deletion.?lock/i.test(String(error?.message||error))){
      await telegram(env,"answerCallbackQuery",{callback_query_id:callbackQuery.id,text:"Аккаунт находится в процессе удаления",show_alert:true});
      return json({ok:true,ignored:true,reason:"account_deletion_in_progress"});
    }
    throw error;
  }

  const currentUser = await env.DB.prepare(
    "SELECT mc_nickname, status FROM users WHERE telegram_id = ?"
  ).bind(telegramId).first();

  const changed = Number(result.meta?.changes || 0) > 0;
  const actuallyVerified = currentUser?.status === "verified";
  const callbackText = approved
    ? (actuallyVerified ? "Ник подтверждён" : "Заявка уже обработана")
    : (changed ? "Заявка отклонена" : "Заявка уже обработана");

  await telegram(env, "answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: callbackText
  });
  try { await telegram(env, "editMessageReplyMarkup", { chat_id: callbackQuery.message.chat.id, message_id: callbackQuery.message.message_id, reply_markup: { inline_keyboard: [] } }); } catch {}
  if (actuallyVerified && currentUser?.mc_nickname) {
    try {
      await telegram(env, "sendMessage", {
        chat_id: telegramId,
        text: `✅ Ваш никнейм <code>${escapeHtml(currentUser.mc_nickname)}</code> подтверждён инспектором.`,
        parse_mode: "HTML"
      });
    } catch (error) { console.error("Could not notify nickname applicant:", error); }
  } else if (!approved && changed) {
    try {
      await telegram(env, "sendMessage", {
        chat_id: telegramId,
        text: "❌ Заявка на регистрацию отклонена инспектором."
      });
    } catch (error) { console.error("Could not notify nickname applicant:", error); }
  }
  if (actuallyVerified) {
    try { await syncGeyserSkinForUser(env,telegramId,currentUser?.mc_nickname,null); } catch(error){ console.error('Geyser skin sync after nickname approval:',error); }
    await notifyPendingInvitesForUser(env, telegramId);
  }
  return json({ ok: true });
}

async function startTerritoryApproval(env, chatId, territoryId) {
  await ensureApprovalSessionsTable(env);
  const territory = await env.DB.prepare(`SELECT id,name,owner_input,coords FROM territories WHERE id=? AND status='pending'`).bind(String(territoryId)).first();
  if (!territory) {
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ Заявка не найдена или уже обработана.' });
    return false;
  }
  await env.DB.prepare(`DELETE FROM territory_approval_sessions WHERE inspector_chat_id=?`).bind(String(chatId)).run();
  await env.DB.prepare(`
    INSERT INTO territory_approval_sessions(territory_id,inspector_chat_id,step,city_name,owner,x,z,updated_at)
    VALUES(?,?,1,?,?,'','',?)
    ON CONFLICT(territory_id) DO UPDATE SET inspector_chat_id=excluded.inspector_chat_id,step=1,city_name=excluded.city_name,owner=excluded.owner,x='',z='',updated_at=excluded.updated_at
  `).bind(String(territory.id),String(chatId),String(territory.name||''),String(territory.owner_input||''),Date.now()).run();
  await telegram(env, 'sendMessage', {
    chat_id: chatId,
    text: '✍️ Отправьте одним сообщением ровно 3 строки:\nНазвание территории\n@username основателя/мэра\nX Z (2 числа)\n\nДля государственной территории вместо username укажите: Multi-Punk'
  });
  return true;
}

async function handleTerritoryApprovalStep(env, message) {
  await ensureApprovalSessionsTable(env);
  const chatId = String(message.chat.id);
  const session = await env.DB.prepare(`SELECT * FROM territory_approval_sessions WHERE inspector_chat_id = ? ORDER BY updated_at DESC LIMIT 1`).bind(chatId).first();
  if (!session) return false;
  const parsed = parseInspectorCityMessage(message.text);
  if (!parsed) {
    await telegram(env, 'sendMessage', { chat_id: chatId, text: '⚠️ В поле координат должно быть 2 числа. Формат:\nНазвание территории\n@username основателя/мэра\nX Z' });
    return true;
  }
  const ok = await finalizeTerritoryApproval(env, chatId, session.territory_id, parsed.name, parsed.owner, parsed.x, parsed.z, parsed.isGovernment);
  if (ok) await env.DB.prepare('DELETE FROM territory_approval_sessions WHERE territory_id = ?').bind(session.territory_id).run();
  return true;
}

async function handleTerritoryCallback(env, callbackQuery) {
  const data = String(callbackQuery?.data || "");
  const [action, ...rest] = data.split(":");
  const id = rest.join(":");
  const actorRole = await getRoleByTelegramId(env, callbackQuery.from?.id);

  if (actorRole !== "main_inspector") {
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "⛔ Недостаточно прав",
      show_alert: true,
    });
    return json({ ok: true });
  }

  if (action === "territory_no") {
    const result = await env.DB.prepare(`
      UPDATE territories SET status = 'rejected'
      WHERE id = ? AND status = 'pending'
    `).bind(id).run();

    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: result.meta?.changes ? "Заявка отклонена" : "Заявка уже обработана",
    });

    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
    return json({ ok: true });
  }

  if (action === "territory_ok") {
    const territory = await env.DB.prepare(`
      SELECT id FROM territories WHERE id = ? AND status = 'pending'
    `).bind(id).first();

    if (!territory) {
      await telegram(env, "answerCallbackQuery", {
        callback_query_id: callbackQuery.id,
        text: "Заявка уже обработана",
        show_alert: true,
      });
      return json({ ok: true });
    }

    await startTerritoryApproval(env, callbackQuery.message.chat.id, id);
    await telegram(env, "answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Введите данные одним сообщением",
    });

    try {
      await telegram(env, "editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function saveCityAdditionalInfo(request, env) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  await ensureWorldTables(env);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const territoryId = String(body?.territoryId || '').trim();
  const value = String(body?.additionalInfo ?? body?.text ?? '').trim();
  if (!territoryId) return json({ ok: false, error: 'Выберите город' }, 400);
  if (value.length > 542) return json({ ok: false, error: 'Дополнительная информация не должна превышать 542 символа' }, 400);
  const city = await env.DB.prepare(`SELECT id,is_government,status FROM territories WHERE id=? LIMIT 1`).bind(territoryId).first();
  if (!city || city.status !== 'approved') return json({ ok: false, error: 'Город не найден' }, 404);
  if (Number(city.is_government || 0) === 1) return json({ ok: false, error: 'Для государственной территории это поле недоступно' }, 403);
  if (!(await isTerritoryManager(env, territoryId, Number(auth.user.id)))) return json({ ok: false, error: 'Изменять информацию может только основатель/мэр города' }, 403);
  await env.DB.prepare(`UPDATE territories SET additional_info=? WHERE id=?`).bind(value, territoryId).run();
  return json({ ok: true, additional_info: value });
}

function normalizeVisualCommandText(value) {
  return stripMinecraftFormatting(String(value || ''))
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/<\/?(?:b|strong|i|em|u|s|code|pre)>/gi, '')
    .replace(/&x(?:&[0-9a-fA-F]){6}/gi, '')
    .replace(/&(?:#[0-9a-fA-F]{6}|[0-9a-fK-OrR])/gi, '')
    .replace(/(^|\s)(\*\*|__|~~|`)(.+?)\2(?=\s|$)/g, '$1$3')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU');
}

function parseVisualInventoryCandidates(rawText, items) {
  return parseVisualInventoryCandidatesFromFeature(rawText, items, normalizeVisualCommandText);
}

async function health(env, request) {
  const result = {
    ok: false,
    worker: { status: "ok" },
    telegram: { status: "not_checked", tokenConfigured: Boolean(String(env.BOT_TOKEN || "").trim()) },
    database: { status: "not_checked" },
  };

  try {
    if (!env.DB) throw new Error("D1 binding missing");
    await env.DB.prepare("SELECT 1 AS ok").first();
    await env.DB.prepare("SELECT COUNT(*) AS count FROM territories").first();
    await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
    result.database = { status: "ok", readOnlyChecks: 3 };
  } catch (error) {
    result.database = { status: "error" };
    console.error(JSON.stringify({ event: "health_check_failed", component: "database", code: "D1_READ_FAILED" }));
  }

  const token = String(env.BOT_TOKEN || "").trim();
  if (!token) {
    result.telegram = { status: "not_configured", tokenConfigured: false };
  } else {
    try {
      const { response, data } = await telegram(env, "getMe", {});
      result.telegram = {
        status: response.ok && data?.ok ? "ok" : "error",
        tokenConfigured: true,
      };
    } catch (error) {
      result.telegram = { status: "error", tokenConfigured: true };
    }
  }

  result.ok = result.worker.status === "ok"
    && result.database.status === "ok"
    && result.telegram.status === "ok";
  return json(result, result.ok ? 200 : 503);
}

const {
  getTreasury,
  executeIdempotentFinancialTransfer,
  treasuryDeposit,
  treasuryDonate,
  treasuryWithdraw,
} = createTreasuryService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  json,
  getTerritoryManagerRows,
  notifyTerritoryManagers,
  escapeHtml,
});

const handleUserGemWithdrawal = createGemWithdrawalHandler({
  ensureWorldTables,
  ensureEventsTables,
  isTerritoryManager,
  executeIdempotentFinancialTransfer,
  telegram,
  json,
  stripMinecraftFormatting,
  notifyTerritoryManagers,
});

const handleVisualDiscountMessage = createVisualDiscountHandler({
  ensureWorldTables,
  normalizeVisualCommandText,
  stripMinecraftFormatting,
  visualHasTag,
  telegram,
  json,
});

const handleBankMessage = createTelegramBankHandler({
  ensureWorldTables,
  ensureEventsTables,
  ensureUserDirectoryTable,
  normalizeVisualCommandText,
  stripMinecraftFormatting,
  escapeHtml,
  formatTelegramNickname,
  telegram,
  json,
  notifyTerritoryManagers,
  parseVisualDiscountCommand,
  handleVisualDiscountMessage,
});

const {
  purgeExpiredEvents,
  getEvents,
  eventDateExceedsTwoMonths,
  addUtcCalendarMonths,
  calculateDiscountedPrice,
  createEvent,
  updateEvent,
  deleteEvent,
  saveEventReminder,
  deliverEventReminders,
} = createEventsService({
  ensureEventsTables,
  ensureWorldTables,
  ensureUserPreferenceTables,
  requireUser,
  requireMainInspector,
  getCurrentUser,
  getRoleByTelegramId,
  isTerritoryManager,
  json,
  telegram,
  normalizeUserTimezone,
  escapeHtml,
  stripMinecraftFormatting,
  formatEventTimeForUser,
  formatTerritoryCoords,
});

const {
  ensureFirstCityMarker,
  territoryCanUseVisual,
  reconcileTerritoryVisualEquipment,
} = createVisualEquipmentService({
  getTerritoryManagerRows,
});

const {
  evaluateAchievementsForTerritory,
  recheckAchievements,
} = createAchievementService({
  calculateTerritoryScores,
  ensureFirstCityMarker,
  sendTerritoryNotificationToUser,
  escapeHtml,
  requireMainInspector,
  ensureWorldTables,
  json,
});

const {
  saveRating,
  getRatings,
  addComment,
  updateComment,
  deleteComment,
  replyToComment,
  updateReply,
  deleteReply,
  getComments,
} = createTerritoryFeedbackService({
  requireUser,
  requireVerifiedUser,
  ensureWorldTables,
  getRoleByTelegramId,
  isTerritoryManager,
  calculateTerritoryScores,
  notifyTerritoryManagers,
  evaluateAchievementsForTerritory,
  normalizeUsername,
  formatTelegramNickname,
  escapeHtml,
  telegram,
  json,
});

const {
  uploadScreenshot,
  getScreenshots,
  moderateScreenshot,
  deleteScreenshot,
  serveScreenshot,
  handleScreenshotCallback,
} = createTerritoryScreenshotsService({
  requireUser,
  requireVerifiedUser,
  ensureWorldTables,
  getRoleByTelegramId,
  getTerritoryManagerRows,
  normalizeUsername,
  isTerritoryManager,
  telegram,
  TELEGRAM_API,
  evaluateAchievementsForTerritory,
  json,
  withCors,
});

const {
  createCustomizationItem,
  updateCustomizationItem,
  setCustomizationItemVisibility,
  deleteCustomizationItem,
  reorderCustomizationItems,
  reorderCustomizationTags,
} = createCustomizationAdminService({
  requireMainInspector,
  ensureWorldTables,
  json,
  achievementPayload,
  achievementRequirementError,
  cleanupCustomizationCategories,
  evaluateAchievementsForTerritory,
  reconcileTerritoryVisualEquipment,
  createId: () => crypto.randomUUID(),
});

const handleVisualInventoryCommand = createVisualInventoryHandler({
  ensureWorldTables,
  ensureUserDirectoryTable,
  normalizeVisualCommandText,
  reconcileTerritoryVisualEquipment,
  evaluateAchievementsForTerritory,
  ensureFirstCityMarker,
  escapeHtml,
  formatTelegramNickname,
  telegram,
  json,
});

const { getCustomization } = createCustomizationCatalogService({
  requireUser,
  ensureWorldTables,
  getTreasuryManagerCities,
  cleanupCustomizationCategories,
  getRoleByTelegramId,
  calculateDiscountedPrice,
  getTerritoryManagerRows,
  ensureFirstCityMarker,
  json,
});
const { toggleTerritoryAwardPlacement } = createTerritoryAwardPlacementService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  json,
});
const { serveCustomizationItemImage } = createCustomizationImageService({ withCors });
const { getCityCustomizationData, updateCityCustomization } = createCityAppearanceService({
  requireUser,
  ensureWorldTables,
  isTerritoryManager,
  visualHasTag,
  getTerritoryManagerRows,
  json,
});
const { purchaseCustomizationItem } = createCustomizationPurchaseService({
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
});
const {
  inviteResident,
  getCityManagement,
  cancelResidentInvite,
  removeResident,
  leaveTerritory,
  handleResidentInviteCallback,
  notifyPendingInvitesForUser,
  deliverPendingInviteNotifications,
} = createTerritoryMembershipService({
  requireUser,
  ensureWorldTables,
  json,
  normalizeMcNickname,
  isTerritoryManager,
  telegram,
  escapeHtml,
  getTerritoryManagerRows,
  skinUrlFromTexture,
  notifyTerritoryManagersDirect,
  formatTelegramNickname,
  hideRecruitmentIfContactLost,
  reconcileTerritoryVisualEquipment,
  evaluateAchievementsForTerritory,
  ensureFirstCityMarker,
});
const { applyManagerChange } = createManagerChangeService({
  telegram,
  escapeHtml,
  hideRecruitmentIfContactLost,
  notifyTerritoryManagers,
  evaluateAchievementsForTerritory,
});
const {
  claimManagerChangeFinalization,
  recordManagerChangeVote,
  finalizeManagerChangeRequest,
  expireManagerChangeRequests,
  isEligibleManagerChangeVoter,
  handleManagerVoteCallback,
} = createManagerChangeVotingService({
  ensureManagerChangeTables,
  applyManagerChange,
  telegram,
  escapeHtml,
  formatTelegramNickname,
  isTerritoryManager,
  json,
});
const webhook = createTelegramWebhookHandler({
  json,
  ensureWorldTables,
  telegram,
  syncTelegramUsernameEverywhere,
  getRoleByTelegramId,
  handleNicknameCallback,
  handleScreenshotCallback,
  handleResidentInviteCallback,
  handleManagerVoteCallback,
  handleTerritoryCallback,
  notifyPendingInvitesForUser,
  handleUserGemWithdrawal,
  handleBankMessage,
  handleTerritoryApprovalStep,
  handleVisualInventoryCommand,
});

export default {
  async scheduled(controller, env, ctx) {
    const now=Number(controller?.scheduledTime || Date.now());
    let scheduledError=null;
    try {
      const result=await deliverEventReminders(env, now);
      console.log(JSON.stringify({event:'event_reminder_cron_completed',processed:Number(result?.processed||0),cron:String(controller?.cron||'unknown')}));
    } catch (error) {
      scheduledError=error;
      console.error(JSON.stringify({ event: 'event_reminder_cron_failed', code: 'SCHEDULED_HANDLER_FAILED', message:String(error?.message||error).slice(0,180) }));
    }
    try {
      const deleted=await purgeExpiredEvents(env,now);
      if(deleted)console.log(JSON.stringify({event:'expired_events_purged',count:deleted}));
    } catch (error) {
      console.error(JSON.stringify({event:'expired_events_purge_failed',code:'EVENT_PURGE_FAILED',message:String(error?.message||error).slice(0,180)}));
      scheduledError=scheduledError||error;
    }
    try {
      const finalized=await expireManagerChangeRequests(env,now);
      if(finalized)console.log(JSON.stringify({event:'manager_change_requests_expired',count:finalized}));
    } catch (error) {
      console.error(JSON.stringify({event:'manager_change_expiry_failed',code:'MANAGER_CHANGE_EXPIRY_FAILED',message:String(error?.message||error).slice(0,180)}));
      scheduledError=scheduledError||error;
    }
    try {
      const result=await deliverPendingInviteNotifications(env);
      if(result.delivered)console.log(JSON.stringify({event:'pending_invite_notifications_delivered',count:result.delivered,scanned:result.scanned}));
    } catch (error) {
      console.error(JSON.stringify({event:'pending_invite_notification_retry_failed',code:'INVITE_NOTIFICATION_RETRY_FAILED',message:String(error?.message||error).slice(0,180)}));
      scheduledError=scheduledError||error;
    }
    if(scheduledError)throw scheduledError;
  },
  async fetch(request, env, ctx) {
    const requestStartedAt = Date.now();
    const requestId = crypto.randomUUID();
    let response;
    try {
      response = await (async () => {
        try {
          const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return health(env, request);
    }

    if (url.pathname === "/api/admin/awards" && request.method === "GET") return getAdminAwards(request, env, { requireMainInspector, ensureWorldTables, json });
    if (url.pathname === "/api/admin/awards" && request.method === "POST") return grantTerritoryAward(request, env, { requireMainInspector, ensureWorldTables, json, notifyTerritoryManagers, escapeHtml });
    if (url.pathname.startsWith("/api/admin/awards/") && request.method === "DELETE") {
      return deleteTerritoryAwardById(request, env, decodeURIComponent(url.pathname.split("/").pop() || ""), { requireMainInspector, ensureWorldTables, json });
    }
    if (url.pathname === "/api/admin/award-packs" && request.method === "POST") return addTelegramAwardPack(request, env, { requireMainInspector, ensureWorldTables, json, telegram, parseTelegramEmojiSetName, isTelegramCustomEmojiSet, getTelegramStickerFormat });
    if (url.pathname.startsWith("/api/admin/award-packs/") && request.method === "DELETE") {
      return deleteTelegramAwardPack(request, env, decodeURIComponent(url.pathname.split("/").pop() || ""), { requireMainInspector, ensureWorldTables, json });
    }
    if (url.pathname === "/api/admin/diagnostics/d1" && request.method === "GET") {
      return getD1Diagnostics(request, env, { requireMainInspector, json });
    }

    if (url.pathname === "/api/telegram-sticker" && request.method === "GET") {
      return serveTelegramAwardSticker(request, env, { TELEGRAM_API, withCors, ensureWorldTables, telegram });
    }

    if (url.pathname === "/api/territories" && request.method === "GET") {
      return getTerritories(request, env);
    }

    if (url.pathname === "/api/territories" && request.method === "POST") {
      return createTerritory(request, env);
    }

    if (url.pathname === "/api/events" && request.method === "GET") return getEvents(request, env);
    if (url.pathname === "/api/events" && request.method === "POST") return createEvent(request, env);
    if (url.pathname === "/api/events" && request.method === "PATCH") return updateEvent(request, env);
    if (url.pathname === "/api/events" && request.method === "DELETE") return deleteEvent(request, env);
    if (url.pathname === "/api/events/reminder" && request.method === "POST") return saveEventReminder(request, env, false);
    if (url.pathname === "/api/events/reminder" && request.method === "DELETE") return saveEventReminder(request, env, true);
    if (url.pathname === "/api/city/additional-info" && request.method === "POST") return saveCityAdditionalInfo(request, env);

    if (url.pathname === "/api/me" && request.method === "POST") {
      return getMe(request, env, ctx);
    }

    if (url.pathname === "/api/profile/claim" && request.method === "POST") {
      return claimNickname(request, env);
    }

    if (url.pathname === "/api/territories/claim-owner" && request.method === "POST") {
      return claimTerritoryOwner(request, env);
    }

    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      return listManagedUsers(request, env);
    }
    if (url.pathname === "/api/admin/users" && request.method === "POST") {
      return addManagedUser(request, env);
    }
    if (url.pathname.startsWith("/api/admin/users/") && request.method === "PATCH") {
      return updateManagedUser(request, env, url.pathname.split("/").pop());
    }
    if (url.pathname.startsWith("/api/admin/users/") && request.method === "DELETE") {
      return deleteManagedUser(request, env, url.pathname.split("/").pop());
    }
    if (url.pathname.startsWith("/api/admin/users/update/") && request.method === "POST") {
      return updateManagedUser(request, env, url.pathname.split("/").pop());
    }
    if (url.pathname.startsWith("/api/admin/users/delete/") && request.method === "POST") {
      return deleteManagedUser(request, env, url.pathname.split("/").pop());
    }

    if (url.pathname === "/api/inspectors/list" && request.method === "POST") {
      return listInspectors(request, env);
    }

    if (url.pathname === "/api/inspectors" && request.method === "POST") {
      return addInspector(request, env);
    }

    if (url.pathname.startsWith("/api/inspectors/") && request.method === "DELETE") {
      return removeInspector(request, env, url);
    }

    if (url.pathname === "/api/ratings" && request.method === "POST") {
      return saveRating(request, env);
    }

    if (url.pathname === "/api/ratings" && request.method === "GET") {
      return getRatings(request, env, url);
    }

    if (url.pathname === "/api/comments" && request.method === "POST") {
      return addComment(request, env);
    }

    if (url.pathname === "/api/comments" && request.method === "GET") {
      return getComments(request, env, url);
    }

    if (url.pathname === "/api/comments" && request.method === "PATCH") {
      return updateComment(request, env);
    }

    if (url.pathname === "/api/comments" && request.method === "DELETE") {
      return deleteComment(request, env);
    }
    if (url.pathname === "/api/comments/update" && request.method === "POST") {
      return updateComment(request, env);
    }
    if (url.pathname === "/api/comments/delete" && request.method === "POST") {
      return deleteComment(request, env);
    }

    if (url.pathname === "/api/comments/reply" && request.method === "POST") {
      return replyToComment(request, env);
    }
    if (url.pathname === "/api/comments/reply" && request.method === "PATCH") {
      return updateReply(request, env);
    }
    if (url.pathname === "/api/comments/reply" && request.method === "DELETE") {
      return deleteReply(request, env);
    }

    if (url.pathname === "/api/screenshots" && request.method === "POST") {
      return uploadScreenshot(request, env);
    }

    if (url.pathname === "/api/screenshots" && request.method === "GET") {
      return getScreenshots(request, env, url);
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "GET") {
      return serveScreenshot(request, env, url.pathname.split("/").pop());
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "DELETE") {
      const screenshotId = url.pathname.split("/").pop();
      return deleteScreenshot(request, env, screenshotId);
    }

    if (url.pathname.startsWith("/api/screenshots/") && request.method === "POST") {
      const screenshotId = url.pathname.split("/").pop();
      return moderateScreenshot(request, env, screenshotId);
    }

    if (url.pathname === "/api/admin/territories/rename" && request.method === "POST") {
      return renameTerritory(request, env);
    }

    if (url.pathname === "/api/admin/territories/delete" && request.method === "POST") {
      return deleteTerritory(request, env);
    }

    if (url.pathname === "/api/admin/territories/coords" && request.method === "POST") {
      return updateTerritoryCoords(request, env);
    }

    if (url.pathname === "/api/admin/territories/owner" && request.method === "POST") {
      return updateTerritoryOwner(request, env);
    }

    if (url.pathname === "/api/admin/territories/manager" && request.method === "POST") {
      return updateTerritoryManager(request, env);
    }

    if (url.pathname === "/api/user-settings" && request.method === "GET") {
      return getUserSettings(request, env);
    }
    if (url.pathname === "/api/user-settings" && request.method === "POST") {
      return saveUserSettings(request, env);
    }

    if (url.pathname === "/api/admin/global-settings" && request.method === "GET") {
      return getAdminGlobalSettings(request, env, { requireMainInspector, ensureGlobalSettingsTable, json });
    }
    if (url.pathname === "/api/admin/global-settings" && request.method === "POST") {
      return saveAdminGlobalSetting(request, env, { requireMainInspector, ensureGlobalSettingsTable, json });
    }

    if (url.pathname === "/api/map" && (request.method === "GET" || request.method === "HEAD")) {
      return getMapSettings(request, env);
    }

    if (url.pathname === "/api/map" && request.method === "POST") {
      return saveMapSettings(request, env, requestId);
    }
    if (url.pathname === "/api/faq" && request.method === "GET") {
      return getFaq(env, { ensureMapSettingsTable, json });
    }

    if (url.pathname === "/api/faq" && request.method === "POST") {
      return saveFaq(request, env, { requireMainInspector, ensureMapSettingsTable, json });
    }

    if (url.pathname === "/api/home-feature-button" && request.method === "GET") {
      return getHomeFeatureButton(request, env, { requireUser, ensureWorldTables, ensureMapSettingsTable, getRoleByTelegramId, json });
    }
    if (url.pathname === "/api/home-feature-button" && request.method === "POST") {
      return saveHomeFeatureButton(request, env, { requireMainInspector, ensureMapSettingsTable, json });
    }

    if (url.pathname === "/api/request-inspector-rating" && request.method === "POST") {
      return requestInspectorRating(request, env);
    }

    if (url.pathname === '/api/vox-grid' && request.method === 'GET') {
      const cells = await getVoxGrid(env);
      const auth = await requireUser(request, env);
      const canEdit = !auth.error && (await getRoleByTelegramId(env, auth.user.id, auth.user.username)) === 'main_inspector';
      return json({ ok: true, cells, canEdit });
    }
    if (url.pathname === '/api/vox-grid' && request.method === 'POST') {
      return saveVoxCell(request, env);
    }
    if (url.pathname === '/api/vox-grid/reset' && request.method === 'POST') {
      return resetVoxGrid(request, env);
    }
    if (url.pathname === '/api/treasury' && request.method === 'GET') return getTreasury(request, env);
    if (url.pathname === '/api/treasury/deposit' && request.method === 'POST') return treasuryDeposit(request, env);
    if (url.pathname === '/api/treasury/donate' && request.method === 'POST') return treasuryDonate(request, env);
    if (url.pathname === '/api/treasury/withdraw' && request.method === 'POST') return treasuryWithdraw(request, env);
    if (url.pathname === '/api/customization' && request.method === 'GET') {
      return getCustomization(request, env);
    }
    if (url.pathname === '/api/achievements/recheck' && request.method === 'POST') {
      return recheckAchievements(request, env);
    }
    if (url.pathname === '/api/customization/items' && request.method === 'POST') {
      return createCustomizationItem(request, env);
    }
    if (url.pathname === '/api/customization/items/visibility' && request.method === 'POST') {
      return setCustomizationItemVisibility(request, env);
    }
    if (request.method === 'GET' && /^\/api\/customization\/items\/[^/]+\/image$/.test(url.pathname)) {
      const itemId = decodeURIComponent(url.pathname.split('/').slice(-2, -1)[0] || '');
      return serveCustomizationItemImage(request, env, itemId);
    }
    if (url.pathname.startsWith('/api/customization/items/') && request.method === 'PATCH') {
      return updateCustomizationItem(request, env, url.pathname.split('/').pop());
    }
    if (url.pathname.startsWith('/api/customization/items/') && request.method === 'DELETE') {
      return deleteCustomizationItem(request, env, url.pathname.split('/').pop());
    }
    if (url.pathname === '/api/customization/items/reorder' && request.method === 'POST') {
      return reorderCustomizationItems(request, env);
    }
    if (url.pathname === '/api/customization/tags/reorder' && request.method === 'POST') {
      return reorderCustomizationTags(request, env);
    }
    if (url.pathname === '/api/customization/purchase' && request.method === 'POST') {
      return purchaseCustomizationItem(request, env, ctx);
    }
    if (url.pathname === '/api/customization/city/award' && request.method === 'POST') {
      return toggleTerritoryAwardPlacement(request, env);
    }
    if (url.pathname === '/api/customization/city' && request.method === 'POST') {
      return updateCityCustomization(request, env);
    }
    if (url.pathname === '/api/customization/city' && request.method === 'GET') {
      return getCityCustomizationData(request, env, url);
    }
    if (url.pathname === '/api/city/invite' && request.method === 'POST') {
      return inviteResident(request, env);
    }
    if (url.pathname === '/api/city/invite/cancel' && request.method === 'POST') {
      return cancelResidentInvite(request, env);
    }
    if (url.pathname === '/api/city/remove-resident' && request.method === 'POST') { return removeResident(request, env); }
    if (url.pathname === '/api/city/leave' && request.method === 'POST') { return leaveTerritory(request, env); }
    if (url.pathname === '/api/city/promote-resident' && request.method === 'POST') { return promoteResident(request, env); }
    if (url.pathname === '/api/city/demote-manager' && request.method === 'POST') { return demoteManager(request, env); }
    if (url.pathname === '/api/city/management' && request.method === 'GET') {
      return getCityManagement(request, env, url);
    }
    if (url.pathname === "/api/recruitment" && request.method === "GET") {
      return getRecruitment(env);
    }

    if (url.pathname === "/api/recruitment" && request.method === "POST") { return saveRecruitment(request, env); }
    if (url.pathname === "/api/recruitment/contact" && request.method === "POST") { return setRecruitmentContact(request, env); }

    if (url.pathname === "/api/webhook" && request.method === "POST") {
      return webhook(request, env);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        worker: "voxygen",
        message: "Voxygen backend is running",
        endpoints: {
          health: "/api/health",
          territories: "/api/territories",
          me: "/api/me",
          inspectors: "/api/inspectors",
          ratings: "/api/ratings",
          comments: "/api/comments",
          screenshots: "/api/screenshots",
          recruitment: "/api/recruitment",
          events: "/api/events",
          faq: "/api/faq",
          requestInspectorRating: "/api/request-inspector-rating",
          webhook: "/api/webhook",
        },
      });
    }

    return json({
      ok: false,
      error: "Route not found",
      pathname: url.pathname,
    }, 404);
        } catch (error) {
          console.error(JSON.stringify({
            event: "worker_request_failed",
            requestId,
            route: new URL(request.url).pathname,
            method: request.method,
            code: "INTERNAL_ERROR",
            errorType: String(error?.name || "Error").slice(0, 40),
          }));
          return json({ ok: false, error: "Сервер временно недоступен. Повторите попытку.", code: "INTERNAL_ERROR" }, 500);
        }
      })();
    } catch (error) {
      // Route handlers often return promises. A rejection from one of those
      // promises reaches this outer catch, so retain its safe diagnostic details.
      const errorMessage = String(error?.message || error || "Unknown error")
        .replace(/[\\r\\n\\t]+/g, " ")
        .slice(0, 300);
      console.error(JSON.stringify({
        event: "worker_response_failed",
        requestId,
        route: new URL(request.url).pathname,
        method: request.method,
        code: "RESPONSE_ERROR",
        errorType: String(error?.name || "Error").slice(0, 40),
        errorMessage,
      }));
      response = json({ ok: false, error: "Сервер временно недоступен. Повторите попытку.", code: "RESPONSE_ERROR" }, 500);
    }

    const headers = new Headers(response.headers);
    headers.set("X-Request-ID", requestId);
    const workerTiming = `worker;dur=${Math.max(0, Date.now() - requestStartedAt)}`;
    const routeTiming = headers.get('Server-Timing');
    headers.set('Server-Timing', routeTiming ? `${routeTiming}, ${workerTiming}` : workerTiming);
    if (response.status >= 400) {
      let responseCode = response.status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR";
      try {
        const body = await response.clone().json();
        if (body && typeof body.code === "string") responseCode = body.code.slice(0, 64);
      } catch {}
      const log = {
        event: "api_response_error",
        requestId,
        route: new URL(request.url).pathname,
        method: request.method,
        status: response.status,
        code: responseCode,
      };
      (response.status >= 500 ? console.error : console.warn)(JSON.stringify(log));
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export { formatGemWithdrawalBankerNotification, applyManagerChange, verifyInitData, parseGemWithdrawalCommand, parseBankCommand, parseVisualDiscountCommand,  eventDateExceedsTwoMonths, addUtcCalendarMonths, calculateDiscountedPrice, parseVisualInventoryCandidates, isPrivateBankerMessage, applyBankBalanceChange, executeIdempotentFinancialTransfer, isTerritoryManager, isEligibleManagerChangeVoter, territoryCanUseVisual, completeRequiredAccountCleanup, claimManagerChangeFinalization, recordManagerChangeVote, transferTerritoryOwnerAfterAccountRemoval, buildStaleDestinationOwnerTransferStatements, preserveAccountHistoryAuthor, buildFounderClaimStatement, buildOrphanedOwnerRepairStatement, buildUnclaimedOwnerRepairStatement };
