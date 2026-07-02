/**
 * BFF: GET /api/payments/subscriptions/me (Fase A — estado da assinatura).
 *
 * Proxy READ-ONLY para `GET /api/payments/subscriptions/me` no backend, que
 * devolve o estado da assinatura do PRÓPRIO usuário: { status, plan_id,
 * plan_name, expires_at, cancel_at_period_end } ou { status:'none' } quando
 * não há assinatura (ex.: plano gratuito).
 *
 * SEGURANÇA: o backend escopa tudo por req.user.id (sessão). Este BFF só
 * repassa a sessão autenticada — não há parâmetro de usuário/assinatura vindo
 * do cliente.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const backendUrl = resolveInternalBackendApiUrl("/api/payments/subscriptions/me");
    if (!backendUrl) {
      return NextResponse.json({ error: "Backend nao configurado" }, { status: 500 });
    }

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: auth.ctx.backendHeaders,
      cache: "no-store",
    });

    const responseBody = await response.json().catch(() => ({}) as Record<string, unknown>);

    if (!response.ok) {
      const be = responseBody as { error?: unknown; message?: unknown };
      const message =
        (typeof be.message === "string" && be.message.trim() && be.message) ||
        (typeof be.error === "string" && be.error.trim() && be.error) ||
        "Falha ao carregar sua assinatura.";
      console.error("[GET /api/payments/subscriptions/me] backend", response.status, message);
      return applyBffCookies(
        NextResponse.json({ error: message }, { status: response.status }),
        auth.ctx
      );
    }

    return applyBffCookies(NextResponse.json(responseBody), auth.ctx);
  } catch (error) {
    console.error(
      "[GET /api/payments/subscriptions/me]",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json({ error: "Falha ao carregar sua assinatura." }, { status: 502 });
  }
}
