export const DEFAULT_FAQ_TEXT = `Voxygen — карта городов и их жителей.

Города: карта, страницы городов, оценки, отзывы и скрины.

Добавить: заявка проходит через главного инспектора, который вручную создаёт город.

Инспекторы: оценивают города и оставляют инспекторские комментарии.

Жители: получают приглашения в город через Telegram-бота.

Визуал: метки и другие элементы оформления города.

Чтобы дополнить или обновить карту Vox, создайте, полностью заполните карту без локатора 2-го уровня и отправьте на почтовый адрес "Vox" (карта будет отсканирована и отправлена адресанту, возможно с вознаграждением).`;

export async function getFaq(env, { ensureMapSettingsTable, json }) {
  try {
    await ensureMapSettingsTable(env);
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = 'faq_text'").first();
    const legacyFaq = `Voxygen — карта городов и их жителей.

Города: карта, страницы городов, оценки, отзывы и скрины.

Добавить: заявка проходит через главного инспектора, который вручную создаёт город.

Инспекторы: оценивают города и оставляют инспекторские комментарии.

Жители: получают приглашения в город через Telegram-бота.

Визуал: метки и другие элементы оформления города.`;
    const text = !row?.value || row.value.trim() === legacyFaq.trim() ? DEFAULT_FAQ_TEXT : row.value;
    return json({ ok: true, text });
  } catch (error) {
    console.error('GET FAQ settings error:', error);
    return json({ ok: false, error: 'Database error', details: String(error) }, 500);
  }
}

export async function saveFaq(request, env, { requireMainInspector, ensureMapSettingsTable, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }
  const text = String(body?.text || '').trim();
  if (!text) return json({ ok: false, error: 'Текст ЧиВо не может быть пустым' }, 400);
  if (text.length > 12000) return json({ ok: false, error: 'Текст ЧиВо слишком длинный' }, 400);
  try {
    await ensureMapSettingsTable(env);
    await env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('faq_text', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(text, Date.now()).run();
    return json({ ok: true, text });
  } catch (error) {
    console.error('SAVE FAQ settings error:', error);
    return json({ ok: false, error: 'Database error', details: String(error) }, 500);
  }
}

export const DEFAULT_HOME_FEATURE_BUTTON = Object.freeze({
  imageData: '',
  title: 'Информация',
  subtitle: '',
  text: '',
  hidden: false,
});

export function normalizeHomeFeatureButton(rawValue) {
  let stored = {};
  try { stored = rawValue ? JSON.parse(rawValue) : {}; } catch {}
  return {
    imageData: typeof stored.imageData === 'string' && stored.imageData.startsWith('data:image/') && stored.imageData.length <= 1_400_000 ? stored.imageData : '',
    title: String(stored.title || DEFAULT_HOME_FEATURE_BUTTON.title).slice(0, 80),
    subtitle: String(stored.subtitle || DEFAULT_HOME_FEATURE_BUTTON.subtitle).slice(0, 140),
    text: String(stored.text ?? DEFAULT_HOME_FEATURE_BUTTON.text).slice(0, 6000),
    hidden: stored.hidden === true,
  };
}

export async function getHomeFeatureButton(request, env, { requireUser, ensureWorldTables, ensureMapSettingsTable, getRoleByTelegramId, json }) {
  const auth = await requireUser(request, env);
  if (auth.error) return auth.error;
  try {
    await ensureWorldTables(env);
    await ensureMapSettingsTable(env);
    const row = await env.DB.prepare(`SELECT value FROM app_settings WHERE key='home_feature_button' LIMIT 1`).first();
    const config = normalizeHomeFeatureButton(row?.value || '');
    const role = await getRoleByTelegramId(env, auth.user.id, auth.user.username);
    if (config.hidden && role !== 'main_inspector') {
      return json({ ok: true, config: { ...DEFAULT_HOME_FEATURE_BUTTON, hidden: true } });
    }
    return json({ ok: true, config });
  } catch (error) {
    console.error('GET home feature button settings error:', error);
    return json({ ok: false, error: 'Database error', details: String(error) }, 500);
  }
}

export async function saveHomeFeatureButton(request, env, { requireMainInspector, ensureMapSettingsTable, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;

  let body;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const imageData = String(body?.imageData || '').trim();
  if (imageData && (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(imageData) || imageData.length > 1_400_000)) {
    return json({ ok: false, error: 'Изображение кнопки не поддерживается или слишком большое' }, 413);
  }
  const config = {
    imageData,
    title: String(body?.title || '').trim().slice(0, 80) || DEFAULT_HOME_FEATURE_BUTTON.title,
    subtitle: String(body?.subtitle || '').trim().slice(0, 140) || DEFAULT_HOME_FEATURE_BUTTON.subtitle,
    text: String(body?.text ?? '').trim().slice(0, 6000),
    hidden: body?.hidden === true,
  };

  try {
    await ensureMapSettingsTable(env);
    await env.DB.prepare(`
      INSERT INTO app_settings (key, value, updated_at) VALUES ('home_feature_button', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).bind(JSON.stringify(config), Date.now()).run();
    return json({ ok: true, config });
  } catch (error) {
    console.error('SAVE home feature button settings error:', error);
    return json({ ok: false, error: 'Database error', details: String(error) }, 500);
  }
}
