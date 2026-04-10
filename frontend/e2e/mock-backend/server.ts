/**
 * Lightweight mock backend for E2E tests.
 *
 * Start with: E2E_MOCK_BACKEND=1 npx tsx e2e/mock-backend/server.ts
 * Or automatically via playwright.config.ts when E2E_MOCK_BACKEND=1.
 *
 * Removes hard dependencies on Postgres, Redis, and external FIPE API
 * for core E2E flows (auth, search, publish).
 */
import http from "node:http";
import { fixtures } from "./fixtures";

const PORT = Number(process.env.MOCK_BACKEND_PORT) || 4000;

type RouteHandler = (
  body: Record<string, unknown>,
  url: URL,
  req: http.IncomingMessage
) => { status: number; body: unknown };

const routes: Record<string, Record<string, RouteHandler>> = {
  "GET /health": {
    handler: () => ({
      status: 200,
      body: { ok: true, status: "healthy", checks: { database: "up", redis: "up" } },
    }),
  } as unknown as Record<string, RouteHandler>,

  "POST /api/auth/login": {
    handler: (body) => {
      const email = String(body.email || "").toLowerCase().trim();
      const user = fixtures.users.find((u) => u.email === email);
      if (!user || body.password !== user.password) {
        return { status: 401, body: { error: "Credenciais invalidas" } };
      }
      return {
        status: 200,
        body: {
          accessToken: `mock-access-${user.id}`,
          refreshToken: `mock-refresh-${user.id}`,
          user: { id: user.id, email: user.email, name: user.name, account_type: user.account_type },
          redirect_to: user.account_type === "cnpj" ? "/dashboard-loja" : "/dashboard",
        },
      };
    },
  } as unknown as Record<string, RouteHandler>,

  "POST /api/auth/register": {
    handler: (body) => {
      const id = `mock-user-${Date.now()}`;
      return {
        status: 201,
        body: {
          accessToken: `mock-access-${id}`,
          refreshToken: `mock-refresh-${id}`,
          user: { id, email: body.email, name: body.name || "Novo Usuário", account_type: "cpf" },
          redirect_to: "/dashboard",
        },
      };
    },
  } as unknown as Record<string, RouteHandler>,

  "POST /api/auth/refresh": {
    handler: (body) => {
      const rt = String(body.refreshToken || "");
      if (!rt.startsWith("mock-refresh-")) {
        return { status: 401, body: { error: "Refresh token inválido" } };
      }
      const userId = rt.replace("mock-refresh-", "");
      return {
        status: 200,
        body: {
          accessToken: `mock-access-${userId}-${Date.now()}`,
          refreshToken: `mock-refresh-${userId}`,
        },
      };
    },
  } as unknown as Record<string, RouteHandler>,

  "POST /api/auth/verify-document": {
    handler: () => ({
      status: 200,
      body: { verified: true, account_type: "cpf" },
    }),
  } as unknown as Record<string, RouteHandler>,

  "GET /api/dashboard/me": {
    handler: () => ({
      status: 200,
      body: fixtures.dashboard,
    }),
  } as unknown as Record<string, RouteHandler>,

  "GET /api/ads/search": {
    handler: (_body, url) => {
      let ads = [...fixtures.ads];
      const brand = url.searchParams.get("brand");
      if (brand) {
        ads = ads.filter((a) => a.brand.toLowerCase().includes(brand.toLowerCase()));
      }
      const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
      return {
        status: 200,
        body: { data: ads.slice(0, limit), total: ads.length, page: 1, limit },
      };
    },
  } as unknown as Record<string, RouteHandler>,

  "GET /api/ads/facets": {
    handler: () => ({
      status: 200,
      body: { facets: fixtures.facets },
    }),
  } as unknown as Record<string, RouteHandler>,

  "POST /api/ads": {
    handler: () => ({
      status: 201,
      body: {
        id: `mock-ad-${Date.now()}`,
        slug: `mock-veiculo-${Date.now()}`,
        status: "active",
        message: "Anúncio enviado com sucesso",
      },
    }),
  } as unknown as Record<string, RouteHandler>,

  "GET /api/plans": {
    handler: () => ({
      status: 200,
      body: { plans: fixtures.plans },
    }),
  } as unknown as Record<string, RouteHandler>,

  "POST /api/payments/checkout": {
    handler: () => ({
      status: 200,
      body: { checkout_url: "https://mock-checkout.example.com/pay", id: "mock-payment-1" },
    }),
  } as unknown as Record<string, RouteHandler>,

  "GET /api/cities/search": {
    handler: (_body, url) => {
      const q = url.searchParams.get("q") || "";
      const results = fixtures.cities.filter((c) =>
        c.name.toLowerCase().includes(q.toLowerCase())
      );
      return { status: 200, body: { data: results.slice(0, 20) } };
    },
  } as unknown as Record<string, RouteHandler>,

  "GET /api/v1/carros/marcas": {
    handler: () => ({
      status: 200,
      body: fixtures.fipe.brands,
    }),
  } as unknown as Record<string, RouteHandler>,

  "GET /api/v1/carros/marcas/": {
    handler: (_body, url) => {
      const parts = url.pathname.split("/");
      const brandCode = parts[5];
      const isModels = parts[6] === "modelos";
      const isYears = parts.length >= 8;

      if (isYears) {
        return { status: 200, body: fixtures.fipe.years };
      }
      if (isModels) {
        const models = fixtures.fipe.models[brandCode || ""] || [];
        return { status: 200, body: { modelos: models } };
      }
      return { status: 200, body: fixtures.fipe.brands };
    },
  } as unknown as Record<string, RouteHandler>,

  "POST /api/auth/logout": {
    handler: () => ({
      status: 200,
      body: { ok: true },
    }),
  } as unknown as Record<string, RouteHandler>,
};

function matchRoute(method: string, pathname: string): RouteHandler | null {
  const exact = routes[`${method} ${pathname}`];
  if (exact) return (exact as unknown as { handler: RouteHandler }).handler;

  for (const [pattern, value] of Object.entries(routes)) {
    const [m, p] = pattern.split(" ", 2);
    if (m !== method) continue;
    if (p && pathname.startsWith(p.replace(/\/$/, ""))) {
      return (value as unknown as { handler: RouteHandler }).handler;
    }
  }
  return null;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const method = (req.method || "GET").toUpperCase();

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Forwarded-For");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const handler = matchRoute(method, url.pathname);
  if (!handler) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found (mock)", path: url.pathname }));
    return;
  }

  let body: Record<string, unknown> = {};
  if (method !== "GET" && method !== "HEAD") {
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const result = handler(body, url, req);
  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[mock-backend] Listening on http://0.0.0.0:${PORT}`);
});
