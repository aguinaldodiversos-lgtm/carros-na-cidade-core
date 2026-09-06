// frontend/lib/http/public-origin.ts
//
// Origem PÚBLICA de uma requisição — a que o navegador consegue resolver.
//
// ── O defeito que este módulo existe para impedir ────────────────────────────
// `NextResponse.redirect(new URL(target, request.url))` monta o `Location`
// absoluto a partir da URL que o processo Next recebeu. Atrás de um proxy
// (Render, previews, qualquer PaaS que faça port-mapping) essa URL é a do
// container, não a do site:
//
//     Location: http://srv-d1abcdef2gh:10000/tabela-fipe/atibaia-sp
//
// O navegador segue o `Location` literalmente, tenta resolver `srv-d1abcdef2gh`
// no DNS público e falha com DNS_PROBE_FINISHED_NXDOMAIN. O redirect estava
// certo em rota e em status; o host é que não existia fora da rede interna.
//
// ── Ordem de resolução ───────────────────────────────────────────────────────
//   1. `x-forwarded-host` (+ `x-forwarded-proto`) — é exatamente o que o proxy
//      registra como host pedido pelo cliente. Quando existe, é a resposta.
//   2. `host`, SE não parecer interno — cobre dev local (`localhost:3000`,
//      `127.0.0.1:3000`) sem depender de env configurada.
//   3. `NEXT_PUBLIC_SITE_URL` via `getSiteUrl()` — a origem canônica do
//      projeto, já usada por canonical/OG/sitemap. Último recurso, e o que
//      salva o caso "sem forwarded e host interno".
//
// O passo 2 é o que exige a heurística de host interno: sem ela, um ambiente
// que não emita `x-forwarded-host` reintroduziria o bug pelo header `host`.

import { getSiteUrl } from "@/lib/seo/site";

/**
 * Um host é tratado como INTERNO quando não tem ponto no nome e não é um
 * loopback conhecido — `srv-d1abcdef2gh`, `web`, `app-container`. Hostnames
 * públicos sempre têm ponto (`carrosnacidade.com`), e os de dev que queremos
 * preservar são nomeados explicitamente.
 *
 * Conservador de propósito: na dúvida, cai para a origem canônica, que é
 * sempre navegável. O inverso — deixar passar um host interno — é o bug.
 */
function isInternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1") return false;
  if (h.endsWith(".localhost")) return false;
  return !h.includes(".");
}

/** Primeiro valor de uma lista `a, b, c` de header de proxy. */
function firstHeaderValue(raw: string | null): string {
  if (!raw) return "";
  const first = raw.split(",")[0];
  return first ? first.trim() : "";
}

function buildOrigin(proto: string, host: string): string | null {
  if (!host) return null;
  const scheme = proto === "http" || proto === "https" ? proto : "https";
  try {
    // `new URL` valida host+porta e normaliza; host malformado lança e cai fora.
    const url = new URL(`${scheme}://${host}`);
    if (isInternalHost(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Origem pública para montar `Location` de redirect. Nunca devolve host
 * interno: o pior caso é a origem canônica do site.
 */
export function resolvePublicOrigin(request: Request): string {
  const headers = request.headers;

  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  if (forwardedHost) {
    const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto")) || "https";
    const origin = buildOrigin(forwardedProto, forwardedHost);
    if (origin) return origin;
  }

  const host = firstHeaderValue(headers.get("host"));
  if (host) {
    // Sem `x-forwarded-proto`, deduz do próprio request: loopback é http.
    let proto = firstHeaderValue(headers.get("x-forwarded-proto"));
    if (!proto) {
      try {
        proto = new URL(request.url).protocol.replace(":", "");
      } catch {
        proto = "https";
      }
    }
    const origin = buildOrigin(proto, host);
    if (origin) return origin;
  }

  return getSiteUrl();
}

/**
 * `new URL(path, origem pública)` — o substituto direto de
 * `new URL(path, request.url)` em redirects que o navegador vai seguir.
 */
export function buildPublicRedirectUrl(path: string, request: Request): URL {
  return new URL(path, resolvePublicOrigin(request));
}
