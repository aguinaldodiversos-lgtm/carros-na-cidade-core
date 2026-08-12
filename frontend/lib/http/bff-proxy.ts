import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

/**
 * Fábrica de proxy autenticado para o backend.
 *
 * Existe porque a Fase 2 precisa de DOIS proxies com a mesma forma (procuras do
 * comprador e oportunidades do lojista). Escrever o mesmo bloco de 80 linhas
 * duas vezes traria dois problemas concretos: o detector de clones do
 * `audit:clones` roda no CI, e — pior — uma correção futura de segurança
 * precisaria ser lembrada em dois arquivos.
 *
 * Usa `authenticateBffRequest`/`applyBffCookies` de `lib/http/bff-session`, e
 * não a leitura manual de sessão que os proxies de notificações e suporte
 * fazem. Dois motivos: o helper é justamente o que existe para impedir a classe
 * de bug "a rota esqueceu de renovar o token ou de repassar o IP", e ele evita
 * um import novo de `services/`, que o PROJECT_RULES trata como legado.
 *
 * A autorização de verdade vive no BACKEND. Este proxy nunca decide de quem é o
 * quê — ele só garante que a request chegue lá com o Bearer do usuário certo.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

export type BackendProxyOptions = {
  /** Prefixo no backend, ex.: "/api/account/purchase-intents". */
  basePath: string;
  timeoutMs?: number;
  /** Mensagem de timeout específica do domínio (aparece para o usuário). */
  timeoutMessage?: string;
};

export function denyBff(status: number, error: string): NextResponse {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

/**
 * Segmento de caminho seguro. Sem `.`/`..` (traversal), sem barra e sem
 * control-char — o valor é concatenado na URL do backend.
 */
export function isSafePathSegment(segment: string): boolean {
  if (!segment) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  for (let i = 0; i < segment.length; i++) {
    const code = segment.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

export function createBackendProxy(options: BackendProxyOptions) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutMessage = options.timeoutMessage ?? "Tempo esgotado ao falar com o servidor.";

  return async function proxy(
    request: NextRequest,
    { params }: { params: { path?: string[] } }
  ): Promise<NextResponse> {
    // 1) sessão (leitura + renovação de token + headers internos) ----------
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) {
      return denyBff(401, "Sessão inválida. Entre novamente.");
    }

    // 2) caminho seguro ----------------------------------------------------
    // O catch-all é OPCIONAL nas duas rotas: a base sem segmento é um endpoint
    // real (a listagem). Por isso `segments.length &&` — com a guarda do
    // suporte (`!segments.length || ...`) a listagem seria recusada com 400.
    const segments = Array.isArray(params.path) ? params.path : [];
    if (segments.length && !segments.every(isSafePathSegment)) {
      return denyBff(400, "Caminho inválido");
    }

    const subPath = segments.length ? `/${segments.join("/")}` : "";
    const search = request.nextUrl.search || "";
    const backendUrl = resolveInternalBackendApiUrl(`${options.basePath}${subPath}${search}`);
    if (!backendUrl) {
      return denyBff(502, "Backend não configurado");
    }

    // 3) headers controlados ----------------------------------------------
    const headers: Record<string, string> = { ...auth.ctx.backendHeaders };
    const contentType = request.headers.get("content-type");
    if (contentType) headers["Content-Type"] = contentType;

    // 4) body só nos métodos que têm payload -------------------------------
    let body: string | undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = await request.text();
      } catch {
        return denyBff(400, "Body inválido");
      }
    }

    // 5) encaminha ---------------------------------------------------------
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const upstream = await fetch(backendUrl, {
        method: request.method,
        headers,
        body,
        cache: "no-store",
        signal: controller.signal,
      });

      const payload = await upstream.json().catch(() => null);

      const response = NextResponse.json(payload ?? {}, {
        status: upstream.status,
        // A regra de `next.config.mjs` cobre as PÁGINAS de /dashboard*, não as
        // rotas /api/*. Aqui o cabeçalho é obrigatório e explícito.
        headers: { "Cache-Control": "private, no-store" },
      });

      return applyBffCookies(response, auth.ctx);
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return denyBff(502, aborted ? timeoutMessage : "Falha ao falar com o servidor.");
    } finally {
      clearTimeout(timeout);
    }
  };
}
