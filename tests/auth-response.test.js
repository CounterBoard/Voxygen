import test from "node:test";
import assert from "node:assert/strict";
import worker from "../bot/src/worker.js";

async function requestUnauthenticated(path) {
  return worker.fetch(
    new Request(`https://voxygen.test${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
    { BOT_TOKEN: "test-token" },
    { waitUntil() {} },
  );
}

for (const route of [
  ["/api/me", "ordinary authenticated route"],
  ["/api/inspectors/list", "main-inspector route"],
  ["/api/ratings", "verified-user route"],
]) {
  test(`unauthenticated ${route[1]} returns a real HTTP 401 Response (${route[0]})`, async () => {
    const response = await requestUnauthenticated(route[0]);

    assert.equal(response.status, 401);
    assert.match(response.headers.get("content-type") || "", /application\\/json/i);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.ok(response.headers.get("x-request-id"));

    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "AUTHENTICATION_REQUIRED");
  });
}
