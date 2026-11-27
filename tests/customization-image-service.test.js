import test from "node:test";
import assert from "node:assert/strict";
import { createCustomizationImageService } from "../bot/src/features/customization/image-service.js";

function createHarness({ row = null, databaseError = null } = {}) {
  const calls = { prepared: [], cors: 0 };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          calls.prepared.push({ sql: String(sql), values });
          return {
            async first() {
              if (databaseError) throw databaseError;
              return row;
            },
          };
        },
      };
    },
  };
  const withCors = response => {
    calls.cors += 1;
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", "https://mini-app.test");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  const service = createCustomizationImageService({ withCors });
  return { ...service, calls, env: { DB } };
}

test("image delivery returns decoded bytes and safe cache/content headers", async () => {
  const h = createHarness({
    row: { image_data: "data:image/png;base64,AQIDBA==", active: 0 },
  });

  const response = await h.serveCustomizationItemImage(
    new Request("https://voxygen.test/api/customization/items/marker-1/image"),
    h.env,
    " marker-1 "
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(response.headers.get("Server-Timing"), /^customization-image;dur=\d+$/);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mini-app.test");
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  assert.deepEqual(h.calls.prepared, [{
    sql: "SELECT image_data,active FROM customization_items WHERE id=? LIMIT 1",
    values: ["marker-1"],
  }]);
  assert.equal(h.calls.cors, 1);
});

test("hidden or inactive catalogue items still serve images already used by territories", async () => {
  const h = createHarness({
    row: { image_data: "data:image/webp;base64,SGVsbG8=", active: 0 },
  });

  const response = await h.serveCustomizationItemImage(
    new Request("https://voxygen.test/api/customization/items/hidden-marker/image"),
    h.env,
    "hidden-marker"
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(new TextDecoder().decode(await response.arrayBuffer()), "Hello");
});

test("invalid image identifiers are rejected before querying D1", async () => {
  const h = createHarness();

  const empty = await h.serveCustomizationItemImage(
    new Request("https://voxygen.test/api/customization/items//image"),
    h.env,
    " "
  );
  const tooLong = await h.serveCustomizationItemImage(
    new Request("https://voxygen.test/api/customization/items/long/image"),
    h.env,
    "x".repeat(161)
  );

  assert.equal(empty.status, 404);
  assert.equal(tooLong.status, 404);
  assert.equal(h.calls.prepared.length, 0);
  assert.equal(h.calls.cors, 2);
});

test("missing records and missing image data return non-cacheable not-found responses", async () => {
  for (const row of [null, { image_data: "", active: 1 }]) {
    const h = createHarness({ row });
    const response = await h.serveCustomizationItemImage(
      new Request("https://voxygen.test/api/customization/items/missing/image"),
      h.env,
      "missing"
    );
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mini-app.test");
  }
});

test("malformed and unsupported data URIs are rejected without caching", async () => {
  for (const imageData of [
    "https://example.com/image.png",
    "data:text/html;base64,SGVsbG8=",
    "data:image/png,not-base64",
    "data:image/png;base64,@@@",
  ]) {
    const h = createHarness({ row: { image_data: imageData, active: 1 } });
    const response = await h.serveCustomizationItemImage(
      new Request("https://voxygen.test/api/customization/items/invalid/image"),
      h.env,
      "invalid"
    );
    assert.equal(response.status, 415);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mini-app.test");
  }
});

test("database and decoding failures return a safe non-cacheable server error", async () => {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const h = createHarness({ databaseError: new Error("private D1 details") });
    const response = await h.serveCustomizationItemImage(
      new Request("https://voxygen.test/api/customization/items/broken/image"),
      h.env,
      "broken"
    );

    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Image unavailable");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.match(response.headers.get("Server-Timing"), /^customization-image;dur=\d+$/);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://mini-app.test");
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], JSON.stringify({
      event: "customization_image_failed",
      code: "IMAGE_READ_FAILED",
    }));
  } finally {
    console.error = originalError;
  }
});
