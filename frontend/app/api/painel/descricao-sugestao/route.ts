import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

/**
 * BFF da sugestão de descrição do passo de Revisão (Fase 4.5).
 *
 * Proxy fino para `POST /api/ads/description-suggestion`. A regra toda mora no
 * backend (allowlist do catálogo, guard de saída, rate limit por usuário);
 * aqui só validamos a sessão e repassamos o Bearer do próprio usuário.
 *
 * Só encaminhamos os campos do VEÍCULO. `price`, `city` e contato nem chegam a
 * ser lidos — o backend também os ignora, mas cortar na origem evita que um
 * refactor futuro os empurre para dentro do prompt sem querer.
 *
 * Timeout um pouco MAIOR que o deadline do backend (15s), de propósito: assim
 * quem responde primeiro é o backend, com a mensagem genérica dele, em vez de
 * o proxy cortar antes e produzir um 504 sem contexto.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 18_000;

const GENERIC_ERROR =
  "Não foi possível gerar a sugestão agora. Escreva a descrição ou tente de novo em instantes.";

function fail(status: number, message: string) {
  return NextResponse.json(
    { ok: false, message },
    { status, headers: { "Cache-Control": "private, no-store" } }
  );
}

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** Só as keys de opcionais; o backend valida contra o catálogo e descarta o resto. */
function optionKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ).slice(0, 200);
}

export async function POST(request: NextRequest) {
  const session = getSessionDataFromRequest(request);
  if (!session || (!session.accessToken && !session.refreshToken)) {
    return fail(401, "Faça login para gerar uma sugestão.");
  }

  const ensured = await ensureSessionWithFreshBackendTokens(session);
  if (!ensured.ok || !ensured.session.accessToken) {
    return fail(401, "Sessão expirada. Entre novamente.");
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, "Requisição inválida.");
  }

  const payload = {
    draftId: text(raw.draftId, 64),
    adId: text(raw.adId, 64),
    brandLabel: text(raw.brandLabel),
    modelLabel: text(raw.modelLabel),
    versionLabel: text(raw.versionLabel),
    yearModel: text(raw.yearModel, 8),
    yearManufacture: text(raw.yearManufacture, 8),
    color: text(raw.color),
    fuel: text(raw.fuel),
    transmission: text(raw.transmission),
    bodyStyle: text(raw.bodyStyle),
    mileage: text(raw.mileage, 16),
    armored: raw.armored === true,
    vehicleOptionKeys: optionKeys(raw.vehicleOptionKeys),
  };

  const backendUrl = resolveInternalBackendApiUrl("/api/ads/description-suggestion");
  if (!backendUrl) {
    return fail(502, GENERIC_ERROR);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ensured.session.accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...buildBffBackendForwardHeaders(request),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });

    const body = (await upstream.json().catch(() => null)) as {
      suggestion?: string;
      message?: string;
    } | null;

    if (!upstream.ok || typeof body?.suggestion !== "string" || !body.suggestion.trim()) {
      const response = NextResponse.json(
        { ok: false, message: body?.message || GENERIC_ERROR },
        {
          status: upstream.status >= 400 ? upstream.status : 502,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
      if (ensured.persistCookies) applySessionCookiesToResponse(response, ensured.persistCookies);
      return response;
    }

    const response = NextResponse.json(
      { ok: true, suggestion: body.suggestion },
      { status: 200, headers: { "Cache-Control": "private, no-store" } }
    );
    if (ensured.persistCookies) applySessionCookiesToResponse(response, ensured.persistCookies);
    return response;
  } catch (err) {
    // Detalhe fica no log do servidor; o usuário recebe sempre o mesmo texto.
    console.error("[descricao-sugestao] falha ao consultar o backend", {
      name: (err as Error)?.name,
    });
    return fail((err as Error)?.name === "AbortError" ? 504 : 503, GENERIC_ERROR);
  } finally {
    clearTimeout(timer);
  }
}
