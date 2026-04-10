import { NextRequest, NextResponse } from "next/server";

import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca cidades por UF + trecho do nome (delega ao backend público).
 * GET /api/cities/search?q=&uf=&limit=
 */
export async function GET(request: NextRequest) {
  if (!getBackendApiBaseUrl()) {
    return NextResponse.json(
      { success: false, message: "API do backend não configurada.", data: [] },
      { status: 500 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const uf = sp.get("uf") ?? "";
  const limit = sp.get("limit") ?? "";

  const url = resolveBackendApiUrl(
    `/api/public/cities/search?${new URLSearchParams({ q, uf, ...(limit ? { limit } : {}) }).toString()}`
  );
  if (!url) {
    return NextResponse.json(
      { success: false, message: "URL inválida.", data: [] },
      { status: 500 }
    );
  }

  const res = await fetch(url, {
    headers: { Accept: "application/json", ...buildBffBackendForwardHeaders(request) },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { success: false, message: "Resposta inválida.", data: [] },
      { status: 502 }
    );
  }

  const out = NextResponse.json(data, { status: res.status });
  out.headers.set("Cache-Control", "private, no-store, max-age=0");
  return out;
}
