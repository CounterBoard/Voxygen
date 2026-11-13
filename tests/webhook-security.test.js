import test from "node:test";
import assert from "node:assert/strict";
import worker from "../bot/src/worker.js";

async function sendWebhook({ configuredSecret, receivedSecret, body = "{}" } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (receivedSecret !== undefined) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = receivedSecret;
  }
  return worker.fetch(
    new Request("https://voxygen.test/api/webhook", {
      method: "POST",
      headers,
      body,
    }),
    {
      BOT_TOKEN: "test-bot-token",
      ...(configuredSecret === undefined ? {} : { TELEGRAM_WEBHOOK_SECRET: configuredSecret }),
    },
    { waitUntil() {} },
  );
}

test("Telegram webhook fails closed when its secret is not configured", async () => {
  const response = await sendWebhook();
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, "WEBHOOK_SECRET_NOT_CONFIGURED");
});

test("Telegram webhook rejects requests without the secret header", async () => {
  const response = await sendWebhook({ configuredSecret: "valid_secret-123" });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "INVALID_WEBHOOK_SECRET");
});

test("Telegram webhook rejects an incorrect secret header", async () => {
  const response = await sendWebhook({
    configuredSecret: "valid_secret-123",
    receivedSecret: "valid_secret-124",
  });
  assert.equal(response.status, 403);
});

test("Telegram webhook rejects invalid configured secret formats", async () => {
  const response = await sendWebhook({
    configuredSecret: "contains:colon",
    receivedSecret: "contains:colon",
  });
  assert.equal(response.status, 503);
});

test("Telegram webhook accepts the configured secret header before parsing updates", async () => {
  const response = await sendWebhook({
    configuredSecret: "valid_secret-123",
    receivedSecret: "valid_secret-123",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.ignored, true);
});
