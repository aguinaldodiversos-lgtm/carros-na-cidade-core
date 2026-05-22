import { NextResponse, type NextRequest } from "next/server";

import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";
import { getClientIpFromNextRequest } from "@/lib/http/client-ip";

/**
 * BFF: POST /api/location/resolve
 *
 * Recebe `{ latitude, longitude }` do client e proxia para o backend
 * interno (`POST /api/internal/location/resolve`) com `X-Internal-Token`
 * injetado SOMENTE no server.
 *
 * Princípios:
 *   - **Privacidade**: o body cru (coordenadas) NUNCA aparece em logs.
 *     Apenas o resultado agregado é logável pelo backend (ver
 *     `location.service.js`).
 *   - **Sem persistência**: este endpoint não escreve em DB nem cache.
 *     Coordenadas vivem apenas em RAM do request.
 *   - **Validação dupla**: o BFF valida antes para evitar RTT ao backend
 *     com payload inválido. O backend revalida.
 *   - **Rate limit leve**: in-memory por IP, janela de 60s, 15 req/min.
 *     Não substitui o rate limit do backend — só ajuda a poupar RTTs.
 *     Multi-instância: cada instância tem seu próprio contador.
 *   - **Token nunca vaza**: `buildInternalBackendHeaders()` só retorna o
 *     header em SSR. Em runtime de route handler do Next, isso é server
 *     por design. Defesa em profundidade: nem o body de resposta para o
 *     client carrega o token.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Map<ip, { count, windowStart }>. Per-instância — multi-instância tem
// memória independente. Suficiente como "rate limit leve".
const rateLimitState = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = rateLimitState.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(ip, { count: 1, windowStart: now });
    return { ok: true, retryAfterSec: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  entry.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

function isValidLat(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLng(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= -180 && value <= 180;
}

type ParsedBody = {
  latitude: number;
  longitude: number;
};

function parseBody(raw: unknown): ParsedBody | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const lat = typeof obj.latitude === "number" ? obj.latitude : Number(obj.latitude);
  const lng = typeof obj.longitude === "number" ? obj.longitude : Number(obj.longitude);
  if (!isValidLat(lat) || !isValidLng(lng)) return null;
  return { latitude: lat, longitude: lng };
}

export async function POST(request: NextRequest) {
  const ip = getClientIpFromNextRequest(request) || "unknown";
  const rate = checkRateLimit(ip);
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const parsed = parseBody(raw);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "invalid_coordinates" },
      { status: 400 }
    );
  }

  const url = resolveBackendApiUrl("/api/internal/location/resolve");
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "backend_unavailable" },
      { status: 503, headers: { ...buildDiagnosticHeaders("backend_unavailable") } }
    );
  }

  const internalHeaders = buildInternalBackendHeaders();
  // Diagnóstico operacional (NUNCA o valor do token, apenas a presença
  // — confirma que `INTERNAL_API_TOKEN` está configurado no service).
  const tokenConfigured = "X-Internal-Token" in internalHeaders;

  let backendResponse: Response;
  try {
    backendResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...internalHeaders,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(parsed),
      // POST não cacheia.
      cache: "no-store",
    });
  } catch {
    // Não logamos coordenadas, apenas o evento "rede falhou".
    return NextResponse.json(
      { ok: false, error: "backend_unreachable" },
      {
        status: 502,
        headers: { ...buildDiagnosticHeaders("backend_unreachable", { tokenConfigured }) },
      }
    );
  }

  // Diferencia claramente 401/403 (token errado/negado) de 4xx/5xx genéricos.
  // Mantém código de status 502 para o client (uniformiza tratamento), mas
  // expõe o motivo via header `X-Diag-Reason` para operadores diagnosticarem
  // sem precisar entrar nos logs do Render.
  if (backendResponse.status === 400) {
    return NextResponse.json(
      { ok: false, error: "invalid_coordinates" },
      {
        status: 400,
        headers: {
          ...buildDiagnosticHeaders("invalid_coordinates", {
            tokenConfigured,
            backendStatus: backendResponse.status,
          }),
        },
      }
    );
  }

  if (backendResponse.status === 401 || backendResponse.status === 403) {
    // Token errado, ou backend devolveu rejeição autenticada (raro).
    // backend.requireInternalToken devolve 404 para token errado/ausente —
    // 401/403 só aparece em integrações futuras. Mantemos como erro de
    // backend para o client, mas com diagnóstico explícito.
    return NextResponse.json(
      { ok: false, error: "backend_error" },
      {
        status: 502,
        headers: {
          ...buildDiagnosticHeaders("backend_auth_rejected", {
            tokenConfigured,
            backendStatus: backendResponse.status,
          }),
        },
      }
    );
  }

  if (backendResponse.status === 404) {
    // 404 do backend tem dois significados possíveis:
    //   - rota não montada (deploy do backend antigo)
    //   - `requireInternalToken` rejeitou (token errado/ausente)
    // Diferenciamos via `tokenConfigured`: se o frontend tem token mas
    // o backend devolve 404, provavelmente é token inválido.
    return NextResponse.json(
      { ok: false, error: "backend_error" },
      {
        status: 502,
        headers: {
          ...buildDiagnosticHeaders(
            tokenConfigured ? "backend_404_token_mismatch" : "backend_404_no_token",
            { tokenConfigured, backendStatus: backendResponse.status }
          ),
        },
      }
    );
  }

  if (!backendResponse.ok) {
    return NextResponse.json(
      { ok: false, error: "backend_error" },
      {
        status: 502,
        headers: {
          ...buildDiagnosticHeaders("backend_5xx", {
            tokenConfigured,
            backendStatus: backendResponse.status,
          }),
        },
      }
    );
  }

  let envelope: unknown;
  try {
    envelope = await backendResponse.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_backend_response" },
      {
        status: 502,
        headers: {
          ...buildDiagnosticHeaders("invalid_backend_response", {
            tokenConfigured,
            backendStatus: backendResponse.status,
          }),
        },
      }
    );
  }

  const data = (envelope as { ok?: boolean; data?: unknown })?.data ?? null;
  return NextResponse.json(
    { ok: true, data },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        ...buildDiagnosticHeaders(data ? "ok" : "out_of_coverage", {
          tokenConfigured,
          backendStatus: backendResponse.status,
        }),
      },
    }
  );
}

/**
 * Headers de diagnóstico não-sensíveis para depurar o BFF em produção
 * sem precisar dos logs. NUNCA inclui token nem coordenadas.
 *
 * - `X-Diag-Reason`: motivo enumerado (ok / out_of_coverage /
 *   backend_404_token_mismatch / etc.) para distinguir cenários sem
 *   ambiguidade.
 * - `X-Diag-Token-Configured`: "true" / "false" — confirma se o
 *   `INTERNAL_API_TOKEN` foi lido com sucesso pelo BFF. Sem isso, o
 *   operador não sabe se o problema é configuração ou backend.
 * - `X-Diag-Backend-Status`: status HTTP devolvido pelo backend
 *   interno. Só presente quando houve resposta do backend.
 */
function buildDiagnosticHeaders(
  reason: string,
  extra?: { tokenConfigured?: boolean; backendStatus?: number }
): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Diag-Reason": reason,
  };
  if (extra?.tokenConfigured !== undefined) {
    headers["X-Diag-Token-Configured"] = extra.tokenConfigured ? "true" : "false";
  }
  if (extra?.backendStatus !== undefined) {
    headers["X-Diag-Backend-Status"] = String(extra.backendStatus);
  }
  return headers;
}
