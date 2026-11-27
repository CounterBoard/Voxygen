export function createPermissions({ getCurrentUser, json, ensureWorldTables } = {}) {
  if (typeof getCurrentUser !== "function" || typeof json !== "function" || typeof ensureWorldTables !== "function") {
    throw new TypeError("createPermissions requires getCurrentUser, json and ensureWorldTables dependencies");
  }

  async function getRoleByTelegramId(env, telegramId, telegramUsername = "") {
    const id = String(telegramId);
    const username = String(telegramUsername || "").replace(/^@+/, "").trim().toLowerCase();
    const main = String(env.INSPECTOR_CHAT_ID || "").trim();
    if (main && (id === main || (!/^[-]?\d+$/.test(main) && main.replace(/^@+/, "").toLowerCase() === username))) return "main_inspector";

    const row = await env.DB.prepare(
      "SELECT telegram_id FROM inspectors WHERE telegram_id = ?"
    ).bind(Number(telegramId)).first();

    return row ? "inspector" : "user";
  }

  async function requireUser(request, env) {
    const user = await getCurrentUser(request, env);
    if (!user) return { error: json({ ok: false, error: "Unauthorized" }, 401) };
    return { user };
  }

  async function requireVerifiedUser(request, env) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth;
    await ensureWorldTables(env);
    const row = await env.DB.prepare(`SELECT telegram_id,telegram_username,mc_nickname,status,xuid,skin_texture_id FROM users WHERE telegram_id=? LIMIT 1`).bind(Number(auth.user.id)).first();
    if (row?.status !== 'verified' || !String(row?.mc_nickname || '').trim()) {
      return { error: json({ ok:false, error:'Для этого действия нужен подтверждённый никнейм Minecraft' },403) };
    }
    return { user:auth.user, profile:row };
  }

  async function requireMainInspector(request, env) {
    const auth = await requireUser(request, env);
    if (auth.error) return auth;
    const main = String(env.INSPECTOR_CHAT_ID || "").trim();
    const userName = String(auth.user.username || "").replace(/^@+/, "").trim().toLowerCase();
    const mainName = main.replace(/^@+/, "").trim().toLowerCase();
    const allowed = main && (String(auth.user.id) === main || (!/^[-]?\d+$/.test(main) && mainName === userName));
    if (!allowed) {
      return { error: json({ ok: false, error: "Forbidden" }, 403) };
    }
    return auth;
  }

  async function isInspector(env, telegramId) {
    const role = await getRoleByTelegramId(env, telegramId);
    return role === "inspector" || role === "main_inspector";
  }

  async function isTerritoryManager(env, territoryId, telegramId) {
    const tid=String(territoryId||'').trim(), uid=Number(telegramId||0);
    if(!tid||!uid)return false;
    const owner=await env.DB.prepare(`SELECT 1 FROM territories WHERE id=? AND status='approved' AND owner_telegram_id=? LIMIT 1`).bind(tid,uid).first();
    if(owner)return true;
    const manager=await env.DB.prepare(`SELECT 1 FROM territory_managers tm JOIN territories t ON t.id=tm.territory_id AND t.status='approved' WHERE tm.territory_id=? AND tm.telegram_id=? LIMIT 1`).bind(tid,uid).first();
    return !!manager;
  }

  return {
    getRoleByTelegramId,
    requireUser,
    requireVerifiedUser,
    requireMainInspector,
    isInspector,
    isTerritoryManager,
  };
}
