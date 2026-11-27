import test from "node:test";
import assert from "node:assert/strict";
import { getCurrentUser, verifyInitData } from "../bot/src/auth/telegram.js";

const BOT_TOKEN = "test-telegram-bot-token";
const USER = { id: 123456, first_name: "Voxygen", username: "test_user" };

async function createSignedInitData({
  user = USER,
  botToken = BOT_TOKEN,
  authDate = Math.floor(Date.now() / 1000),
} = {}) {
  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("query_id", "AAEAA-test-query");
  params.set("user", JSON.stringify(user));

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const encoder = new TextEncoder();
  const webAppDataKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretKeyBytes = await crypto.subtle.sign(
    "HMAC",
    webAppDataKey,
    encoder.encode(botToken),
  );
  const secretKey = await crypto.subtle.importKey(
    "raw",
    secretKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(dataCheckString),
  );
  const hash = [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  params.set("hash", hash);
  return params.toString();
}

test("verifyInitData accepts a valid Telegram HMAC and returns the signed user", async () => {
  const now = Date.now();
  const initData = await createSignedInitData({ authDate: Math.floor(now / 1000) });
  assert.deepEqual(await verifyInitData(initData, BOT_TOKEN, now), USER);
});

test("verifyInitData rejects a missing token, missing data and tampered payload", async () => {
  const initData = await createSignedInitData();
  assert.equal(await verifyInitData("", BOT_TOKEN), null);
  assert.equal(await verifyInitData(initData, ""), null);

  const tampered = new URLSearchParams(initData);
  tampered.set("user", JSON.stringify({ ...USER, id: 999 }));
  assert.equal(await verifyInitData(tampered.toString(), BOT_TOKEN), null);
});

test("verifyInitData rejects expired and too-far-in-the-future auth dates", async () => {
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const expired = await createSignedInitData({ authDate: nowSeconds - 24 * 60 * 60 - 1 });
  const future = await createSignedInitData({ authDate: nowSeconds + 61 });

  assert.equal(await verifyInitData(expired, BOT_TOKEN, now), null);
  assert.equal(await verifyInitData(future, BOT_TOKEN, now), null);
});

test("getCurrentUser reads initData from the Telegram request header", async () => {
  const initData = await createSignedInitData();
  const request = new Request("https://voxygen.test/api/me", {
    headers: { "X-Telegram-Init-Data": initData },
  });

  assert.deepEqual(await getCurrentUser(request, { BOT_TOKEN }), { ...USER, initData });
});

test("getCurrentUser reads initData from a JSON request body", async () => {
  const initData = await createSignedInitData();
  const request = new Request("https://voxygen.test/api/me", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });

  assert.deepEqual(await getCurrentUser(request, { BOT_TOKEN }), { ...USER, initData });
});

test("getCurrentUser retains query-string fallback and rejects absent credentials", async () => {
  const initData = await createSignedInitData();
  const request = new Request(`https://voxygen.test/api/me?initData=${encodeURIComponent(initData)}`);

  assert.deepEqual(await getCurrentUser(request, { BOT_TOKEN }), { ...USER, initData });
  assert.equal(
    await getCurrentUser(new Request("https://voxygen.test/api/me"), { BOT_TOKEN }),
    null,
  );
});
