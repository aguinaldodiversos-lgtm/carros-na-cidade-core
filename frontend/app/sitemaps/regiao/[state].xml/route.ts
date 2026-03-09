// frontend/app/sitemaps/regiao/[state].xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";

export const revalidate = 3600; // 1h

type RouteContext = {
  params: { state: string };
};

// Pequeno helper para retornar XML sempre (inclusive em erro)
function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(_req: Request, ctx: RouteContext) {
  const stateRaw = ctx?.params?.state ?? "";
  const normalizedState = String(stateRaw).trim().toUpperCase();

  // Se vier inválido, não explode build/prerender: responde um sitemap vazio (200)
  // (evita o erro: "Cannot destructure property 'state' ... undefined")
  if (!normalizedState || normalizedState.length !== 2) {
    return xmlResponse(buildSitemapXml([]));
  }

  try {
    const entries = await fetchPublicSitemapByRegion(normalizedState, 50000);
    const xml = buildSitemapXml(entries);
    return xmlResponse(xml, 200);
  } catch {
    // Falha de fetch (ex: API offline durante build) → não quebra build
    // Retornamos sitemap vazio (200) para manter o deploy saudável.
    return xmlResponse(buildSitemapXml([]), 200);
  }
}
