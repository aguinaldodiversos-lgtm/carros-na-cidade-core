// frontend/lib/seo/sitemap-static.ts

import type { PublicSitemapEntry } from "./sitemap-client";

/**
 * URLs institucionais fixas do sitemap.
 *
 * ── Critério de entrada ──────────────────────────────────────────────────────
 * Uma URL só pode constar aqui se satisfizer TODAS as condições:
 *
 *   HTTP 200 · indexável · autocanônica · conteúdo final · sem redirect
 *
 * `/anuncios` saiu (auditoria 2026-08-06): respondia 200 canonicalizando para
 * `/comprar`, que por sua vez não era destino final — o sitemap anunciava ao
 * Googlebot uma URL cuja própria canonical apontava para outro lugar. Hoje é
 * 308 e redirect não entra em sitemap.
 *
 * `/comprar` FICOU, e só porque deixou de ser redirector: agora é a vitrine
 * nacional (200, H1 próprio, canonical autorreferente). Se voltasse a
 * redirecionar, teria de sair junto.
 *
 * ── lastmod ──────────────────────────────────────────────────────────────────
 * Não emitimos. A versão anterior carimbava `new Date()` em todas as URLs a
 * cada request: o sitemap afirmava, a cada leitura, que a página institucional
 * "Planos" tinha acabado de mudar. Um `lastmod` que muda sempre não é um dado —
 * é ruído que o Google aprende a ignorar, e junto com ele o `lastmod` das URLs
 * onde temos data de verdade (anúncios e posts levam `updated_at` real do
 * backend). Sem data confiável, omitir é a única leitura honesta.
 */
export function getStaticSitemapEntries(): PublicSitemapEntry[] {
  return [
    {
      loc: "/",
      changefreq: "daily",
      priority: 1,
    },
    {
      // Vitrine nacional — destino do 308 de `/anuncios` e página final da
      // intenção genérica "comprar carros".
      loc: "/comprar",
      changefreq: "daily",
      priority: 0.9,
    },
    {
      loc: "/blog",
      changefreq: "weekly",
      priority: 0.7,
    },
    {
      loc: "/planos",
      changefreq: "monthly",
      priority: 0.6,
    },
    // `/simulador-financiamento` removido do sitemap (SEO 2026-07-03): a rota
    // raiz só redireciona para `/simulador-financiamento/[cidade]`, que é
    // `noindex` (ferramenta interativa). URL noindex/redirect não pode constar
    // no sitemap.
    {
      loc: "/tabela-fipe",
      changefreq: "weekly",
      priority: 0.6,
    },
  ];
}
