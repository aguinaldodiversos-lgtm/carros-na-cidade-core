import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json(
      { ok: false, message: "Link de confirmação inválido." },
      {
        status: 400,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
  try {
    const upstream = await fetch(resolveInternalBackendApiUrl("/api/auth/verify-email"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildInternalBackendHeaders(),
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    const ok = upstream.ok;
    return NextResponse.json(
      {
        ok,
        message: ok
          ? "E-mail confirmado com sucesso."
          : upstream.status === 400
            ? "Este link expirou ou já foi utilizado."
            : "Não foi possível confirmar o e-mail agora.",
      },
      {
        status: ok ? 200 : upstream.status === 400 ? 400 : 502,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Não foi possível conectar ao serviço de confirmação." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } }
    );
  }
}
