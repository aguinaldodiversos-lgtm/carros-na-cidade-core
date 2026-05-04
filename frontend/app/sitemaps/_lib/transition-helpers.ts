/**
 * Helpers de transição usados pelos `route.ts` dos sitemaps territoriais.
 *
 * Por que num módulo separado, e não direto no route.ts?
 * Em Next 14 App Router, `app/.../route.ts` só pode exportar:
 *   - handlers HTTP (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD);
 *   - configurações reconhecidas (dynamic, revalidate, runtime,
 *     dynamicParams, preferredRegion, maxDuration, fetchCache).
 *
 * Exportar qualquer outra coisa quebra o build com:
 *   "Type error: Route ... does not match the required types of a Next.js Route.
 *    '<helperName>' is not a valid Route export field."
 *
 * Este módulo vive em `_lib/` — pastas prefixadas com `_` são "private folders"
 * pelo App Router e ignoradas como rota (não viram URL). Convenção oficial Next:
 * https://nextjs.org/docs/app/building-your-application/routing/colocation#private-folders.
 *
 * Os 3 helpers abaixo continuam testáveis a partir de
 * `frontend/app/sitemaps/sitemap-transition.test.ts`.
 */

import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";

/**
 * Política de canonical de transição para sitemap de cidades:
 *
 * O backend (`seo_cluster_plans.path` para cluster_type='city_home') ainda
 * grava paths no formato /cidade/[slug]. A página /cidade/[slug] foi
 * deduplicada para canonicalizar em /comprar/cidade/[slug] (canônica
 * intermediária do catálogo). Sitemap deve refletir a canônica — caso
 * contrário Googlebot indexa a URL antiga e gasta crawl budget.
 *
 * Esta função reescreve apenas paths que casam exatamente com /cidade/[slug]
 * (sem subrotas como /marca/, /modelo/, /oportunidades/, /abaixo-da-fipe/).
 * Subrotas têm sua própria política e ficam intactas.
 *
 * (Comentário original migrado de cities.xml/route.ts. A política em si NÃO
 * mudou nesta correção — apenas movemos o helper de arquivo.)
 */
export function rewriteCityHomeEntries(entries: PublicSitemapEntry[]): PublicSitemapEntry[] {
  return entries.map((entry) => {
    if (!entry.loc) return entry;

    let path = entry.loc.trim();
    let prefix = "";

    if (path.includes("://")) {
      try {
        const url = new URL(path);
        prefix = `${url.protocol}//${url.host}`;
        path = url.pathname;
      } catch {
        return entry;
      }
    }

    const match = /^\/cidade\/([^/]+)\/?$/.exec(path);
    if (!match) return entry;

    const rewrittenPath = `/comprar/cidade/${match[1]}`;
    return { ...entry, loc: `${prefix}${rewrittenPath}` };
  });
}

/**
 * Política de canonical de transição para landings SEO local:
 *
 *   /carros-em/[slug]            → canonical /comprar/cidade/[slug]
 *   /carros-baratos-em/[slug]    → canonical /cidade/[slug]/abaixo-da-fipe
 *   /carros-automaticos-em/[slug]→ canonical /comprar/cidade/[slug] (+ noindex,follow)
 *
 * Como as 3 URLs canonicalizam para outra família, listá-las no sitemap
 * desperdiçaria crawl budget e poderia confundir Googlebot. Mantemos a
 * rota /sitemaps/local-seo.xml viva (referenciada no /sitemap.xml index)
 * mas o body fica como <urlset> vazio. Quando a fase de migração permitir
 * 301, esta rota pode ser removida do index e do disco.
 *
 * As páginas continuam acessíveis (sem 301) — só não estão no sitemap.
 *
 * (Comentário original migrado de local-seo.xml/route.ts.)
 */
export function buildLocalSeoTransitionEntries(): PublicSitemapEntry[] {
  return [];
}

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
 *
 * (Comentário original migrado de opportunities.xml/route.ts.)
 */
export function buildOpportunitiesTransitionEntries(): PublicSitemapEntry[] {
  return [];
}
