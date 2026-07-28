// frontend/app/sitemaps/regiao/[state].xml/route.ts
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../../_lib/sitemap-response";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(_req: Request, ctx: { params?: { state?: string } }) {
  const normalizedState = String(ctx?.params?.state ?? "")
    .trim()
    .toUpperCase();

  // UF ausente é entrada inválida, não falha de backend — mas serve vazio, e
  // vazio nunca recebe TTL longo (`ok:false` deixa isso explícito).
  if (!normalizedState) {
    return sitemapResponse({ entries: [], ok: false });
  }

  return sitemapResponse(await fetchPublicSitemapByRegion(normalizedState, 50000));
}
