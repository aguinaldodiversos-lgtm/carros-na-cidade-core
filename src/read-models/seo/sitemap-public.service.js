import * as sitemapPublicRepository from "./sitemap-public.repository.js";
import { CLUSTER_TYPES } from "../../modules/seo/constants/seo-status.js";
import {
  listActiveCityEntries,
  listActiveCityBelowFipeEntries,
  listActiveCityBrandEntries,
  listActiveCityBrandModelEntries,
} from "./territorial-inventory-sitemap.service.js";
import { listActiveAdRows } from "./sitemap-ads.repository.js";

function mapSitemapEntry(entry) {
  return {
    loc: entry.path,
    lastmod: entry.updated_at,
    priority: entry.priority,
    clusterType: entry.cluster_type,
    stage: entry.stage,
    moneyPage: entry.money_page,
    state: entry.state,
  };
}

export async function getPublicSitemapByType(type, limit = 50000) {
  // Cidade/marca/modelo passam a ser geradas a partir do ESTOQUE ATIVO real
  // (tabela `ads`), não de `seo_cluster_plans` (que não valida estoque e podia
  // listar combinações vazias). Regra unificada (auditoria SEO 2026-07-04): só
  // entram URLs com >= SITEMAP_MIN_ADS anúncios ativos — o MESMO limiar da
  // indexação. A cidade usa a URL CANÔNICA `/carros-em/[slug]` (nunca `/cidade`
  // nem `/comprar/cidade`). `lastmod` = MAX(ads.updated_at). Demais tipos
  // (below_fipe, opportunities…) seguem via cluster plans.
  if (type === CLUSTER_TYPES.CITY_HOME) {
    return listActiveCityEntries(limit);
  }
  if (type === CLUSTER_TYPES.CITY_BELOW_FIPE) {
    // Correção 2026-07-05: below-fipe também por ESTOQUE ATIVO real (só cidades
    // com >= SITEMAP_MIN_ADS anúncios abaixo da FIPE), URL canônica
    // /carros-baratos-em/[slug]. Antes vinha de seo_cluster_plans sem filtro e
    // listava cidades sem estoque (ex.: Bragança Paulista com 0).
    return listActiveCityBelowFipeEntries(limit);
  }
  if (type === CLUSTER_TYPES.CITY_BRAND) {
    return listActiveCityBrandEntries(limit);
  }
  if (type === CLUSTER_TYPES.CITY_BRAND_MODEL) {
    return listActiveCityBrandModelEntries(limit);
  }

  const entries = await sitemapPublicRepository.listSitemapByType(type, limit);
  return entries.map(mapSitemapEntry);
}

export async function getPublicSitemapByRegion(state, limit = 50000) {
  const entries = await sitemapPublicRepository.listSitemapByRegion(state, limit);
  return entries.map(mapSitemapEntry);
}

/**
 * Sitemap de VEÍCULOS: uma URL `/veiculo/[slug]` por anúncio ATIVO. Emite o
 * `ads.slug` armazenado (casa com o lookup de `/veiculo/[slug]`), `lastmod` =
 * `ads.updated_at`. Não vem de `seo_cluster_plans` (que é só landings).
 */
/**
 * Limite do protocolo: 1.000 `<image:image>` por `<url>`. O estoque atual tem
 * 9 fotos por anúncio, então o teto nunca é atingido — o cap existe para o dia
 * em que alguém subir um álbum absurdo e estourar o XML.
 */
const MAX_IMAGES_POR_URL = 1000;

/**
 * Aceita só imagem que o Googlebot consiga REALMENTE rastrear.
 *
 * O caminho de resolução de imagem termina em `/api/vehicle-images?key=` como
 * fallback quando `R2_PUBLIC_BASE_URL` está vazia (ver ads.public-images.js).
 * Esse prefixo é `Disallow` no robots.txt — publicar essas URLs no sitemap
 * seria pedir ao Google que rastreie o que proibimos: ruído no GSC, pior que
 * não ter sitemap de imagens.
 *
 * Descarta em silêncio na saída, mas registra no log (ver o console.error no
 * caller): sitemap não pode quebrar, mas o descarte também não pode sumir.
 */
function isCrawlableImageUrl(value) {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url) return false;
  // Relativa (inclui `/api/vehicle-images?key=` e `/uploads/...`): não é
  // rastreável como imagem absoluta e não entra.
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    // Defesa extra: mesmo absoluta, se apontar para /api/ está sob Disallow.
    if (parsed.pathname.startsWith("/api/")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function getPublicVehicleSitemap(limit = 50000) {
  const rows = await listActiveAdRows(limit);

  let descartadas = 0;

  const entries = rows.map((row) => {
    const raw = Array.isArray(row.images) ? row.images : [];
    // Ordem preservada: `ads.images[0]` é a capa (COMMENT da coluna), e o
    // Google trata a primeira como a mais representativa.
    const images = [];
    for (const candidate of raw) {
      if (isCrawlableImageUrl(candidate)) {
        if (images.length < MAX_IMAGES_POR_URL) images.push(String(candidate).trim());
      } else if (candidate) {
        descartadas += 1;
      }
    }

    return {
      loc: `/veiculo/${row.slug}`,
      lastmod: row.last_updated,
      changefreq: "weekly",
      priority: 0.6,
      // Ausente quando o anúncio não tem imagem elegível — o gerador de XML
      // simplesmente não emite as tags (sitemap sem imagem continua válido).
      ...(images.length > 0 ? { images } : {}),
    };
  });

  if (descartadas > 0) {
    // Sinal alto: quase sempre significa `R2_PUBLIC_BASE_URL` vazia, com a
    // resolução caindo no proxy `/api/vehicle-images?key=` que o robots
    // bloqueia. O sitemap sai válido (só sem essas imagens), mas isto tem que
    // aparecer no log em vez de sumir.
    console.error(
      `[sitemap-vehicles] ${descartadas} imagem(ns) descartada(s) por não serem rastreáveis ` +
        `(relativas ou sob /api/, que é Disallow no robots.txt). ` +
        `Verifique R2_PUBLIC_BASE_URL.`
    );
  }

  return entries;
}
