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

import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import type { PublicSitemapEntry } from "@/lib/seo/sitemap-client";

/**
 * Política de canonical de transição para sitemap de cidades:
 *
 * Um backend em versão antiga pode gravar `seo_cluster_plans.path` no formato
 * legado /cidade/[slug]. O sitemap não pode publicar esse path: ele não é a
 * canônica, e URL que não é destino final gasta crawl budget e confunde o
 * sinal — o problema que esta correção inteira existe para resolver.
 *
 * O destino é `/carros-em/[slug]`, a canônica única (antes esta função
 * reescrevia para `/comprar/cidade/[slug]`, que agora é 308: o sitemap estaria
 * publicando redirects). `getCanonicalCityPath` é a mesma função que monta os
 * links internos, então sitemap e navegação não podem divergir.
 *
 * Reescreve apenas paths que casam exatamente com /cidade/[slug] (sem subrotas
 * como /marca/, /modelo/, /oportunidades/, /abaixo-da-fipe/). Subrotas têm
 * política própria e ficam intactas. Slug que não é cidade válida é DESCARTADO
 * — sitemap com URL inválida é pior que sitemap menor.
 */
export function rewriteCityHomeEntries(entries: PublicSitemapEntry[]): PublicSitemapEntry[] {
  const out: PublicSitemapEntry[] = [];

  for (const entry of entries) {
    if (!entry.loc) {
      out.push(entry);
      continue;
    }

    let path = entry.loc.trim();
    let prefix = "";

    if (path.includes("://")) {
      try {
        const url = new URL(path);
        prefix = `${url.protocol}//${url.host}`;
        path = url.pathname;
      } catch {
        out.push(entry);
        continue;
      }
    }

    const match = /^\/cidade\/([^/]+)\/?$/.exec(path);
    if (!match) {
      out.push(entry);
      continue;
    }

    const canonical = getCanonicalCityPath(match[1]);
    if (!canonical) continue;

    out.push({ ...entry, loc: `${prefix}${canonical}` });
  }

  return out;
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
