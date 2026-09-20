// src/modules/ads/search-policy/relaxation-policy.js
//
// Guided Relaxation — política pura da DEC-26 (v3 §9, certificada em
// 2026-09-20 sobre o baseline 6981b73d).
//
// Este módulo não toca no banco. Ele só sabe transformar um BOUNDARY REAL em
// concessão classificada, e ordenar concessões. A leitura do estoque fica em
// relaxations.js; a configuração, em policy-config.js.
//
// A sequência normativa é literal (DEC-26, "Arredondamento"):
//
//   boundary real
//     → arredondamento para cima pelo quantum da dimensão
//     → valor final aplicado / transportado na URL / exibido
//     → variação efetiva contra o limite ATUAL
//     → banda
//
// A banda sai do VALOR FINAL, nunca do boundary bruto. Quando o arredondamento
// cruza uma fronteira de banda, vale a banda do valor final — é essa a
// concessão que o usuário realmente aceita. Inverter os dois últimos passos
// produz um número honesto (o boundary) classificado como uma concessão que
// ninguém vai aplicar, e é exatamente o erro que a clarificação de 2026-09-20
// proibiu por escrito.
//
// O custo é uma BANDA ORDINAL, não peso contínuo: uma concessão de banda menor
// nunca perde para uma de banda maior por acrescentar mais resultados. O
// mapeamento numérico abaixo existe só para comparar bandas entre si.

export const COST_BAND = Object.freeze({
  SMALL: "PEQUENA",
  MEDIUM: "MEDIA",
  LARGE: "GRANDE",
});

/** Ordem das bandas. Uso exclusivo: comparação. Não é peso de score. */
export const COST_BAND_RANK = Object.freeze({
  [COST_BAND.SMALL]: 1,
  [COST_BAND.MEDIUM]: 2,
  [COST_BAND.LARGE]: 3,
});

/** Dimensões relaxáveis da DEC-26. Não há outras nesta versão da política. */
export const RELAXATION_DIMENSION = Object.freeze({
  PRICE: "price",
  YEAR: "year",
  MILEAGE: "mileage",
  RADIUS: "radius",
  TRANSMISSION: "transmission",
});

// Fronteiras percentuais comparadas com tolerância: (105000-100000)/100000 é
// 0.05 em ponto flutuante binário, mas nem toda razão equivalente cai no mesmo
// double. Sem a folga, um +5% exato podia virar MEDIA por um ULP.
const PCT_EPSILON = 1e-9;

/** Arredondamento para cima ao quantum (DEC-26). Quantum ausente → sem efeito. */
export function roundUpToQuantum(value, quantum) {
  const n = Number(value);
  const q = Number(quantum);
  if (!Number.isFinite(n)) return null;
  if (!Number.isFinite(q) || q <= 0) return n;
  return Math.ceil(n / q) * q;
}

/**
 * Banda por variação RELATIVA (preço). `current` é o limite atual; `final`, o
 * valor já arredondado que será aplicado.
 */
export function classifyRelativeBand(current, final, { small_max_pct, medium_max_pct }) {
  const base = Number(current);
  if (!Number.isFinite(base) || base <= 0) return COST_BAND.LARGE;
  const pct = (Number(final) - base) / base;
  if (pct <= Number(small_max_pct) + PCT_EPSILON) return COST_BAND.SMALL;
  if (pct <= Number(medium_max_pct) + PCT_EPSILON) return COST_BAND.MEDIUM;
  return COST_BAND.LARGE;
}

/**
 * Banda por variação ABSOLUTA (ano, quilometragem, distância). `delta` já é a
 * magnitude cedida, calculada sobre o valor final.
 */
export function classifyAbsoluteBand(delta, { small_max_delta, medium_max_delta }) {
  const d = Math.abs(Number(delta));
  if (!Number.isFinite(d)) return COST_BAND.LARGE;
  if (d <= Number(small_max_delta)) return COST_BAND.SMALL;
  if (d <= Number(medium_max_delta)) return COST_BAND.MEDIUM;
  return COST_BAND.LARGE;
}

/**
 * Cadeia completa de uma dimensão numérica com quantum: boundary → round up →
 * valor final → variação efetiva → banda.
 *
 * @param {object} args
 * @param {number} args.boundary  valor real lido do estoque (não arredondado)
 * @param {number} args.current   limite atual da busca
 * @param {number} [args.quantum] quantum de arredondamento (ausente = sem quantum)
 * @param {"up"|"down"} args.direction  "up" = o limite sobe (preço, km, raio);
 *                                      "down" = o limite desce (ano)
 * @param {object} args.bands     fronteiras da dimensão
 * @param {"relative"|"absolute"} args.scale  como a banda é medida
 * @param {number} [args.cap]     teto do valor final (só distância)
 * @returns {{ final:number, delta:number, cost_band:string }|null}
 */
export function resolveNumericConcession({
  boundary,
  current,
  quantum,
  direction = "up",
  bands,
  scale,
  cap = null,
}) {
  const raw = Number(boundary);
  const base = Number(current);
  if (!Number.isFinite(raw) || !Number.isFinite(base)) return null;

  // Arredondamento SEMPRE para cima a partir do boundary (DEC-26). Em "down"
  // (ano) não há quantum: o boundary já é o próprio ano real do estoque, e
  // arredondar um ano para cima o empurraria de volta para dentro do filtro,
  // excluindo o candidato que justificou a concessão.
  let final = direction === "down" ? raw : roundUpToQuantum(raw, quantum);
  if (final === null) return null;
  if (cap !== null && Number.isFinite(Number(cap))) final = Math.min(final, Number(cap));

  // O valor final tem de continuar incluindo o candidato que justificou a
  // concessão — é o que torna a concessão útil por construção.
  if (direction === "up" && final < raw) return null;
  if (direction === "down" && final > raw) return null;

  const delta = direction === "up" ? final - base : base - final;
  if (!(delta > 0)) return null;

  const cost_band =
    scale === "relative"
      ? classifyRelativeBand(base, final, bands)
      : classifyAbsoluteBand(delta, bands);
  return { final, delta, cost_band };
}

/**
 * Comparador determinístico único (DEC-26, "Ordenação"):
 *
 *   banda ASC → delta_result DESC → delta_seller DESC → delta_city DESC →
 *   priority_order ASC
 *
 * A banda vem primeiro e é categórica: `PEQUENA` com +1 vence `GRANDE` com
 * +50. O priority_order é só o último desempate e não pode superar banda nem
 * benefício.
 */
export function compareRelaxations(a, b, priorityOrder = []) {
  const bandA = COST_BAND_RANK[a.cost_band] ?? Number.MAX_SAFE_INTEGER;
  const bandB = COST_BAND_RANK[b.cost_band] ?? Number.MAX_SAFE_INTEGER;
  if (bandA !== bandB) return bandA - bandB;
  if (a.delta_result_count !== b.delta_result_count)
    return b.delta_result_count - a.delta_result_count;
  if (a.delta_seller_count !== b.delta_seller_count)
    return b.delta_seller_count - a.delta_seller_count;
  if (a.delta_city_count !== b.delta_city_count) return b.delta_city_count - a.delta_city_count;
  const ia = priorityOrder.indexOf(a.dimension);
  const ib = priorityOrder.indexOf(b.dimension);
  return (ia === -1 ? priorityOrder.length : ia) - (ib === -1 ? priorityOrder.length : ib);
}

/**
 * Elegibilidade + ordenação + corte. `delta_result_count` abaixo do mínimo é
 * ocultado (DEC-14/DEC-26): delta zero nunca é oferecido.
 */
export function rankRelaxations(
  candidates,
  { priority_order = [], min_delta = 1, max_options = 3 }
) {
  return [...candidates]
    .filter((c) => Number(c.delta_result_count) >= Number(min_delta))
    .sort((a, b) => compareRelaxations(a, b, priority_order))
    .slice(0, Number(max_options) || 0);
}
