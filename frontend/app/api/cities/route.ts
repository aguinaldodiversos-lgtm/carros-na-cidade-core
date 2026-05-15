import { NextResponse } from "next/server";

import { getBackendApiBaseUrl, resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lista cidades em destaque (mesma fonte da home pública).
 * GET /api/cities
 */
export async function GET() {
  const base = getBackendApiBaseUrl();
  if (!base) {
    return NextResponse.json(
      { success: false, message: "API não configurada.", data: [] },
      { status: 500 }
    );
  }

  const url = resolveInternalBackendApiUrl("/api/public/home");
  if (!url) {
    return NextResponse.json(
      { success: false, message: "URL inválida.", data: [] },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(url, {
      headers: { ...buildInternalBackendHeaders(), Accept: "application/json" },
      next: { revalidate: 120 },
    });

    const text = await res.text();
    let json: { success?: boolean; data?: { featuredCities?: unknown[] } };
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json({ success: true, data: [] });
    }

    const featured = json?.data?.featuredCities;
    const cities = Array.isArray(featured) ? featured : [];

    return NextResponse.json({
      success: true,
      data: cities,
    });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}
