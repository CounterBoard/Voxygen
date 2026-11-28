export function createVoxGridService({
  requireMainInspector,
  requireUser,
  getRoleByTelegramId,
  ensureWorldTables,
  json,
}) {
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

  async function getVoxGridResponse(request, env) {
    const cells = await getVoxGrid(env);
    const auth = await requireUser(request, env);
    const canEdit = !auth.error && (await getRoleByTelegramId(env, auth.user.id, auth.user.username)) === 'main_inspector';
    return json({ ok: true, cells, canEdit });
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

  return { getVoxGridResponse, resetVoxGrid, saveVoxCell };
}
