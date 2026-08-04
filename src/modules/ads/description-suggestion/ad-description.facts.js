/**
 * Ficha ESTRITA que alimenta a sugestão de descrição (Fase 4.5).
 *
 * Este módulo é a fronteira entre "o que o anunciante preencheu" e "o que o
 * modelo pode ver". Tudo que sai daqui é dado declarado; tudo que o cliente
 * mandou fora da allowlist é descartado em silêncio.
 *
 * Duas decisões que valem explicação:
 *
 * 1) PREÇO NÃO ENTRA — nem no schema de entrada. O briefing proíbe citar preço
 *    no texto, e a forma mais barata de garantir isso é o dado nunca existir
 *    deste lado. `price`, `fipeValue` e afins são ignorados mesmo se enviados.
 *
 * 2) CIDADE NÃO ENTRA. A ficha do parágrafo 1 é do veículo; localização já
 *    aparece no card do anúncio e citá-la no corpo só gera repetição entre
 *    anúncios da mesma praça.
 *
 * O módulo é PURO (sem I/O) para ser testável direto.
 */

import { VEHICLE_OPTIONS_CATALOG, normalizeVehicleOptions } from "../ad-options.catalog.js";

const OPTION_LABEL_BY_KEY = new Map(VEHICLE_OPTIONS_CATALOG.map((o) => [o.key, o.label]));

/** Câmbio e tração são ficha técnica: vão no parágrafo 1, não na lista de opcionais. */
const FICHA_OPTION_KEYS = Object.freeze([
  "cambio_manual",
  "cambio_automatico",
  "cambio_automatizado",
  "cambio_cvt",
  "tracao_dianteira",
  "tracao_traseira",
  "tracao_4x4",
  "tracao_integral_awd",
]);

/** "Acompanha o carro" — o briefing pede estes junto da ficha, não entre os opcionais. */
const AVULSO_OPTION_KEYS = Object.freeze([
  "manual_proprietario",
  "chave_reserva",
  "laudo_cautelar_aprovado",
]);

/**
 * Afirmações de CONDIÇÃO declaradas por checkbox.
 *
 * O briefing proíbe INVENTAR "único dono", "revisões em concessionária",
 * "pneus novos". Estes existem no catálogo como itens marcáveis — quando o
 * anunciante marca, deixa de ser invenção e vira dado declarado, que é o
 * ponto da feature. Ficam num balde próprio porque não são "opcional de
 * fábrica": o prompt os posiciona no parágrafo de contexto, não na lista.
 */
const CONDITION_OPTION_KEYS = Object.freeze([
  "unico_dono",
  "todas_revisoes_feitas",
  "revisoes_concessionaria",
  "pneus_novos",
  "motor_revisado",
  "suspensao_revisada",
  "baixo_consumo",
]);

/**
 * Itens marcáveis que mesmo assim NUNCA chegam ao modelo.
 *
 * `preco_competitivo_fipe` ("Preço competitivo em relação à FIPE") é um
 * opcional legítimo do catálogo, mas a proibição de citar preço/FIPE no texto
 * é incondicional no briefing — não há redação dele que não quebre a regra.
 * Suprimido na origem em vez de depender do guard.
 */
const SUPPRESSED_OPTION_KEYS = Object.freeze(["preco_competitivo_fipe"]);

const MAX_TEXT_FIELD = 80;
const CURRENT_YEAR = new Date().getFullYear();

/** Texto curto vindo do formulário: sem controle, sem markdown, sem cifrão, com teto. */
function cleanText(value, max = MAX_TEXT_FIELD) {
  if (value == null) return "";
  const flat = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>*_`#|]/g, " ")
    .replace(/R\$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.slice(0, max).trim();
}

function cleanYear(value) {
  const n = Number.parseInt(String(value ?? "").replace(/\D/g, ""), 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1900 || n > CURRENT_YEAR + 2) return null;
  return n;
}

/** "110000" | "110.000" | "110000 km" → 110000. Rejeita absurdos. */
function cleanMileage(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n < 0 || n > 2_000_000) return null;
  return n;
}

function formatMileage(km) {
  return `${km.toLocaleString("pt-BR")} km`;
}

function labelsFor(keys, selectedSet) {
  return keys.filter((k) => selectedSet.has(k)).map((k) => OPTION_LABEL_BY_KEY.get(k));
}

/**
 * Constrói a ficha e o vocabulário declarado.
 *
 * @param {object} payload corpo cru da requisição
 * @returns {{
 *   facts: object,
 *   selectedKeys: string[],
 *   declaredVocabulary: string[],
 *   isTooThin: boolean
 * }}
 *   `declaredVocabulary` é o conjunto de termos que TÊM permissão de aparecer
 *   na saída — o guard usa isso para mascarar antes de procurar item não
 *   declarado (senão "Ar-condicionado digital" marcado dispararia o alarme de
 *   "Ar-condicionado" não marcado, que é substring dele).
 */
export function buildDescriptionFacts(payload = {}) {
  const grouped = normalizeVehicleOptions(payload?.vehicleOptionKeys);
  const selectedKeys = Object.values(grouped)
    .flat()
    .filter((k) => !SUPPRESSED_OPTION_KEYS.includes(k));
  const selectedSet = new Set(selectedKeys);

  const bucketed = new Set([...FICHA_OPTION_KEYS, ...AVULSO_OPTION_KEYS, ...CONDITION_OPTION_KEYS]);

  const cambioLabels = labelsFor(
    FICHA_OPTION_KEYS.filter((k) => k.startsWith("cambio_")),
    selectedSet
  );
  const tracaoLabels = labelsFor(
    FICHA_OPTION_KEYS.filter((k) => k.startsWith("tracao_")),
    selectedSet
  );

  const byCategory = (category) =>
    (grouped[category] || [])
      .filter((k) => !bucketed.has(k) && selectedSet.has(k))
      .map((k) => OPTION_LABEL_BY_KEY.get(k));

  const yearModel = cleanYear(payload?.yearModel);
  const yearManufacture = cleanYear(payload?.yearManufacture);
  const mileage = cleanMileage(payload?.mileage);

  const ficha = {
    marca: cleanText(payload?.brandLabel ?? payload?.brand),
    modelo: cleanText(payload?.modelLabel ?? payload?.model),
    versao: cleanText(payload?.versionLabel ?? payload?.version),
    ano: yearModel,
    // Só informa ano de fabricação quando difere do modelo — senão o texto vira
    // "2017/2017", ruído que nenhum anúncio bom escreve.
    anoFabricacao:
      yearManufacture && yearModel && yearManufacture !== yearModel ? yearManufacture : null,
    quilometragem: mileage != null ? formatMileage(mileage) : null,
    cor: cleanText(payload?.color),
    combustivel: cleanText(payload?.fuel),
    carroceria: cleanText(payload?.bodyStyle),
    // `transmission` (campo do form) e `cambio_*` (opcional marcado) descrevem a
    // mesma coisa e são sincronizados no wizard por `syncCambioOptionKeys`.
    // Preferimos o opcional marcado; o campo é o fallback.
    cambio: cambioLabels[0] || cleanText(payload?.transmission) || null,
    tracao: tracaoLabels[0] || null,
    blindado: payload?.armored === true ? "Blindado" : null,
  };

  for (const key of Object.keys(ficha)) {
    if (!ficha[key]) delete ficha[key];
  }

  const facts = {
    ficha,
    itensAvulsos: labelsFor(AVULSO_OPTION_KEYS, selectedSet),
    seguranca: byCategory("safety"),
    conforto: byCategory("comfort"),
    dirigibilidade: byCategory("drivability"),
    condicaoDeclarada: labelsFor(CONDITION_OPTION_KEYS, selectedSet),
  };

  for (const key of [
    "itensAvulsos",
    "seguranca",
    "conforto",
    "dirigibilidade",
    "condicaoDeclarada",
  ]) {
    if (facts[key].length === 0) delete facts[key];
  }

  const declaredVocabulary = [
    ...selectedKeys.map((k) => OPTION_LABEL_BY_KEY.get(k)),
    ...Object.values(ficha),
  ]
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());

  // Ficha sem marca/modelo não rende texto honesto — nem vale gastar chamada.
  const isTooThin = !ficha.marca && !ficha.modelo;

  return { facts, selectedKeys, declaredVocabulary, isTooThin };
}

export const __testing = {
  FICHA_OPTION_KEYS,
  AVULSO_OPTION_KEYS,
  CONDITION_OPTION_KEYS,
  SUPPRESSED_OPTION_KEYS,
  OPTION_LABEL_BY_KEY,
};
