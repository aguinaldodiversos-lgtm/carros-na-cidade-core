// src/read-models/cities/city-thresholds.js
//
// Os DOIS limiares do invariante territorial. Antes era um número só
// (`SITEMAP_MIN_ADS`) governando duas perguntas diferentes — e essa confusão
// era o bug.
//
//   EXISTIR  (404 vs 200)  → é sobre o ANUNCIANTE.
//     Ele publicou naquela cidade, logo a cidade existe: a página é a vitrine
//     territorial dele. UM anúncio basta. Ver
//     `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
//
//   INDEXAR  (index vs noindex + sitemap) → é sobre o GOOGLE.
//     Página com 1-2 carros é magra e não deve disputar índice. O limiar 3 já
//     existia e está correto — só estava sendo usado para decidir a pergunta
//     errada.
//
// Por que os dois não podem ser o mesmo número: com um limiar único em 3, uma
// cidade com 1-2 anúncios ativos daria 404 e os anúncios dela ficariam órfãos
// — `/veiculo/<slug>` continua 200, mas nenhuma página de cidade linka para
// ele. O anunciante publica e o carro some da navegação.

const DEFAULT_INDEX_MIN_ADS = 3;
const DEFAULT_EXISTS_MIN_ADS = 1;

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

/**
 * Limiar de INDEXAÇÃO: `>= N` anúncios ativos para entrar no índice e no
 * sitemap. Abaixo → `noindex, follow` e fora do sitemap.
 *
 * Lê `CITY_INDEX_MIN_ADS` e cai em `SITEMAP_MIN_ADS` (nome antigo) para não
 * perder o valor já configurado no dashboard do Render — a config de lá não é
 * versionada, então renomear sem fallback mudaria o comportamento em silêncio.
 */
export function getCityIndexMinAds() {
  const renamed = process.env.CITY_INDEX_MIN_ADS;
  if (renamed != null && String(renamed).trim() !== "") {
    return parsePositiveInt(renamed, DEFAULT_INDEX_MIN_ADS);
  }
  return parsePositiveInt(process.env.SITEMAP_MIN_ADS, DEFAULT_INDEX_MIN_ADS);
}

/**
 * Limiar de EXISTÊNCIA: `>= N` anúncios ativos para a cidade responder 200.
 * Abaixo → 404 real.
 *
 * O default é 1 e a intenção é que continue 1 — o número fica explícito e
 * configurável só para que apareça ao lado do outro na auditoria de env, em
 * vez de virar um `>= 1` implícito perdido dentro de uma query.
 */
export function getCityExistsMinAds() {
  return parsePositiveInt(process.env.CITY_EXISTS_MIN_ADS, DEFAULT_EXISTS_MIN_ADS);
}

/* ─────────────────────────────────────────────────────────────────────────
   POLÍTICA CENTRAL DE QUALIFICAÇÃO SEO (Fase 3)
   ─────────────────────────────────────────────────────────────────────────
   Uma superfície territorial só vira landing indexável quando o estoque
   ativo sustenta a intenção. Antes desta fase o número 3 vivia espalhado
   (`getSitemapMinAds()` chamado direto em cada rota). Agora existe UMA
   função que responde "esta família qualifica?" — e os motivos de cada
   valor ficam escritos aqui, não descobertos por grep.

   Todos os limiares derivam de `getCityIndexMinAds()` (env
   CITY_INDEX_MIN_ADS / SITEMAP_MIN_ADS) para que o operador continue
   ajustando UM número no Render e a hierarquia se mova junto.

   POR QUE CADA VALOR:

     city   = base (3)   Já era o limiar de indexação de cidade e está
                         validado em produção. É a unidade de referência.

     brand  = base (3)   Mesma intenção-raiz da cidade, só que recortada
                         ("carros Chevrolet em Atibaia"). Manter igual à
                         cidade evita o caso incoerente "cidade indexa com
                         3, marca com 3 dos mesmos 3 anúncios não indexa".

     model  = base (3)   O modelo é a intenção MAIS específica que ainda tem
                         volume de busca real ("Onix usado em Atibaia").
                         Com a taxonomia corrigida, 3 anúncios do mesmo
                         modelo comercial já formam uma página comparável.

     category = base+1   Carroceria/câmbio/faixa de preço são recortes
                (4)      TRANSVERSAIS: o mesmo carro aparece em vários. Uma
                         página "SUV em X" com 3 anúncios repete quase
                         inteiramente a página da cidade. Exigir um a mais
                         é o mínimo para a página ter conteúdo próprio.
                         Não é um número mágico — é "estritamente mais
                         exigente que a cidade", derivado, não copiado.

   NENHUM limiar foi REDUZIDO nesta fase. `category` é novo e mais estrito.
   ───────────────────────────────────────────────────────────────────────── */

/** Famílias de superfície com regra de qualificação própria. */
export const SEO_SURFACE = Object.freeze({
  CITY: "city",
  BRAND: "brand",
  MODEL: "model",
  BODY_TYPE: "bodyType",
  TRANSMISSION: "transmission",
  PRICE_RANGE: "priceRange",
});

/**
 * Limiares por família, derivados do limiar de indexação de cidade.
 * @returns {Record<string, number>}
 */
export function getSeoInventoryThresholds() {
  const base = getCityIndexMinAds();
  const transversal = base + 1;

  return {
    [SEO_SURFACE.CITY]: base,
    [SEO_SURFACE.BRAND]: base,
    [SEO_SURFACE.MODEL]: base,
    [SEO_SURFACE.BODY_TYPE]: transversal,
    [SEO_SURFACE.TRANSMISSION]: transversal,
    [SEO_SURFACE.PRICE_RANGE]: transversal,
  };
}

/** Limiar de UMA família. Família desconhecida cai no limiar da cidade. */
export function getSeoThreshold(surface) {
  const thresholds = getSeoInventoryThresholds();
  return thresholds[surface] ?? thresholds[SEO_SURFACE.CITY];
}

/**
 * Uma superfície qualifica para indexação + sitemap + link interno de malha?
 *
 * Esta é a pergunta única. Quem precisa decidir "posso linkar/sitemapar/
 * indexar isso?" chama aqui em vez de recomparar `>= 3` no lugar.
 */
export function qualifiesForSeoSurface(surface, activeCount) {
  const count = Number(activeCount);
  if (!Number.isFinite(count) || count < 0) return false;
  return count >= getSeoThreshold(surface);
}

export const __testing = { DEFAULT_INDEX_MIN_ADS, DEFAULT_EXISTS_MIN_ADS };
