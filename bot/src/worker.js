export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // =========================================================
    // HEALTH CHECK
    // =========================================================
    if (url.pathname === "/api/health") {
      const token = String(env.BOT_TOKEN || "").trim();

      if (!token) {
        return new Response(
          JSON.stringify({
            ok: false,
            worker: "voxygen",
            tokenConfigured: false,
            error: "BOT_TOKEN is not configured",
          }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        );
      }

      try {
        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${token}/getMe`
        );

        const telegramData = await telegramResponse.json();

        if (!telegramResponse.ok || !telegramData.ok) {
          return new Response(
            JSON.stringify({
              ok: false,
              worker: "voxygen",
              tokenConfigured: true,
              telegramAcceptedToken: false,
              telegram: telegramData,
            }),
            {
              status: 401,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
              },
            }
          );
        }

        return new Response(
          JSON.stringify({
            ok: true,
            worker: "voxygen",
            tokenConfigured: true,
            telegramAcceptedToken: true,
            bot: {
              id: telegramData.result.id,
              username: telegramData.result.username,
              first_name: telegramData.result.first_name,
              is_bot: telegramData.result.is_bot,
            },
            request: {
              url: request.url,
              pathname: url.pathname,
              method: request.method,
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        );
      } catch (error) {
        return new Response(
          JSON.stringify({
            ok: false,
            worker: "voxygen",
            tokenConfigured: true,
            error: "Failed to contact Telegram",
            details: error?.message || String(error),
          }),
          {
            status: 502,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        );
      }
    }

    // =========================================================
    // ROOT
    // =========================================================
    if (url.pathname === "/") {
      return new Response(
        JSON.stringify({
          ok: true,
          worker: "voxygen",
          message: "Voxygen backend is running.",
          endpoint: "/api/health",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    }

    // =========================================================
    // UNKNOWN ROUTE
    // =========================================================
    return new Response(
      JSON.stringify({
        ok: false,
        worker: "voxygen",
        error: "Route not found",
        pathname: url.pathname,
        availableRoutes: ["/", "/api/health"],
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
      }
    );
  },
};
