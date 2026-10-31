import handler from "vinext/server/fetch-handler";

function setupEnv(env) {
  if (!env) return;
  globalThis.__CLOUDFLARE_ENV__ = env;
  if (env.DB) globalThis.DB = env.DB;
  if (env.AI) globalThis.AI = env.AI;
  if (env.CREDENTIALS_KEY) globalThis.CREDENTIALS_KEY = env.CREDENTIALS_KEY;
  if (env.TURSO_DATABASE_URL) globalThis.TURSO_DATABASE_URL = env.TURSO_DATABASE_URL;
  if (env.TURSO_AUTH_TOKEN) globalThis.TURSO_AUTH_TOKEN = env.TURSO_AUTH_TOKEN;
}

export default {
  async fetch(request, env, ctx) {
    setupEnv(env);
    try {
      if (env.ASSETS) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/_next/') || (url.pathname.includes('.') && !url.pathname.endsWith('.html'))) {
          const assetRes = await env.ASSETS.fetch(request);
          if (assetRes && assetRes.status >= 200 && assetRes.status < 400) {
            return assetRes;
          }
        }
      }
    } catch (e) {
      console.warn("Asset fetch error:", e);
    }

    if (typeof handler === 'function') {
      return handler(request, env, ctx);
    }

    if (typeof handler?.fetch === 'function') {
      return handler.fetch(request, env, ctx);
    }

    return new Response("Invalid router handler", { status: 500 });
  },

  async scheduled(event, env, ctx) {
    setupEnv(env);
    try {
      const internalReq = new Request("https://automation.ninakurainservices.in/api/process", {
        method: "POST",
        headers: {
          "x-nina-client": "1",
          "origin": "https://automation.ninakurainservices.in"
        },
        body: JSON.stringify({})
      });

      if (typeof handler === 'function') {
        await handler(internalReq, env, ctx);
      } else if (typeof handler?.fetch === 'function') {
        await handler.fetch(internalReq, env, ctx);
      }
    } catch (e) {
      console.warn("Scheduled process trigger failed:", e);
    }
  }
};
