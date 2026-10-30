import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

export async function forwardDealerReviewRequest(
  request: NextRequest,
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: Record<string, unknown>
) {
  const auth = await authenticateBffRequest(request);
  if (!auth.ok) return auth.response;
  const url = resolveInternalBackendApiUrl(path);
  if (!url) return NextResponse.json({ error: "Serviço indisponível." }, { status: 502 });
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: "Bearer " + auth.ctx.session.accessToken,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({ error: "Erro no servidor." }));
    const result = NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "private, no-store" } });
    return applyBffCookies(result, auth.ctx);
  } catch {
    return NextResponse.json({ error: "Não foi possível concluir a operação." }, { status: 502 });
  }
}
