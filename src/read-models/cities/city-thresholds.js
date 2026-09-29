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
// Landing por modelo COMERCIAL: âncora local de 1 anúncio. Não deriva do
// limiar de cidade de propósito — ver "POR QUE CADA VALOR" abaixo.
const DEFAULT_MODEL_INDEX_MIN_ADS = 1;

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

   Os limiares derivam de `getCityIndexMinAds()` (env CITY_INDEX_MIN_ADS /
   SITEMAP_MIN_ADS) para que o operador continue ajustando UM número no
   Render e a hierarquia se mova junto — EXCETO `model`, fixo em 1
   (DEFAULT_MODEL_INDEX_MIN_ADS), que não acompanha a env.

   POR QUE CADA VALOR:

     city   = base (3)   Já era o limiar de indexação de cidade e está
                         validado em produção. É a unidade de referência.

     brand  = base (3)   Mesma intenção-raiz da cidade, só que recortada
                         ("carros Chevrolet em Atibaia"). Manter igual à
                         cidade evita o caso incoerente "cidade indexa com
                         3, marca com 3 dos mesmos 3 anúncios não indexa".

     model  = 1          Landing por modelo COMERCIAL ("Renegade em
                         Atibaia"). É a intenção MAIS específica com volume
                         de busca real: quem busca "comprar jeep renegade em
                         atibaia" quer aquele carro, e 1 Renegade na cidade
                         responde melhor que o catálogo geral com dezenas de
                         outros modelos. O 1 é ÂNCORA LOCAL: com o motor
                         servindo, DEC-30 continua exigindo local >= 1
                         (estoque só nas vizinhas não indexa), e o motor
                         segue livre para completar a listagem com o mesmo
                         modelo no território.

     modelFipeLegacy     URL antiga por descrição FIPE
            = base (3)   (`/modelo/onix-hatch-lt-1-0-12v-flex-5p-mec`).
                         Continua resolvendo (sem 404, sem redirect), é
                         servida pelo legado, tem canonical própria e NUNCA
                         entra no sitemap. Cada versão FIPE isolada tem 1-2
                         anúncios: o limiar base é o que a mantém noindex e
                         impede que duplique a landing comercial. Por isso
                         NÃO acompanha `model` — são superfícies diferentes,
                         e a escolha entre as duas sai da taxonomia já
                         resolvida (`seoSurfaceForModelTaxonomy`), nunca do
                         texto ou do slug.

     category = base+1   Carroceria/câmbio/faixa de preço são recortes
                (4)      TRANSVERSAIS: o mesmo carro aparece em vários. Uma
                         página "SUV em X" com 3 anúncios repete quase
                         inteiramente a página da cidade. Exigir um a mais
                         é o mínimo para a página ter conteúdo próprio.
                         Não é um número mágico — é "estritamente mais
                         exigente que a cidade", derivado, não copiado.

   Fase 3: nenhum limiar foi reduzido; `category` nasceu mais estrito.
   Depois: `model` (comercial) caiu de base para 1, com `modelFipeLegacy`
   separado em base para que a URL FIPE antiga não mude de comportamento.
   ───────────────────────────────────────────────────────────────────────── */

/** Famílias de superfície com regra de qualificação própria. */
export const SEO_SURFACE = Object.freeze({
  CITY: "city",
  BRAND: "brand",
  MODEL: "model",
  MODEL_FIPE_LEGACY: "modelFipeLegacy",
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
    [SEO_SURFACE.MODEL]: DEFAULT_MODEL_INDEX_MIN_ADS,
    [SEO_SURFACE.MODEL_FIPE_LEGACY]: base,
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
 * Taxonomia de modelo (`matchModelRowsBySlug` / `resolveCityModel`) → família
 * SEO. É o ÚNICO lugar que decide "modelo comercial ou URL FIPE antiga" para
 * fins de limiar: consumidores chamam
 * `getSeoThreshold(seoSurfaceForModelTaxonomy(taxonomy))` em vez de recomparar
 * a taxonomia.
 *
 *   commercial  landing por modelo comercial                 → model
 *   none        cidade sem o modelo (rótulo do dicionário     → model
 *               nacional ou nada a listar; local = 0, então
 *               DEC-30 já nega por âncora/estoque)
 *   fipe        URL antiga por descrição FIPE                → modelFipeLegacy
 *
 * Taxonomia desconhecida ou ausente cai na família MAIS estrita (fail-closed):
 * um valor novo nunca indexa com o limiar baixo por acidente.
 */
const MODEL_TAXONOMY_SURFACE = Object.freeze({
  commercial: SEO_SURFACE.MODEL,
  none: SEO_SURFACE.MODEL,
  fipe: SEO_SURFACE.MODEL_FIPE_LEGACY,
});

export function seoSurfaceForModelTaxonomy(taxonomy) {
  return Object.prototype.hasOwnProperty.call(MODEL_TAXONOMY_SURFACE, taxonomy)
    ? MODEL_TAXONOMY_SURFACE[taxonomy]
    : SEO_SURFACE.MODEL_FIPE_LEGACY;
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

export const __testing = {
  DEFAULT_INDEX_MIN_ADS,
  DEFAULT_EXISTS_MIN_ADS,
  DEFAULT_MODEL_INDEX_MIN_ADS,
};
