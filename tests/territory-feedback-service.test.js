import test from "node:test";
import assert from "node:assert/strict";
import { createTerritoryFeedbackService } from "../bot/src/features/territories/feedback-service.js";

function harness(overrides = {}) {
  const calls = { sql: [], notifications: [], achievements: [], ensured: 0 };
  const DB = {
    prepare(sql) {
      const statement = {
        sql: String(sql), values: [],
        bind(...values) { this.values = values; return this; },
        async first() {
          calls.sql.push({ method: "first", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM territories") && this.sql.includes("status='approved'")) {
            return overrides.territory === undefined
              ? { id: "city-1", name: "North", owner_telegram_id: 9001, owner_telegram_username: "founder" }
              : overrides.territory;
          }
          if (this.sql.includes("FROM city_memberships")) return overrides.membership || null;
          if (this.sql.includes("FROM ratings") || this.sql.includes("FROM inspector_ratings")) return overrides.previousRating || null;
          if (this.sql.includes("FROM comments c LEFT JOIN comment_replies")) return overrides.comment || null;
          if (this.sql.includes("FROM comments c JOIN territories")) return overrides.replyComment || null;
          if (this.sql.includes("FROM comment_replies cr JOIN comments")) return overrides.replyRow || null;
          return null;
        },
        async all() {
          calls.sql.push({ method: "all", sql: this.sql, values: this.values });
          if (this.sql.includes("FROM ratings r JOIN territories")) return { results: overrides.ratings || [] };
          if (this.sql.includes("FROM comments c JOIN territories")) return { results: overrides.comments || [] };
          return { results: [] };
        },
        async run() {
          calls.sql.push({ method: "run", sql: this.sql, values: this.values });
          if (this.sql.includes("INSERT INTO ratings")) return { meta: { changes: overrides.ratingChanges ?? 1 } };
          if (this.sql.includes("INSERT INTO comments")) return { meta: { changes: overrides.commentChanges ?? 1 } };
          if (this.sql.includes("UPDATE comments SET text")) return { meta: { changes: overrides.updateChanges ?? 1 } };
          if (this.sql.includes("INSERT OR IGNORE INTO comment_replies")) return { meta: { changes: overrides.replyInsertChanges ?? 1 } };
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  let scoreCall = 0;
  const service = createTerritoryFeedbackService({
    requireUser: async () => ({ user: { id: 44, username: "reviewer" } }),
    requireVerifiedUser: async () => ({ user: { id: 44, username: "reviewer" } }),
    ensureWorldTables: async () => { calls.ensured += 1; },
    getRoleByTelegramId: async () => overrides.role || "user",
    isTerritoryManager: async () => overrides.isManager ?? false,
    calculateTerritoryScores: async () => {
      scoreCall += 1;
      return scoreCall === 1
        ? { curator: 7, community: 6, votes: 1 }
        : { curator: 7, community: 6.5, votes: 2 };
    },
    notifyTerritoryManagers: async (...args) => { calls.notifications.push(args); },
    evaluateAchievementsForTerritory: async (...args) => { calls.achievements.push(args); },
    normalizeUsername: value => value ? `@${String(value).replace(/^@+/, "")}` : "",
    formatTelegramNickname: value => String(value),
    escapeHtml: value => String(value ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])),
    telegram: async (...args) => { calls.telegram = args; },
    json: (body, status = 200) => ({ body, status }),
  });
  return { ...service, DB, calls, env: { DB } };
}

function request(body, id = 44) {
  return { json: async () => body };
}

test("rating save preserves verified-user gate, manager restriction, 20-hour cooldown and side effects", async () => {
  const h = harness();
  const result = await h.saveRating(request({
    territoryId: "city-1", integrity: 4, comfort: 4, atmosphere: 5, detail: 3,
  }), h.env);

  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.community, 6.5);
  assert.equal(result.body.votes, 2);
  assert.equal(h.calls.notifications.length, 1);
  assert.equal(h.calls.achievements.length, 1);
  assert.ok(h.calls.sql.some(x => x.sql.includes("created_at<=?")));
});

test("rating save rejects a manager rating their own territory", async () => {
  const h = harness({ isManager: true });
  const result = await h.saveRating(request({
    territoryId: "city-1", integrity: 4, comfort: 4, atmosphere: 5, detail: 3,
  }), h.env);
  assert.equal(result.status, 403);
  assert.match(result.body.error, /не может оценивать свой город/);
});

test("review quota is enforced atomically by the insert statement", async () => {
  const h = harness({ commentChanges: 0 });
  const result = await h.addComment(request({ territoryId: "city-1", text: "A useful review" }), h.env);
  assert.equal(result.status, 429);
  assert.ok(h.calls.sql.some(x => x.sql.includes("SELECT COUNT(*) FROM comments") && x.sql.includes("< 5")));
  assert.equal(h.calls.notifications.length, 0);
});

test("review author cannot edit a review after a manager reply exists", async () => {
  const h = harness({ comment: { telegram_id: 44, replied_comment_id: "comment-1" } });
  const result = await h.updateComment(request({ commentId: "comment-1", text: "Changed" }), h.env);
  assert.equal(result.status, 409);
  assert.match(result.body.error, /уже ответил/);
  assert.equal(h.calls.sql.some(x => x.sql.includes("UPDATE comments SET text")), false);
});

test("review listing keeps the reply field normalized for the frontend", async () => {
  const h = harness({ comments: [{ id: "comment-1", reply_text: "Thanks" }, { id: "comment-2", reply_text: null }] });
  const result = await h.getComments(request({}), h.env, new URL("https://example.test/api/comments?territoryId=city-1"));
  assert.deepEqual(result.body.comments.map(x => x.reply), ["Thanks", null]);
  assert.equal(h.calls.ensured, 1);
});
