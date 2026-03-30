import { NextResponse } from "next/server";

import { toCityRef } from "@/lib/city/city-types";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TerritorialPayload = {
  city?: {
    id?: number | string;
    name?: string;
    slug?: string;
    state?: string | null;
  };
};

/** Resolve metadados mínimos da cidade a partir do slug territorial. */
export async function GET(_request: Request, { params }: { params: { slug: string } }) {
  const slug = String(params.slug || "").trim();
  if (!slug) {
    return NextResponse.json({ success: false, message: "Slug obrigatório." }, { status: 400 });
  }

  const base = getBackendApiBaseUrl();
  if (!base) {
    return NextResponse.json({ success: false, message: "API não configurada." }, { status: 500 });
  }

  const url = resolveBackendApiUrl(`/api/public/cities/${encodeURIComponent(slug)}`);
  if (!url) {
    return NextResponse.json({ success: false, message: "URL inválida." }, { status: 500 });
  }

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
    const text = await res.text();
    let json: { success?: boolean; data?: TerritorialPayload };
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ success: false, message: "Resposta inválida." }, { status: 502 });
    }

    const c = json?.data?.city;
    const city = toCityRef({
      id: c?.id,
      slug: c?.slug,
      name: c?.name,
      state: c?.state,
    });

    if (!city) {
      return NextResponse.json(
        { success: false, message: "Cidade não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: city });
  } catch {
    return NextResponse.json(
      { success: false, message: "Falha ao resolver cidade." },
      { status: 502 }
    );
  }
}
