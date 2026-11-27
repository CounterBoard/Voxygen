function parseAchievementRequirement(value, max=2147483647, integer=false) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) return NaN;
  return n;
}

export function achievementPayload(body) {
  const enabled = body?.achievementEnabled === true || body?.achievementEnabled === 1 || body?.achievementEnabled === '1' || body?.achievementEnabled === 'true';
  const requirements = {
    residents: enabled ? parseAchievementRequirement(body?.achievementResidents, 1000000, true) : null,
    gems: enabled ? parseAchievementRequirement(body?.achievementGems, 2147483647, true) : null,
    inspectorScore: enabled ? parseAchievementRequirement(body?.achievementInspectorScore, 10) : null,
    playerScore: enabled ? parseAchievementRequirement(body?.achievementPlayerScore, 10) : null,
    screenshots: enabled ? parseAchievementRequirement(body?.achievementScreenshots, 1000000, true) : null,
    comments: enabled ? parseAchievementRequirement(body?.achievementComments, 1000000, true) : null,
    visuals: enabled ? parseAchievementRequirement(body?.achievementVisuals, 1000000, true) : null,
  };
  const invalid = Object.entries(requirements).filter(([, value]) => Number.isNaN(value)).map(([key]) => key);
  return { enabled, ...requirements, invalid };
}

export function achievementRequirementError(achievement) {
  if (!achievement?.invalid?.length) return null;
  const labels = {
    residents: 'жители (целое число)', gems: 'самоцветы (целое число)',
    inspectorScore: 'оценка инспектора от 0 до 10', playerScore: 'оценка игроков от 0 до 10',
    screenshots: 'скриншоты (целое число)', comments: 'комментарии (целое число)', visuals: 'визуалы (целое число)',
  };
  return `Проверьте условия достижения: ${achievement.invalid.map(key => labels[key] || key).join(', ')}.`;
}

export function createAchievementService({
  calculateTerritoryScores,
  ensureFirstCityMarker,
  sendTerritoryNotificationToUser,
  escapeHtml,
  requireMainInspector,
  ensureWorldTables,
  json,
} = {}) {
  function meetsAchievementRequirements(actual, requirements) {
    const specified = Object.entries(requirements).filter(([, threshold]) => threshold !== null && threshold !== undefined);
    if (!specified.length) return false;
    return specified.every(([key, threshold]) => {
      const needed = Number(threshold);
      const current = Number(actual[key]);
      return Number.isFinite(needed) && needed >= 0 && Number.isFinite(current) && current >= needed;
    });
  }
  
  async function countTerritoryVisuals(env, territoryId) {
    // A territory's achievement progress counts only its own inventory, not visuals
    // purchased personally by residents or managers.
    const row = await env.DB.prepare(`
      SELECT COUNT(DISTINCT ci.item_id) AS value
      FROM city_items ci
      JOIN customization_items i ON i.id=ci.item_id AND i.active=1
      WHERE ci.territory_id=?
    `).bind(territoryId).first();
    return Number(row?.value || 0);
  }
  
  async function evaluateAchievementsForTerritory(env, territoryId) {
    const territory = await env.DB.prepare(`
      SELECT id,name,owner_telegram_id,status FROM territories WHERE id=? AND status='approved'
    `).bind(territoryId).first();
    if (!territory || !(Number(territory.owner_telegram_id || 0) > 0)) return { checked: false, skipped: 'no_founder', awarded: 0 };
  
    const itemsResult = await env.DB.prepare(`
      SELECT id,name,achievement_residents,achievement_gems,achievement_inspector_score,
             achievement_player_score,achievement_screenshots,achievement_comments,
             achievement_visuals
      FROM customization_items
      WHERE active=1 AND achievement_enabled=1
      ORDER BY created_at ASC, id ASC
    `).all();
    const items = itemsResult.results || [];
    if (!items.length) return { checked: true, awarded: 0 };
  
    const residentsRow = await env.DB.prepare(`
      SELECT COUNT(DISTINCT telegram_id) AS value FROM (
        SELECT telegram_id FROM city_memberships WHERE territory_id=?
        UNION
        SELECT telegram_id FROM territory_managers WHERE territory_id=?
        UNION
        SELECT owner_telegram_id AS telegram_id FROM territories WHERE id=? AND owner_telegram_id IS NOT NULL
      ) people
    `).bind(territoryId, territoryId, territoryId).first();
    const gemsRow = await env.DB.prepare(`
      SELECT COALESCE(SUM(amount),0) AS value FROM gem_spend_log WHERE territory_id=?
    `).bind(territoryId).first();
    const calculatedScores = await calculateTerritoryScores(env, territoryId);
    const screenshotsRow = await env.DB.prepare(`
      SELECT COUNT(*) AS value FROM screenshots WHERE territory_id=? AND status='approved'
    `).bind(territoryId).first();
    const commentsRow = await env.DB.prepare(`
      SELECT COUNT(*) AS value FROM comments WHERE territory_id=?
    `).bind(territoryId).first();
    const actual = {
      residents: Number(residentsRow?.value || 0),
      gems: Number(gemsRow?.value || 0),
      inspector_score: Number(calculatedScores?.curator || 0),
      player_score: Number(calculatedScores?.community || 0),
      screenshots: Number(screenshotsRow?.value || 0),
      comments: Number(commentsRow?.value || 0),
      visuals: 0,
    };
    let newlyAwarded = 0;
    let repeat = true;
    let passes = 0;
    // Awarding one achievement adds that visual to the city inventory. Re-check in passes
    // so another achievement that depends on the newly acquired visual can unlock in the same run.
    while (repeat && passes <= items.length) {
      repeat = false;
      passes++;
      actual.visuals = await countTerritoryVisuals(env, territoryId);
  
      for (const item of items) {
        const requirements = {
          residents: item.achievement_residents,
          gems: item.achievement_gems,
          inspector_score: item.achievement_inspector_score,
          player_score: item.achievement_player_score,
          screenshots: item.achievement_screenshots,
          comments: item.achievement_comments,
          visuals: item.achievement_visuals,
        };
        if (!meetsAchievementRequirements(actual, requirements)) continue;
  
        // Make reward delivery self-healing: an old award row must not prevent repair of a
        // missing city_items row if a prior request partially failed.
        const cityItem = await env.DB.prepare(`
          INSERT OR IGNORE INTO city_items(territory_id,item_id,acquired_at,source)
          VALUES(?,?,?,'achievement')
        `).bind(territoryId, item.id, Date.now()).run();
        if (cityItem.meta?.changes) {
          repeat = true;
          try { await ensureFirstCityMarker(env, territoryId); }
          catch (error) { console.error('Achievement marker initialization error:', error); }
        }
  
        const award = await env.DB.prepare(`
          INSERT OR IGNORE INTO achievement_awards(territory_id,item_id,awarded_at)
          VALUES(?,?,?)
        `).bind(territoryId, item.id, Date.now()).run();
        if (award.meta?.changes) {
          newlyAwarded++;
          try {
            await sendTerritoryNotificationToUser(env, territoryId, Number(territory.owner_telegram_id),
              `🏆 Достижение выполнено!\n\n🏙 ${escapeHtml(territory.name)}\n✨ Получен визуал: <b>${escapeHtml(item.name)}</b>`,
              { parse_mode: 'HTML' });
          } catch (error) {
            console.error('Achievement notification error:', error);
          }
        }
      }
    }
    return { checked: true, awarded: newlyAwarded, passes };
  }
  
  async function recheckAchievements(request, env) {
    const auth = await requireMainInspector(request, env);
    if (auth.error) return auth.error;
    await ensureWorldTables(env);
    const rows = await env.DB.prepare(`SELECT id FROM territories WHERE status='approved' ORDER BY created_at ASC, id ASC`).all();
    let checked = 0, awarded = 0, skipped = 0, errors = 0;
    for (const row of rows.results || []) {
      try {
        const result = await evaluateAchievementsForTerritory(env, row.id);
        if (result.checked) checked++;
        else skipped++;
        awarded += Number(result.awarded || 0);
      } catch (error) {
        errors++;
        console.error('Achievement recheck failed for territory:', String(row.id).slice(0, 80), error);
      }
    }
    return json({ ok: true, checked, skipped, awarded, errors });
  }

  return { evaluateAchievementsForTerritory, recheckAchievements };
}