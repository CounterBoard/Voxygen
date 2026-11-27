import test from "node:test";
import assert from "node:assert/strict";
import { createPermissions } from "../bot/src/auth/permissions.js";
import { json } from "../bot/src/shared/responses.js";

function fixture({ user = null, profile = null, inspectorRow = null } = {}) {
  const calls = [];
  const permissions = createPermissions({
    getCurrentUser: async () => user,
    json,
    ensureWorldTables: async () => { calls.push("ensureWorldTables"); },
  });
  const env = {
    INSPECTOR_CHAT_ID: "999",
    DB: {
      prepare(sql) {
        calls.push(String(sql));
        return {
          bind() {
            return {
              async first() {
                if (String(sql).includes("FROM inspectors")) return inspectorRow;
                if (String(sql).includes("FROM users")) return profile;
                return null;
              },
            };
          },
        };
      },
    },
  };
  return { permissions, env, calls };
}

test("getRoleByTelegramId resolves the main inspector by ID or configured username", async () => {
  const { permissions, env, calls } = fixture();
  env.INSPECTOR_CHAT_ID = "123";
  assert.equal(await permissions.getRoleByTelegramId(env, 123, "ordinary"), "main_inspector");
  assert.equal(calls.length, 0);

  env.INSPECTOR_CHAT_ID = "@Chief";
  assert.equal(await permissions.getRoleByTelegramId(env, 456, "@chief"), "main_inspector");
  assert.equal(calls.length, 0);
});

test("getRoleByTelegramId retains inspector-table and ordinary-user roles", async () => {
  const inspector = fixture({ inspectorRow: { telegram_id: 456 } });
  assert.equal(await inspector.permissions.getRoleByTelegramId(inspector.env, 456), "inspector");

  const ordinary = fixture();
  assert.equal(await ordinary.permissions.getRoleByTelegramId(ordinary.env, 456), "user");
});

test("requireUser rejects missing Telegram identity with the established 401 response", async () => {
  const { permissions, env } = fixture();
  const auth = await permissions.requireUser(new Request("https://voxygen.test/api/me"), env);

  assert.equal(auth.error.status, 401);
  assert.equal((await auth.error.json()).code, "AUTHENTICATION_REQUIRED");
});

test("requireVerifiedUser checks identity before schema bootstrap and requires a verified profile", async () => {
  const unauthenticated = fixture();
  const denied = await unauthenticated.permissions.requireVerifiedUser(
    new Request("https://voxygen.test/api/ratings"),
    unauthenticated.env,
  );
  assert.equal(denied.error.status, 401);
  assert.equal(unauthenticated.calls.length, 0);

  const verified = fixture({
    user: { id: 123, username: "resident" },
    profile: { status: "verified", mc_nickname: "Resident", telegram_id: 123 },
  });
  const auth = await verified.permissions.requireVerifiedUser(
    new Request("https://voxygen.test/api/ratings"),
    verified.env,
  );
  assert.equal(auth.user.id, 123);
  assert.equal(auth.profile.mc_nickname, "Resident");
  assert.equal(verified.calls[0], "ensureWorldTables");

  const pending = fixture({
    user: { id: 123 },
    profile: { status: "pending", mc_nickname: "Resident" },
  });
  const pendingAuth = await pending.permissions.requireVerifiedUser(
    new Request("https://voxygen.test/api/ratings"),
    pending.env,
  );
  assert.equal(pendingAuth.error.status, 403);
});

test("requireMainInspector allows the configured ID and rejects other users", async () => {
  const allowed = fixture({ user: { id: 999, username: "root" } });
  const auth = await allowed.permissions.requireMainInspector(
    new Request("https://voxygen.test/api/admin"),
    allowed.env,
  );
  assert.equal(auth.user.id, 999);

  const denied = fixture({ user: { id: 100, username: "other" } });
  const result = await denied.permissions.requireMainInspector(
    new Request("https://voxygen.test/api/admin"),
    denied.env,
  );
  assert.equal(result.error.status, 403);
  assert.equal((await result.error.json()).code, "FORBIDDEN");
});

test("createPermissions requires explicit runtime dependencies", () => {
  assert.throws(() => createPermissions(), /requires getCurrentUser, json and ensureWorldTables/);
});
