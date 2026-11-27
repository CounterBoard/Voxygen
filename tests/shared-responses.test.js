import test from "node:test";
import assert from "node:assert/strict";
import { json, withCors } from "../bot/src/shared/responses.js";

test("withCors preserves the response while applying the shared CORS contract", async () => {
  const response = withCors(new Response("ready", {
    status: 202,
    statusText: "Accepted",
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "https://old.example",
    },
  }));

  assert.equal(response.status, 202);
  assert.equal(response.statusText, "Accepted");
  assert.equal(await response.text(), "ready");
  assert.equal(response.headers.get("Content-Type"), "text/plain");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.equal(
    response.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, X-Telegram-Init-Data, X-Map-Size, If-None-Match",
  );
  assert.equal(
    response.headers.get("Access-Control-Allow-Methods"),
    "GET, HEAD, POST, PATCH, DELETE, OPTIONS",
  );
  assert.equal(
    response.headers.get("Access-Control-Expose-Headers"),
    "X-Request-ID, Server-Timing, X-Map-Version, X-Voxygen-Sticker-Error",
  );
});

test("json removes private details and maps an authentication error without mutating input", async () => {
  const input = {
    ok: false,
    error: "Unauthorized",
    details: "private SQL/runtime detail",
  };
  const response = json(input, 401);

  assert.equal(response.status, 401);
  assert.match(response.headers.get("Content-Type") || "", /application\/json/i);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "Unauthorized",
    code: "AUTHENTICATION_REQUIRED",
  });
  assert.equal(input.details, "private SQL/runtime detail");
});

for (const [status, expectedCode] of [
  [400, "INVALID_INPUT"],
  [401, "AUTHENTICATION_REQUIRED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [409, "CONFLICT"],
  [413, "PAYLOAD_TOO_LARGE"],
  [429, "RATE_LIMITED"],
  [422, "REQUEST_FAILED"],
  [500, "SERVER_ERROR"],
]) {
  test(`json maps HTTP ${status} to the established response code`, async () => {
    const response = json({ ok: false, error: "failed" }, status);
    assert.equal((await response.json()).code, expectedCode);
  });
}

test("json preserves explicit application codes", async () => {
  const response = json({ ok: false, error: "failed", code: "CUSTOM_FAILURE" }, 500);
  assert.equal((await response.json()).code, "CUSTOM_FAILURE");
});

test("json does not add error codes to arrays or successful responses", async () => {
  const arrayResponse = json([{ ok: false, error: "item" }], 200);
  assert.deepEqual(await arrayResponse.json(), [{ ok: false, error: "item" }]);

  const successResponse = json({ ok: true, value: 1 }, 200);
  assert.deepEqual(await successResponse.json(), { ok: true, value: 1 });
});
