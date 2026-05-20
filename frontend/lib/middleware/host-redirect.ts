/**
 * Decide se uma request em um host onrender.com deve ser redirecionada
 * para o domínio canônico (www.carrosnacidade.com).
 *
 * Motivação (2026-05-20):
 *   `carros-na-cidade-portal.onrender.com` estava servindo HTML completo
 *   da vitrine — bots/scrapers que descobriram esse host duplicavam
 *   tráfego e fragmentavam sinal SEO. Confirmado via curl:
 *     GET https://carros-na-cidade-portal.onrender.com/  → 200, 184 KB
 *
 * Regras:
 *   - Host termina em ".onrender.com" → 301 para www.carrosnacidade.com
 *     preservando pathname + querystring.
 *   - Exceção: pathname='/' (Render usa healthcheck no raiz por padrão)
 *     e /healthcheck, /api/healthcheck — não redirecionamos para não
 *     quebrar o probe do Render. O ganho de banda fica nas demais rotas
 *     (que respondem com HTML grande). Custo: home pode ficar exposta
 *     no onrender, mas é apenas 1 rota.
 *   - Loop: nunca redireciona se host já é o canônico.
 *
 * Função pura — não usa NextResponse. Caller (middleware) decide a
 * forma do redirect baseado no retorno.
 */

export const CANONICAL_HOST = "www.carrosnacidade.com";

export type HostRedirectDecision =
  | { kind: "pass" }
  | { kind: "redirect"; target: string };

const HEALTHCHECK_PATHS = new Set(["/", "/healthcheck", "/api/healthcheck"]);

function isOnrenderHost(host: string): boolean {
  // host pode incluir porta (ex.: "name.onrender.com:443") — ignoramos.
  const cleanHost = host.toLowerCase().split(":")[0];
  return cleanHost.endsWith(".onrender.com");
}

function isCanonicalHost(host: string): boolean {
  const cleanHost = host.toLowerCase().split(":")[0];
  return cleanHost === CANONICAL_HOST || cleanHost === "carrosnacidade.com";
}

/**
 * @param host        Valor do header `host` (ex.: "carros-na-cidade-portal.onrender.com")
 * @param pathname    Pathname da URL (ex.: "/comprar/estado/sp")
 * @param search      Querystring (com `?` ou vazia). Ex.: "?page=2" ou "".
 */
export function decideHostRedirect(
  host: string | null | undefined,
  pathname: string,
  search: string
): HostRedirectDecision {
  if (!host) return { kind: "pass" };
  if (isCanonicalHost(host)) return { kind: "pass" };
  if (!isOnrenderHost(host)) return { kind: "pass" };

  // Render healthcheck: não redirecionamos para não quebrar o probe.
  if (HEALTHCHECK_PATHS.has(pathname)) return { kind: "pass" };

  const safePath = pathname || "/";
  const safeSearch = search || "";
  return {
    kind: "redirect",
    target: `https://${CANONICAL_HOST}${safePath}${safeSearch}`,
  };
}
