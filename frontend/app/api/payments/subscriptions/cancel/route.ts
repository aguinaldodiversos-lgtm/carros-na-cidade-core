/**
 * BFF: POST /api/payments/subscriptions/cancel (Fase A — plugar cancelamento).
 *
 * Proxy fino para a rota dedicada do backend
 * (`POST /api/payments/subscriptions/cancel`), que chama
 * cancelUserSubscription → cancelPreapproval (marca cancel_at_period_end=true
 * e manda cancelled no Mercado Pago, com ownership + tratamento de MP fora do
 * ar). Espelha o padrão de checkout/route.ts: mesma auth, cookies e leitura de
 * `message` (string) em vez do boolean `error`.
 *
 * SEGURANÇA: o cancelamento é escopado pela SESSÃO no backend (req.user.id).
 * Este BFF NÃO encaminha corpo nenhum — o cliente não pode indicar qual
 * assinatura cancelar, então é impossível cancelar a de outro usuário.
 *
 * NÃO fica atrás da flag SUBSCRIPTIONS_LIVE (diferente do checkout): cancelar
 * é ação de proteção do consumidor e deve funcionar mesmo com novas
 * assinaturas pausadas (ex.: sub criada em sandbox/admin precisa poder ser
 * cancelada).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const backendUrl = resolveInternalBackendApiUrl("/api/payments/subscriptions/cancel");
    if (!backendUrl) {
      return NextResponse.json({ error: "Backend nao configurado" }, { status: 500 });
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        ...auth.ctx.backendHeaders,
        "Content-Type": "application/json",
      },
      // Corpo vazio de propósito: a assinatura é resolvida pela sessão no backend.
      body: JSON.stringify({}),
      cache: "no-store",
    });

    const responseBody = await response.json().catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      // O backend responde { success:false, error:true, message:"<causa>" } —
      // `error` é BOOLEAN. Lemos `message` (string) primeiro para não descartar
      // a causa real (ex.: "Falha ao cancelar no Mercado Pago").
      const be = responseBody as { error?: unknown; message?: unknown };
      const message =
        (typeof be.message === "string" && be.message.trim() && be.message) ||
        (typeof be.error === "string" && be.error.trim() && be.error) ||
        "Falha ao cancelar a assinatura.";
      console.error("[POST /api/payments/subscriptions/cancel] backend", response.status, message);
      return applyBffCookies(
        NextResponse.json({ error: message }, { status: response.status }),
        auth.ctx
      );
    }

    return applyBffCookies(NextResponse.json(responseBody), auth.ctx);
  } catch (error) {
    console.error(
      "[POST /api/payments/subscriptions/cancel]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Falha ao cancelar a assinatura." }, { status: 502 });
  }
}
