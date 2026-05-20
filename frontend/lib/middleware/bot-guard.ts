/**
 * Decide se uma request deve ser bloqueada com 429 por sinal de bot
 * elementar (user-agent vazio em rota SSR pesada).
 *
 * Motivação (2026-05-20):
 *   Diagnóstico de bandwidth identificou rotas territoriais (SSR) sendo
 *   varridas — bots básicos não enviam user-agent. Bloquear com 429
 *   pequeno corta o vazamento sem afetar navegadores reais.
 *
 * Escopo limitado:
 *   - Aplica APENAS em rotas SSR pesadas (catálogos territoriais).
 *   - NÃO aplica em /api/*, /_next/*, /images/*, healthcheck, robots.txt,
 *     sitemap.xml — esses são recursos legítimos ou rotas leves.
 *
 * Sinal de bot:
 *   - User-Agent vazio/ausente. Este é o caso clássico de scrapers
 *     elementares. Bots sérios (Googlebot, Bingbot) enviam UA — eles
 *     NÃO são bloqueados aqui.
 *
 * Sem rate limit complexo (decisão de produto):
 *   Esta é uma defesa de primeira linha. Rate limit por IP fica fora
 *   de escopo nesta fase — middleware Edge não tem estado persistente
 *   fácil, e Render+Cloudflare oferecem alternativas melhores.
 *
 * Função pura — caller decide forma da resposta 429.
 */

export type BotGuardDecision = { kind: "pass" } | { kind: "block-429" };

/**
 * Rotas SSR consideradas "pesadas" — devem ser protegidas. Cada prefixo
 * é uma rota da vitrine pública territorial que renderiza HTML grande.
 *
 * NÃO incluído por design:
 *   - "/"           — home pode ser hit por healthchecks/monitoramento
 *   - "/veiculo/*"  — detalhe é por slug específico (varredura é rara)
 *   - "/blog/*"     — conteúdo, varredura legítima de SEO
 *   - "/api/*"      — APIs (caller pode ser legítimo sem UA, ex.: SSR
 *                     do próprio Next durante hidratação)
 *   - "/_next/*"    — Next runtime
 *   - "/images/*"   — assets estáticos
 */
const HOT_PATH_PREFIXES = [
  "/comprar/",
  "/carros-em/",
  "/carros-baratos-em/",
  "/carros-automaticos-em/",
  "/carros-usados/regiao/",
  "/cidade/",
];

function isHotPath(pathname: string): boolean {
  return HOT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * @param userAgent  Header `user-agent` (pode ser null, undefined ou string vazia)
 * @param pathname   Pathname da URL
 */
export function decideBotGuard(
  userAgent: string | null | undefined,
  pathname: string
): BotGuardDecision {
  if (!isHotPath(pathname)) return { kind: "pass" };

  const ua = (userAgent || "").trim();
  if (ua.length === 0) {
    return { kind: "block-429" };
  }

  return { kind: "pass" };
}
