import type { NextRequest } from "next/server";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";

/**
 * IP do visitante no edge (Vercel/Cloudflare/Render) ou proxy.
 * Usado pelo BFF para o backend rate-limitar por usuário real, não pelo IP do servidor Next.js.
 */
export function getClientIpFromNextRequest(request: NextRequest): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xri = request.headers.get("x-real-ip");
  if (xri?.trim()) return xri.trim();

  return "";
}

/**
 * Headers padrao que TODO fetch de BFF/SSR para o backend deve enviar:
 *   - User-Agent: cnc-internal/1.0           (identifica origem nos logs e bypassa bot blocker)
 *   - X-Internal-Token: <INTERNAL_API_TOKEN> (autentica como chamada interna)
 *   - X-Cnc-Client-Ip: <IP real do visitante> (rate limit por usuario final)
 *
 * O backend (bot-blocker.middleware.js -> isAuthenticatedInternalCall) so
 * trata como chamada interna quando UA + token sao ambos validos. Sem token,
 * o UA cnc-internal/1.0 e tratado como qualquer outro — nao da pra burlar
 * setando so o UA.
 *
 * Quando nao houver NextRequest (ex: chamadas de lib SSR sem request scope),
 * use `buildInternalBackendHeaders()` diretamente — o backend continua
 * autenticando pelo token, e o rate limit cai no IP do container do Render
 * (esperado em chamadas SSR de catalogo publico ja resolvidas por
 * ssrResilientFetch via headers() do Next).
 */
export function buildBffBackendForwardHeaders(request: NextRequest): Record<string, string> {
  const internal = buildInternalBackendHeaders();
  const ip = getClientIpFromNextRequest(request);
  if (!ip) return internal;
  return { ...internal, "X-Cnc-Client-Ip": ip };
}
