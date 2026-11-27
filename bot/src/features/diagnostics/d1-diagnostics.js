export function sqlIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function getD1Diagnostics(request, env, { requireMainInspector, json }) {
  const auth = await requireMainInspector(request, env);
  if (auth.error) return auth.error;
  if (!env.DB) return json({ ok: false, error: "Диагностика D1 недоступна" }, 503);

  // This endpoint deliberately avoids ensureWorldTables(): inventory must not run
  // migrations, create application tables, or clean any records.
  const meta = await env.DB.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  const tables = (meta.results || []).map(row => row.name).filter(Boolean);
  const existing = new Set(tables);
  const counts = [];
  const orphanTerritories = [];
  const dataVolumes = [];
  const diagnosticsWarnings = [];

  // Count tables independently: one incompatible/problematic table must not
  // make the entire inventory disappear. This remains read-only and never
  // loads image or other large field contents.
  for (const table of tables) {
    try {
      const result = await env.DB.prepare(
        `SELECT COUNT(*) AS row_count FROM ${sqlIdentifier(table)}`
      ).first();
      counts.push({ table, rows: Number(result?.row_count || 0) });
    } catch (error) {
      // Keep the successful counts and identify only the table that failed.
      diagnosticsWarnings.push({ table, code: "TABLE_COUNT_FAILED" });
    }
  }

  const territoryRelations = [
    "ratings", "inspector_ratings", "comments", "screenshots", "recruitment",
    "city_invites", "city_memberships", "territory_managers", "city_items",
    "city_customization", "city_treasury", "territory_approval_sessions",
    "manager_change_requests", "gem_spend_log", "achievement_awards",
  ];
  const hasArchive = existing.has("deleted_territories");
  for (const table of territoryRelations) {
    if (!existing.has(table)) continue;
    try {
      const quoted = sqlIdentifier(table);
      const archivedHistoryTable = ["gem_spend_log", "achievement_awards"].includes(table);
      const archivedWorkflowTable = ["city_invites", "manager_change_requests"].includes(table);
      const archiveJoin = hasArchive && (archivedHistoryTable || archivedWorkflowTable) ? `LEFT JOIN deleted_territories a ON a.id=x.territory_id` : "";
      const archiveFilter = !hasArchive ? "" : archivedHistoryTable ? "AND a.id IS NULL"
        : archivedWorkflowTable ? "AND (a.id IS NULL OR x.status='pending')" : "";
      const countResult = await env.DB.prepare(`SELECT COUNT(*) AS row_count FROM ${quoted} x
        LEFT JOIN territories t ON t.id=x.territory_id ${archiveJoin}
        WHERE x.territory_id IS NOT NULL AND t.id IS NULL ${archiveFilter}`).first();
      const orphanRows = Number(countResult?.row_count || 0);
      if (orphanRows) {
        const sample = await env.DB.prepare(`SELECT DISTINCT x.territory_id AS id FROM ${quoted} x
          LEFT JOIN territories t ON t.id=x.territory_id ${archiveJoin}
          WHERE x.territory_id IS NOT NULL AND t.id IS NULL ${archiveFilter} LIMIT 5`).all();
        orphanTerritories.push({ table, rows: orphanRows, sampleIds: (sample.results || []).map(row => String(row.id)) });
      }
    } catch (error) {
      diagnosticsWarnings.push({ table, code: "ORPHAN_CHECK_FAILED" });
    }
  }

  for (const [table, column] of [["screenshots", "image_data"], ["customization_items", "image_data"], ["app_settings", "value"]]) {
    if (!existing.has(table)) continue;
    try {
      const cols = await env.DB.prepare(`PRAGMA table_info(${sqlIdentifier(table)})`).all();
      if (!(cols.results || []).some(col => col.name === column)) continue;
      const qColumn = sqlIdentifier(column), qTable = sqlIdentifier(table);
      const size = await env.DB.prepare(`SELECT COALESCE(SUM(LENGTH(${qColumn})),0) AS total_chars, COALESCE(MAX(LENGTH(${qColumn})),0) AS max_chars FROM ${qTable}`).first();
      dataVolumes.push({ table, column, totalCharacters: Number(size?.total_chars || 0), largestValueCharacters: Number(size?.max_chars || 0) });
    } catch (error) {
      diagnosticsWarnings.push({ table, code: "VOLUME_CHECK_FAILED" });
    }
  }

  const extraOrphans = [];
  const relationChecks = [
    { table: "comment_replies", sql: `SELECT COUNT(*) AS row_count FROM comment_replies r LEFT JOIN comments c ON c.id=r.comment_id WHERE c.id IS NULL`, sample: `SELECT r.comment_id AS id FROM comment_replies r LEFT JOIN comments c ON c.id=r.comment_id WHERE c.id IS NULL LIMIT 5` },
    { table: "comment_replies_on_orphan_comments", requires: ["comment_replies", "comments", "territories"], sql: `SELECT COUNT(*) AS row_count FROM comment_replies r JOIN comments c ON c.id=r.comment_id LEFT JOIN territories t ON t.id=c.territory_id WHERE t.id IS NULL`, sample: `SELECT r.comment_id AS id FROM comment_replies r JOIN comments c ON c.id=r.comment_id LEFT JOIN territories t ON t.id=c.territory_id WHERE t.id IS NULL LIMIT 5` },
    { table: "manager_change_votes", sql: `SELECT COUNT(*) AS row_count FROM manager_change_votes v LEFT JOIN manager_change_requests r ON r.id=v.request_id WHERE r.id IS NULL`, sample: `SELECT v.request_id AS id FROM manager_change_votes v LEFT JOIN manager_change_requests r ON r.id=v.request_id WHERE r.id IS NULL LIMIT 5` },
    { table: "user_items", sql: `SELECT COUNT(*) AS row_count FROM user_items u LEFT JOIN customization_items i ON i.id=u.item_id WHERE i.id IS NULL`, sample: `SELECT u.item_id AS id FROM user_items u LEFT JOIN customization_items i ON i.id=u.item_id WHERE i.id IS NULL LIMIT 5` },
    { table: "city_items", requires: ["customization_items"], sql: `SELECT COUNT(*) AS row_count FROM city_items ci LEFT JOIN customization_items i ON i.id=ci.item_id WHERE i.id IS NULL`, sample: `SELECT ci.item_id AS id FROM city_items ci LEFT JOIN customization_items i ON i.id=ci.item_id WHERE i.id IS NULL LIMIT 5` },
    { table: "city_customization", requires: ["customization_items"], sql: `SELECT COUNT(*) AS row_count FROM city_customization cc LEFT JOIN customization_items mi ON mi.id=cc.marker_item_id WHERE cc.marker_item_id IS NOT NULL AND mi.id IS NULL`, sample: `SELECT cc.territory_id AS id FROM city_customization cc LEFT JOIN customization_items mi ON mi.id=cc.marker_item_id WHERE cc.marker_item_id IS NOT NULL AND mi.id IS NULL LIMIT 5` },
  ];
  for (const check of relationChecks) {
    if (!existing.has(check.table) || (check.requires || []).some(table => !existing.has(table))) continue;
    try {
      const result = await env.DB.prepare(check.sql).first();
      const rows = Number(result?.row_count || 0);
      if (rows) {
        const sample = await env.DB.prepare(check.sample).all();
        extraOrphans.push({ table: check.table, rows, sampleIds: (sample.results || []).map(row => String(row.id)) });
      }
    } catch (error) {
      diagnosticsWarnings.push({ table: check.table, code: "RELATION_CHECK_FAILED" });
    }
  }

  let foreignKeyViolations = { count: 0, samples: [] };
  try {
    // D1 explicitly supports PRAGMA foreign_key_check; keep only table names in the report.
    const fkRows = await env.DB.prepare(`PRAGMA foreign_key_check`).all();
    foreignKeyViolations = {
      count: (fkRows.results || []).length,
      samples: (fkRows.results || []).slice(0, 5).map(row => ({ table: String(row.table || ''), parent: String(row.parent || '') })),
    };
  } catch (error) {
    diagnosticsWarnings.push({ code: "FOREIGN_KEY_CHECK_FAILED" });
  }

  const statusCounts = {};
  for (const [table, column] of [["territories", "status"], ["users", "status"], ["screenshots", "status"], ["city_invites", "status"], ["manager_change_requests", "status"]]) {
    if (!existing.has(table)) continue;
    try {
      const rows = await env.DB.prepare(`SELECT ${sqlIdentifier(column)} AS status, COUNT(*) AS row_count FROM ${sqlIdentifier(table)} GROUP BY ${sqlIdentifier(column)}`).all();
      statusCounts[table] = Object.fromEntries((rows.results || []).map(row => [String(row.status ?? "null"), Number(row.row_count || 0)]));
    } catch (error) {
      diagnosticsWarnings.push({ table, code: "STATUS_COUNT_FAILED" });
    }
  }

  const orphanDataVolumes = [];
  const orphanVolumeChecks = [
    { table: "screenshots", column: "image_data", join: "LEFT JOIN territories t ON t.id=s.territory_id", where: "s.territory_id IS NOT NULL AND t.id IS NULL", alias: "s" },
    { table: "comments", column: "text", join: "LEFT JOIN territories t ON t.id=c.territory_id", where: "c.territory_id IS NOT NULL AND t.id IS NULL", alias: "c" },
    { table: "comment_replies", column: "text", join: "JOIN comments c ON c.id=r.comment_id LEFT JOIN territories t ON t.id=c.territory_id", where: "c.territory_id IS NOT NULL AND t.id IS NULL", alias: "r" },
  ];
  for (const check of orphanVolumeChecks) {
    if (!existing.has(check.table) || !existing.has("territories")) continue;
    try {
      const cols = await env.DB.prepare(`PRAGMA table_info(${sqlIdentifier(check.table)})`).all();
      if (!(cols.results || []).some(col => col.name === check.column)) continue;
      const result = await env.DB.prepare(`SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(${check.alias}.${sqlIdentifier(check.column)})),0) AS total_chars, COALESCE(MAX(LENGTH(${check.alias}.${sqlIdentifier(check.column)})),0) AS max_chars FROM ${sqlIdentifier(check.table)} ${check.alias} ${check.join} WHERE ${check.where}`).first();
      orphanDataVolumes.push({ table: check.table, column: check.column, rows: Number(result?.row_count || 0), totalCharacters: Number(result?.total_chars || 0), largestValueCharacters: Number(result?.max_chars || 0) });
    } catch (error) {
      diagnosticsWarnings.push({ table: check.table, code: "ORPHAN_VOLUME_CHECK_FAILED" });
    }
  }

  const retainedHistory = {};
  if (existing.has("deleted_territories")) {
    for (const table of ["gem_spend_log", "achievement_awards", "city_invites", "manager_change_requests"]) {
      if (!existing.has(table)) continue;
      try {
        const closedWorkflowFilter = ["city_invites", "manager_change_requests"].includes(table) ? "AND x.status<>'pending'" : "";
        const row = await env.DB.prepare(`SELECT COUNT(*) AS row_count FROM ${sqlIdentifier(table)} x JOIN deleted_territories a ON a.id=x.territory_id WHERE 1=1 ${closedWorkflowFilter}`).first();
        retainedHistory[table] = Number(row?.row_count || 0);
      } catch (error) {
        diagnosticsWarnings.push({ table, code: "ARCHIVE_HISTORY_CHECK_FAILED" });
      }
    }
    if (existing.has("manager_change_votes") && existing.has("manager_change_requests")) {
      try {
        const row = await env.DB.prepare(`SELECT COUNT(*) AS row_count FROM manager_change_votes v
          JOIN manager_change_requests r ON r.id=v.request_id
          JOIN deleted_territories a ON a.id=r.territory_id
          WHERE r.status<>'pending'`).first();
        retainedHistory.manager_change_votes = Number(row?.row_count || 0);
      } catch (error) {
        diagnosticsWarnings.push({ table: "manager_change_votes", code: "ARCHIVE_HISTORY_CHECK_FAILED" });
      }
    }
  }

  return json({
    ok: true,
    readOnly: true,
    generatedAt: Date.now(),
    tables: counts,
    statusCounts,
    orphanTerritories,
    orphanRelations: extraOrphans,
    foreignKeyViolations,
    largeDataFields: dataVolumes,
    orphanDataVolumes,
    retainedArchivedHistory: retainedHistory,
    warnings: diagnosticsWarnings,
    note: "Снимок данных не создавался автоматически. Никакие записи не изменены или удалены.",
  });
}
