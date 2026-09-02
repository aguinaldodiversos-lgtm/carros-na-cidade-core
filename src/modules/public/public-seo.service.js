// src/modules/public/public-seo.service.js
//
// Entradas do sitemap CANÔNICO público (`/api/public/seo/sitemap`,
// `/sitemap.xml`, `/sitemap.json`).
//
// ── O que mudou (SEO Fase 4.1A, 2026-09-01) ──────────────────────────────────
// Este módulo lia `seo_cluster_plans LEFT JOIN seo_publications` — uma tabela
// de PLANEJAMENTO que não sabe nada sobre estoque. Medido em produção na
// auditoria da Fase 4 (2026-08-31):
//
//     GET /api/public/seo/sitemap.xml  →  200, 4 <url>, entre elas
//        /carros-em/braganca-paulista-sp           ← 404 no site
//        /carros-baratos-em/braganca-paulista-sp   ← 404 no site
//
// Bragança tem 3 anúncios, todos `deleted`, zero ativos. As linhas de
// `seo_publications` são artefatos de um bootstrap de 2026-05-27, quando ainda
// havia estoque; o pipeline que as escreve está desligado desde então e nada
// as arquivou quando o estoque zerou. Ou seja: um endpoint público afirmava a
// existência de URLs que a própria aplicação nega.
//
// Era o ÚLTIMO sobrevivente do caminho antigo. `getPublicSitemapByType` migrou
// para o estoque em 2026-07-04/05 e `getPublicSitemapByRegion` em 2026-08-07 —
// o canônico ficou para trás, e o comentário de `sitemap-public.repository.js`
// já registra que esse mesmo defeito voltou duas vezes por essa via.
//
// Agora a fonte é `getPublicSitemapAllTypes()`, a MESMA composição de estoque
// ativo que alimenta `/sitemaps/*.xml`. Não há consulta nova aqui: uma segunda
// implementação de "esta URL existe?" é justamente o que produziu a
// divergência. Cidade sem anúncio ativo não pode aparecer, por construção.
//
// ── O que NÃO mudou ──────────────────────────────────────────────────────────
// O contrato HTTP. As rotas continuam existindo, o `content-type`, os headers
// de cache/robots e o shape `{ loc, lastmod, changefreq, priority }` são os
// mesmos. `buildChangefreq`/`buildPriority` continuam derivando esses campos do
// `clusterType`, para que consumidores externos desconhecidos não vejam o
// formato mudar debaixo deles.
//
// Diferença de valor observável: `priority` de `city_below_fipe` cai de 0.9
// para 0.7. O 0.9 vinha de `seo_cluster_plans.money_page`, coluna que o
// pipeline de estoque não tem — e `priority` é uma dica que o Google ignora há
// anos. Preferimos perder o 0.9 a manter uma leitura da tabela congelada só
// para preservá-lo.

import {
  getPublicSitemapAllTypes,
  getPublicSitemapByRegion,
  getPublicSitemapByType,
} from "../../read-models/seo/sitemap-public.service.js";

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return 10000;
  return Math.max(1, Math.min(50000, Math.floor(n)));
}

function buildPriority(clusterType, moneyPage) {
  if (moneyPage) return 0.9;
  if (clusterType === "city_home") return 0.8;
  if (clusterType === "city_brand_model") return 0.7;
  if (clusterType === "city_brand") return 0.6;
  if (clusterType === "city_opportunities") return 0.7;
  if (clusterType === "city_below_fipe") return 0.7;
  return 0.5;
}

function buildChangefreq(clusterType) {
  if (clusterType === "city_home") return "daily";
  if (clusterType === "city_opportunities") return "daily";
  if (clusterType === "city_below_fipe") return "daily";
  return "weekly";
}

/**
 * Entrada do estoque → shape histórico deste endpoint.
 *
 * `stage`/`moneyPage` não existem no pipeline de estoque. Emitimos os defaults
 * que os consumidores já recebiam quando a coluna era nula, em vez de sumir
 * com os campos.
 */
function mapEntry(entry) {
  const clusterType = entry.clusterType || "unknown";

  return {
    loc: entry.loc,
    lastmod: entry.lastmod,
    changefreq: buildChangefreq(clusterType),
    priority: buildPriority(clusterType, false),
    clusterType,
    stage: entry.stage || "discovery",
    moneyPage: false,
    state: entry.state || null,
  };
}

export async function listPublicSitemapEntries({ limit = 10000 } = {}) {
  const entries = await getPublicSitemapAllTypes(clampLimit(limit));
  return entries.map(mapEntry);
}

export async function listPublicSitemapEntriesByType(type, { limit = 10000 } = {}) {
  const entries = await getPublicSitemapByType(type, clampLimit(limit));
  return entries.map(mapEntry);
}

export async function listPublicSitemapEntriesByRegion(state, { limit = 10000 } = {}) {
  const entries = await getPublicSitemapByRegion(state, clampLimit(limit));
  return entries.map(mapEntry);
}
