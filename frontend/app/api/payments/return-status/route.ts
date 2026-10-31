import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

/**
 * Confirmação pós-checkout: proxy autenticado, somente leitura e sem cache.
 * A referência vem do Mercado Pago, mas o backend exige associação ao userId
 * autenticado e só confia no status gravado por webhook.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateBffRequest(request);
  if (!auth.ok) return auth.response;

  const reference = request.nextUrl.searchParams.get("reference")?.trim() || "";
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(reference)) {
    return applyBffCookies(
      NextResponse.json({ error: "Referência de pagamento inválida." }, { status: 400 }),
      auth.ctx
    );
  }

  const url = resolveInternalBackendApiUrl(
    `/api/payments/return-status?reference=${encodeURIComponent(reference)}`
  );
  if (!url) {
    return applyBffCookies(
      NextResponse.json({ error: "Serviço de confirmação indisponível." }, { status: 503 }),
      auth.ctx
    );
  }

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: auth.ctx.backendHeaders,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    const response = NextResponse.json(payload, { status: upstream.status });
    response.headers.set("Cache-Control", "private, no-store");
    return applyBffCookies(response, auth.ctx);
  } catch {
    const response = NextResponse.json(
      { error: "Não foi possível consultar o pagamento agora." },
      { status: 502 }
    );
    response.headers.set("Cache-Control", "private, no-store");
    return applyBffCookies(response, auth.ctx);
  }
}
