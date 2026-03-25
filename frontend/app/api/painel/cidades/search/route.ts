import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!getBackendApiBaseUrl()) {
    return NextResponse.json(
      { success: false, message: "API do backend não configurada." },
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
    return NextResponse.json({ success: false, message: "URL do backend inválida." }, { status: 500 });
  }

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ success: false, message: "Resposta inválida do backend." }, { status: 502 });
  }

  return NextResponse.json(data, { status: res.status });
}
