/**
 * Logging temporário de bandwidth — habilitado por env var, sem PII.
 *
 * Motivação (2026-05-20):
 *   Para diagnosticar quais rotas/UAs consomem banda em produção sem
 *   acesso direto ao tráfego do Render, emitimos uma linha JSON por
 *   request quando `BANDWIDTH_DIAGNOSTICS_ENABLED=true`. Render Logs
 *   captura stdout e permite análise offline.
 *
 * Política de privacidade:
 *   - NÃO loga IP, cookies, Authorization, queries cruas, body.
 *   - Loga user-agent RESUMIDO (browser group, sem versão completa).
 *   - Loga referer apenas como HOST (sem path/query).
 *   - Loga pathname agrupado (pathGroup) — não o slug específico,
 *     para não expor padrões individuais de consumo.
 *
 * Ativação:
 *   Setar `BANDWIDTH_DIAGNOSTICS_ENABLED=true` no Render por 30-60 min
 *   durante janela de diagnóstico. Desligar após coletar dados.
 *
 * Função pura — caller decide quando emitir e qual transport.
 */

export type UserAgentGroup = "browser" | "bot" | "empty" | "unknown";

export type BandwidthLogEntry = {
  event: "bandwidth";
  timestamp: string;
  method: string;
  pathGroup: string;
  status: number;
  contentType: string | null;
  host: string | null;
  refererHost: string | null;
  uaGroup: UserAgentGroup;
  cacheControl: string | null;
  durationMs: number;
};

const PATH_GROUPS: Array<{ prefix: string; group: string }> = [
  { prefix: "/_next/static", group: "/_next/static/*" },
  { prefix: "/_next/image", group: "/_next/image" },
  { prefix: "/_next/data", group: "/_next/data/*" },
  { prefix: "/images/", group: "/images/*" },
  { prefix: "/api/", group: "/api/*" },
  { prefix: "/sitemaps/", group: "/sitemaps/*" },
  { prefix: "/comprar/estado/", group: "/comprar/estado/[uf]" },
  { prefix: "/comprar/cidade/", group: "/comprar/cidade/[slug]" },
  { prefix: "/comprar/", group: "/comprar/*" },
  { prefix: "/carros-em/", group: "/carros-em/[slug]" },
  { prefix: "/carros-baratos-em/", group: "/carros-baratos-em/[slug]" },
  { prefix: "/carros-automaticos-em/", group: "/carros-automaticos-em/[slug]" },
  { prefix: "/carros-usados/regiao/", group: "/carros-usados/regiao/[slug]" },
  { prefix: "/cidade/", group: "/cidade/[slug]" },
  { prefix: "/veiculo/", group: "/veiculo/[slug]" },
  { prefix: "/blog/", group: "/blog/*" },
  { prefix: "/tabela-fipe", group: "/tabela-fipe/*" },
  { prefix: "/simulador-financiamento", group: "/simulador-financiamento/*" },
];

export function groupPathname(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname === "/robots.txt") return "/robots.txt";
  if (pathname === "/sitemap.xml") return "/sitemap.xml";
  if (pathname === "/favicon.ico") return "/favicon.ico";
  if (pathname === "/healthcheck" || pathname === "/api/healthcheck") return "/healthcheck";
  for (const { prefix, group } of PATH_GROUPS) {
    if (pathname.startsWith(prefix)) return group;
  }
  return "other";
}

export function classifyUserAgent(userAgent: string | null | undefined): UserAgentGroup {
  if (!userAgent) return "empty";
  const ua = userAgent.trim();
  if (ua.length === 0) return "empty";
  if (
    /googlebot|bingbot|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver/i.test(ua)
  ) {
    return "bot";
  }
  if (/curl|wget|python|java|go-http-client|libwww|httpclient|axios|node-fetch/i.test(ua)) {
    return "bot";
  }
  if (/mozilla|chrome|safari|firefox|edge|opera/i.test(ua)) {
    return "browser";
  }
  return "unknown";
}

export function refererHost(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).host || null;
  } catch {
    return null;
  }
}

export type BuildBandwidthLogEntryInput = {
  method: string;
  pathname: string;
  status: number;
  contentType?: string | null;
  host?: string | null;
  referer?: string | null;
  userAgent?: string | null;
  cacheControl?: string | null;
  durationMs: number;
};

export function buildBandwidthLogEntry(input: BuildBandwidthLogEntryInput): BandwidthLogEntry {
  return {
    event: "bandwidth",
    timestamp: new Date().toISOString(),
    method: input.method,
    pathGroup: groupPathname(input.pathname),
    status: input.status,
    contentType: input.contentType ?? null,
    host: input.host ?? null,
    refererHost: refererHost(input.referer),
    uaGroup: classifyUserAgent(input.userAgent),
    cacheControl: input.cacheControl ?? null,
    durationMs: input.durationMs,
  };
}

export function isBandwidthDiagnosticsEnabled(): boolean {
  return process.env.BANDWIDTH_DIAGNOSTICS_ENABLED === "true";
}
