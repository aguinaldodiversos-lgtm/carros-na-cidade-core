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

export const __testing = { DEFAULT_INDEX_MIN_ADS, DEFAULT_EXISTS_MIN_ADS };
