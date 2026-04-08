import { NextRequest, NextResponse } from "next/server";
import { getSessionDataFromRequest } from "@/services/sessionService";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const subPath = params.path.join("/");
  const search = request.nextUrl.search || "";
  const backendUrl = resolveBackendApiUrl(`/api/admin/${subPath}${search}`);

  if (!backendUrl) {
    return NextResponse.json({ ok: false, error: "Backend não configurado" }, { status: 502 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/json",
  };

  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.text();
    } catch {}
  }

  try {
    const res = await fetch(backendUrl, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, error: "Resposta inválida do backend" };
    }

    return NextResponse.json(data, {
      status: res.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Erro de comunicação com o backend" },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
