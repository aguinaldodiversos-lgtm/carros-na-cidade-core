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
      { status: 503 }
    );
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...buildInternalBackendHeaders(),
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
      { status: 502 }
    );
  }

  if (backendResponse.status === 400) {
    return NextResponse.json(
      { ok: false, error: "invalid_coordinates" },
      { status: 400 }
    );
  }

  if (!backendResponse.ok) {
    return NextResponse.json(
      { ok: false, error: "backend_error" },
      { status: 502 }
    );
  }

  let envelope: unknown;
  try {
    envelope = await backendResponse.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_backend_response" },
      { status: 502 }
    );
  }

  // Repassa o data como veio do backend. data === null significa "fora
  // de cobertura" — o client decide o fallback (estado / escolha manual).
  const data = (envelope as { ok?: boolean; data?: unknown })?.data ?? null;
  return NextResponse.json(
    { ok: true, data },
    {
      status: 200,
      headers: {
        // Cache OFF: coordenadas variam por usuário, não há reutilização.
        "Cache-Control": "private, no-store",
      },
    }
  );
}
