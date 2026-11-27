import test from "node:test";
import assert from "node:assert/strict";
import { TELEGRAM_API, telegram } from "../bot/src/telegram/api.js";

test("Telegram API module exposes the shared Bot API base URL", () => {
  assert.equal(TELEGRAM_API, "https://api.telegram.org");
});

test("telegram API rejects a missing bot token before making a request", async () => {
  await assert.rejects(
    telegram({}, "sendMessage", { chat_id: 1, text: "hello" }),
    /BOT_TOKEN is not configured/,
  );
});

test("telegram API trims the configured token and preserves the HTTP request contract", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestOptions = null;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const payload = { chat_id: 123, text: "Voxygen", parse_mode: "HTML" };
  try {
    const result = await telegram({ BOT_TOKEN: "  test-token  " }, "sendMessage", payload);
    assert.equal(requestUrl, "https://api.telegram.org/bottest-token/sendMessage");
    assert.equal(requestOptions.method, "POST");
    assert.deepEqual(requestOptions.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(requestOptions.body), payload);
    assert.equal(result.response.status, 200);
    assert.deepEqual(result.data, { ok: true, result: { message_id: 42 } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
