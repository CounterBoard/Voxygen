import test from "node:test";
import assert from "node:assert/strict";
import worker from "../bot/src/worker.js";

const protectedRoutes = [
  ["POST", "/api/territories"],
  ["POST", "/api/events"],
  ["PATCH", "/api/events"],
  ["DELETE", "/api/events"],
  ["POST", "/api/events/reminder"],
  ["DELETE", "/api/events/reminder"],
  ["POST", "/api/city/additional-info"],
  ["POST", "/api/me"],
  ["POST", "/api/profile/claim"],
  ["POST", "/api/territories/claim-owner"],
  ["GET", "/api/admin/users"],
  ["POST", "/api/admin/users"],
  ["PATCH", "/api/admin/users/123"],
  ["DELETE", "/api/admin/users/123"],
  ["POST", "/api/admin/users/update/123"],
  ["POST", "/api/admin/users/delete/123"],
  ["POST", "/api/inspectors/list"],
  ["POST", "/api/inspectors"],
  ["DELETE", "/api/inspectors/123"],
  ["POST", "/api/ratings"],
  ["POST", "/api/comments"],
  ["PATCH", "/api/comments"],
  ["DELETE", "/api/comments"],
  ["POST", "/api/comments/update"],
  ["POST", "/api/comments/delete"],
  ["POST", "/api/comments/reply"],
  ["PATCH", "/api/comments/reply"],
  ["DELETE", "/api/comments/reply"],
  ["POST", "/api/screenshots"],
  ["DELETE", "/api/screenshots/123"],
  ["POST", "/api/screenshots/123"],
  ["POST", "/api/admin/territories/rename"],
  ["POST", "/api/admin/territories/delete"],
  ["POST", "/api/admin/territories/coords"],
  ["POST", "/api/admin/territories/owner"],
  ["POST", "/api/admin/territories/manager"],
  ["POST", "/api/user-settings"],
  ["GET", "/api/admin/global-settings"],
  ["POST", "/api/admin/global-settings"],
  ["POST", "/api/map"],
  ["POST", "/api/faq"],
  ["POST", "/api/home-feature-button"],
  ["POST", "/api/request-inspector-rating"],
  ["POST", "/api/vox-grid"],
  ["POST", "/api/vox-grid/reset"],
  ["GET", "/api/treasury"],
  ["POST", "/api/treasury/deposit"],
  ["POST", "/api/treasury/donate"],
  ["POST", "/api/treasury/withdraw"],
  ["GET", "/api/customization"],
  ["POST", "/api/achievements/recheck"],
  ["POST", "/api/customization/items"],
  ["POST", "/api/customization/items/visibility"],
  ["PATCH", "/api/customization/items/item-123"],
  ["DELETE", "/api/customization/items/item-123"],
  ["POST", "/api/customization/items/reorder"],
  ["POST", "/api/customization/tags/reorder"],
  ["POST", "/api/customization/purchase"],
  ["POST", "/api/customization/city"],
  ["POST", "/api/city/invite"],
  ["POST", "/api/city/invite/cancel"],
  ["POST", "/api/city/remove-resident"],
  ["POST", "/api/city/leave"],
  ["POST", "/api/city/promote-resident"],
  ["POST", "/api/city/demote-manager"],
  ["GET", "/api/city/management"],
  ["POST", "/api/recruitment"],
  ["POST", "/api/recruitment/contact"],
  ["GET", "/api/admin/diagnostics/d1"],
  ["GET", "/api/events?manage=1"],
];

for (const [method, path] of protectedRoutes) {
  test(`unauthenticated ${method} ${path} is rejected before protected work`, async () => {
    const hasBody = !["GET", "HEAD"].includes(method);
    const response = await worker.fetch(
      new Request(`https://voxygen.test${path}`, {
        method,
        headers: hasBody ? { "Content-Type": "application/json" } : {},
        ...(hasBody ? { body: "{}" } : {}),
      }),
      { BOT_TOKEN: "route-auth-test-token" },
      { waitUntil() {} },
    );

    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.code, "AUTHENTICATION_REQUIRED");
  });
}
