import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";

/**
 * BFF proxy anônimo para denúncia pública de anúncio (Fase 3.4).
 *
 * Problema corrigido: o modal `ReportAdModal.tsx` fazia POST direto para
 * `/api/ads/<id>/report` esperando que o Next.js fizesse o proxy ao backend
 * Express. Como esta rota não existia, o Next devolvia 404 e o modal
 * mostrava "Não foi possível enviar a denúncia agora" para o usuário —
 * mesmo com backend, schema e migration prontos.
 *
 * Esta rota:
 *   - Aceita POST anônimo (denúncia pública não exige login);
 *   - Encaminha o body { reason, description } intacto para o backend;
 *   - Forwarda os headers internos (UA cnc-internal/1.0 + X-Internal-Token)
 *     para bypassar bot-blocker / rate-limit global do backend;
 *   - Forwarda o IP real do visitante via X-Cnc-Client-Ip — o backend usa
 *     esse header para calcular o hash SHA-256 que define o rate-limit
 *     por IP×ad (3/h) e global (10/h) da denúncia (ver
 *     src/modules/ads/reports/ad-reports.service.js e
 *     src/shared/middlewares/rateLimit.middleware.js#clientRateLimitKey).
 *   - Repassa status code e corpo do backend ao cliente sem reinterpretar
 *     (o modal já sabe distinguir 400/404/429/201 e exibir mensagens
 *     específicas via payload.error / payload.message).
 *
 * Política:
 *   - Denúncia pública NÃO altera `ads.status`, `priority` ou `highlight_until`.
 *   - O service backend só insere em `ad_reports` com status inicial; a
 *     decisão de bloqueio fica para ação admin explícita em /admin/denuncias.
 */

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

type ReportPayload = {
  reason?: string;
  description?: string | null;
};

const REPORT_PATH_TEMPLATE = "/api/ads/{id}/report";

export async function POST(request: NextRequest, { params }: Params) {
  // Validação leve client-side antes de envolver o backend: id precisa ser
  // um inteiro positivo. O backend revalida e devolve 400 para qualquer
  // input malformado — esta checagem só evita um round-trip óbvio.
  const adIdRaw = String(params.id || "").trim();
  if (!/^\d+$/.test(adIdRaw)) {
    return NextResponse.json(
      { success: false, error: "ID do anúncio inválido" },
      { status: 400 }
    );
  }

  let body: ReportPayload;
  try {
    body = (await request.json()) as ReportPayload;
  } catch {
    return NextResponse.json(
      { success: false, error: "Payload inválido" },
      { status: 400 }
    );
  }

  const url = resolveBackendApiUrl(REPORT_PATH_TEMPLATE.replace("{id}", adIdRaw));
  if (!url) {
    // Configuração de env ausente — devolvemos 502 (upstream indisponível)
    // em vez de 500 para que o modal mostre "tente novamente em instantes"
    // de forma consistente.
    return NextResponse.json(
      { success: false, error: "Serviço de denúncias temporariamente indisponível." },
      { status: 502 }
    );
  }

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...buildBffBackendForwardHeaders(request),
  };

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        reason: typeof body.reason === "string" ? body.reason.trim() : "",
        description:
          typeof body.description === "string" && body.description.trim()
            ? body.description.trim()
            : null,
      }),
      cache: "no-store",
    });

    // Repassar status + body do upstream "como está". O modal usa
    // payload.success / payload.message / payload.error para decidir o que
    // exibir, e respeitamos os 201 / 400 / 404 / 429 que o backend emite.
    let payload: unknown = null;
    try {
      payload = await upstream.json();
    } catch {
      payload = null;
    }

    if (payload && typeof payload === "object") {
      return NextResponse.json(payload, { status: upstream.status });
    }

    // Backend não retornou JSON parseável: ainda assim repassamos o status
    // para o cliente decidir.
    return NextResponse.json(
      {
        success: upstream.ok,
        error: upstream.ok ? undefined : "Resposta inesperada do servidor.",
      },
      { status: upstream.status }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "[POST /api/ads/:id/report] proxy falhou",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { success: false, error: "Não foi possível enviar a denúncia agora." },
      { status: 502 }
    );
  }
}
