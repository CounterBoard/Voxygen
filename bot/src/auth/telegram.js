export async function verifyInitData(initData, botToken, now = Date.now()) {
  if (!initData || !botToken) return null;
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    if (!receivedHash) return null;
    params.delete("hash");

    const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = pairs.map(([key, value]) => `${key}=${value}`).join("\n");
    const encoder = new TextEncoder();

    const webAppDataKey = await crypto.subtle.importKey(
      "raw", encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const secretKeyBytes = await crypto.subtle.sign(
      "HMAC", webAppDataKey, encoder.encode(botToken)
    );
    const secretKey = await crypto.subtle.importKey(
      "raw", secretKeyBytes,
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "HMAC", secretKey, encoder.encode(dataCheckString)
    );
    const calculatedHash = [...new Uint8Array(signature)]
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");

    if (calculatedHash !== receivedHash) return null;
    const authDate = Number(params.get("auth_date"));
    const nowSeconds = Math.floor(Number(now) / 1000);
    if (!Number.isSafeInteger(authDate) || authDate <= 0 || authDate > nowSeconds + 60 || nowSeconds - authDate > 24 * 60 * 60) return null;
    const userJson = params.get("user");
    if (!userJson) return null;
    return JSON.parse(userJson);
  } catch (error) {
    console.error("verifyInitData error:", error);
    return null;
  }
}

export async function getCurrentUser(request, env) {
  let body = null;
  // Only parse JSON requests. Binary map uploads are streamed directly to GitHub Releases.
  if (String(request.headers.get("Content-Type") || "").toLowerCase().includes("application/json")) {
    try { body = await request.clone().json(); } catch {}
  }
  const initData = String(
    body?.initData ||
    request.headers.get("X-Telegram-Init-Data") ||
    new URL(request.url).searchParams.get("initData") ||
    ""
  ).trim();

  const user = await verifyInitData(initData, String(env.BOT_TOKEN || "").trim());
  if (!user) return null;
  return { ...user, initData };
}
