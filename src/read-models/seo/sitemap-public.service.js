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

/**
 * TODAS as entradas territoriais, sem recorte de UF.
 *
 * É a composição das quatro famílias que nascem do ESTOQUE ATIVO. Existe para
 * ter UM dono da pergunta "quais URLs territoriais existem hoje?" — antes essa
 * resposta estava duplicada dentro de `getPublicSitemapByRegion`, e o sitemap
 * canônico (`/api/public/seo/sitemap.{json,xml}`) tinha uma TERCEIRA resposta
 * própria, lida de `seo_cluster_plans` (tabela de PLANEJAMENTO, sem validação
 * de estoque). Foi por isso que o endpoint canônico publicava
 * `/carros-em/braganca-paulista-sp` com Bragança em zero anúncios — URL que o
 * gate territorial responde 404 (auditoria SEO Fase 4, 2026-08-31).
 *
 * Quem precisar de um recorte (por UF, por tipo) deve FILTRAR o resultado
 * desta função, nunca escrever uma consulta nova: uma segunda implementação de
 * "esta URL existe?" é exatamente o que produziu a divergência.
 */
export async function getPublicSitemapAllTypes(limit = 50000) {
  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const [cities, belowFipe, brands, models] = await Promise.all([
    listActiveCityEntries(safeLimit),
    listActiveCityBelowFipeEntries(safeLimit),
    listActiveCityBrandEntries(safeLimit),
    listActiveCityBrandModelEntries(safeLimit),
  ]);

  return [...cities, ...belowFipe, ...brands, ...models].slice(0, safeLimit);
}

/**
 * Sitemap REGIONAL: o recorte por UF das MESMAS entradas territoriais.
 *
 * ── O bug que isto corrige (auditoria 2026-08-07) ────────────────────────────
 * Esta função era a última sobrevivente do caminho antigo: lia
 * `seo_cluster_plans` via `listSitemapByRegion`, uma tabela de PLANEJAMENTO que
 * não sabe nada sobre estoque. A correção de 2026-07-04/05 migrou `city_home`,
 * `city_below_fipe`, `city_brand` e `city_brand_model` para o estoque ativo
 * real — e deixou a regional para trás.
 *
 * O resultado medido: `/sitemaps/regiao/sp.xml` anunciava
 * `/carros-em/braganca-paulista-sp` e `/carros-baratos-em/braganca-paulista-sp`
 * com Bragança em ZERO anúncios ativos. As duas URLs respondem 404 — o gate
 * territorial faz o certo, e o sitemap contradizia a própria aplicação.
 *
 * Note a ironia: o comentário de `CITY_BELOW_FIPE` acima já cita Bragança pelo
 * nome como o caso que motivou aquela correção. O mesmo defeito continuou vivo
 * a um `if` de distância.
 *
 * ── Por que compor, e não escrever uma query nova ────────────────────────────
 * A regra territorial precisa ter UM dono. Uma query regional própria seria uma
 * segunda implementação de "esta cidade existe?" — exatamente o que produziu a
 * divergência. Aqui a regional é, por construção, um SUBCONJUNTO do que os
 * outros sitemaps publicam: impossível ela publicar algo que eles recusariam.
 *
 * O custo é reusar quatro consultas já cacheadas em vez de uma sob medida.
 * Aceitável: sitemap não é caminho quente, e correção vale mais que uma query.
 */
export async function getPublicSitemapByRegion(state, limit = 50000) {
  const uf = String(state || "")
    .trim()
    .toUpperCase();
  if (!uf) return [];

  const safeLimit = Math.min(100000, Math.max(1, Number(limit) || 50000));

  const entries = await getPublicSitemapAllTypes(safeLimit);

  return entries
    .filter((entry) => String(entry.state || "").toUpperCase() === uf)
    .slice(0, safeLimit);
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
