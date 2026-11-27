export function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Init-Data, X-Map-Size, If-None-Match");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Expose-Headers", "X-Request-ID, Server-Timing, X-Map-Version, X-Voxygen-Sticker-Error");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function json(data, status = 200) {
  // Never expose raw SQL/runtime details to Mini App clients. Detailed context is
  // kept in structured server logs and correlated with X-Request-ID.
  let safeData = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    safeData = { ...data };
    delete safeData.details;
    if (safeData.ok === false && !safeData.code) {
      safeData.code = status === 400 ? "INVALID_INPUT"
        : status === 401 ? "AUTHENTICATION_REQUIRED"
        : status === 403 ? "FORBIDDEN"
        : status === 404 ? "NOT_FOUND"
        : status === 409 ? "CONFLICT"
        : status === 413 ? "PAYLOAD_TOO_LARGE"
        : status === 429 ? "RATE_LIMITED"
        : status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED";
    }
  }
  return withCors(new Response(JSON.stringify(safeData), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  }));
}
