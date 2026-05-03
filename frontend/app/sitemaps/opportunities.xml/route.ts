// frontend/app/sitemaps/opportunities.xml/route.ts
import { NextResponse } from "next/server";
import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";
import { buildSitemapXml } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Política de canonical de transição para "oportunidades" da cidade:
 *
 * /cidade/[slug]/oportunidades cobre a mesma intenção que
 * /cidade/[slug]/abaixo-da-fipe — ambas listam carros com preço abaixo da
 * tabela FIPE. Em transição, /oportunidades canonicaliza para /abaixo-da-fipe
 * (sem 301), e os anúncios `below_fipe` permanecem indexáveis na URL canônica.
 *
 * Este sitemap fica vazio para evitar publicar a duplicata. As URLs
 * /cidade/[slug]/abaixo-da-fipe continuam expostas no sitemaps/below-fipe.xml.
 */
export function buildOpportunitiesTransitionEntries(): PublicSitemapEntry[] {
  return [];
}

export async function GET() {
  const entries = buildOpportunitiesTransitionEntries();
  const xml = buildSitemapXml(entries);

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
