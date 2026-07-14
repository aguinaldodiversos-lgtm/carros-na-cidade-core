import { NextRequest, NextResponse } from "next/server";

import {
  BackendApiError,
  fetchStoreProfile,
  updateStoreProfile,
} from "@/lib/account/backend-account";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown, tag: string): NextResponse {
  if (error instanceof BackendApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
    );
  }
  console.error(tag, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Falha ao processar os dados da loja." }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;
    const payload = await fetchStoreProfile(auth.ctx.session);
    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    return errorResponse(error, "[GET /api/account/store]");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Allowlist explícito — nunca repassa o body cru.
    const payload = {
      name: String(raw?.name ?? ""),
      email: String(raw?.email ?? ""),
      whatsapp: String(raw?.whatsapp ?? ""),
      address: String(raw?.address ?? ""),
    };

    const updated = await updateStoreProfile(auth.ctx.session, payload);
    return applyBffCookies(NextResponse.json(updated), auth.ctx);
  } catch (error) {
    return errorResponse(error, "[PUT /api/account/store]");
  }
}
