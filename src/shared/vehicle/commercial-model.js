// src/shared/vehicle/commercial-model.js
//
// MODELO COMERCIAL — a entidade que uma pessoa realmente busca ("Onix",
// "HB20", "T-Cross"), derivada da DESCRIÇÃO FIPE que o catálogo grava em
// `ads.model`.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE ESTA CAMADA EXISTE
// ────────────────────────────────────────────────────────────────────────────
// Auditoria de taxonomia (Fase 3, Etapa 2, 2026-08-07) sobre o inventário
// ativo de produção: 27/27 anúncios têm `ads.model` com espaço E com
// motorização (`\d\.\d`). Ou seja, `ads.model` NÃO guarda modelo comercial —
// guarda a descrição/versão FIPE inteira:
//
//     "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec."
//     "ONIX HATCH LT 1.0 12V Flex 5p Mec."
//     "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut."
//     "ONIX HATCH 1.0 12V Flex 5p Mec."
//
// Consequência direta: agrupar por `ads.model` fragmenta UM Chevrolet Onix com
// 6 anúncios em QUATRO clusters de 2/2/1/1 — todos abaixo do limiar de
// indexação. O sitemap de modelos fica vazio e as quatro URLs viram páginas
// magras noindex. A entidade "Onix em Atibaia" simplesmente não existe.
//
// Não há coluna estruturada para resolver isso: a tabela `ads` tem apenas
// `brand` e `model` (TEXT livre) — não há `version`, `fipe_code`, `fipe_brand`
// nem `fipe_model`. Ver `src/database/migrations/004_baseline_ads.sql`.
//
// ────────────────────────────────────────────────────────────────────────────
// ESCADA DE RESOLUÇÃO (nesta ordem — heurística é o ÚLTIMO degrau)
// ────────────────────────────────────────────────────────────────────────────
//   1. OVERRIDES  — mapa curado `marca::prefixo-slug` → rótulo. Vence tudo.
//   2. COMPOSTOS  — mapa curado de modelos comerciais multi-token do mercado
//                   brasileiro ("Corolla Cross", "Grand Siena"). Casado por
//                   prefixo de tokens, do mais longo para o mais curto.
//   3. HEURÍSTICA — primeiro token, com guardas. Documentada e testada contra
//                   os valores reais de produção (ver commercial-model.test.js).
//
// Os degraus 1 e 2 existem porque a heurística sozinha erra em dois casos
// REAIS e verificáveis:
//   • "5 Luxury 1.5 TB FWD" (Omoda) → primeiro token é "5". Um `split(" ")[0]`
//     produziria o modelo "5" e um H1 "Carros 5 usados em Atibaia".
//   • "Grand Siena ..." → produziria "Grand".
//
// ────────────────────────────────────────────────────────────────────────────
// CONTRATO
// ────────────────────────────────────────────────────────────────────────────
// `deriveCommercialModel` NUNCA inventa: quando não consegue decidir com
// segurança devolve `null`, e o anúncio simplesmente não entra nos módulos e
// sitemaps de modelo (continua descoberto pela cidade e pela marca). Falhar
// fechado é preferível a publicar uma entidade errada.
//
// Espelho byte-a-byte no frontend: `frontend/lib/vehicle/commercial-model.ts`
// (teste de sincronia por fixtures compartilhadas em
// `commercial-model.fixtures.js`). Se um lado derivar "onix" e o outro
// "onix-hatch", o link gerado num lado não resolve no outro.

import { brandModelSlug, canonicalBrandSlug, canonicalBrandLabel } from "../utils/slugify.js";

/**
 * Degrau 1 — overrides curados. Chave: `${brandSlug}::${primeiroTokenSlug}`.
 * Só entra aqui o que foi observado em dado real e não é resolvível pelos
 * degraus seguintes.
 *
 * "5 Luxury 1.5 TB FWD" da Omoda: o modelo comercial É numérico, e o mercado
 * sempre o nomeia com a marca junto ("Omoda 5"), igual a "Peugeot 208".
 */
const COMMERCIAL_MODEL_OVERRIDES = Object.freeze({
  "omoda::5": "Omoda 5",
});

/**
 * Degrau 2 — modelos comerciais compostos (mais de um token) do mercado
 * brasileiro. Sem este mapa a heurística cortaria no primeiro token e
 * produziria entidades erradas ("Grand", "Corolla" para um Corolla Cross).
 *
 * Casado por PREFIXO de tokens do texto FIPE, do mais longo para o mais curto.
 * Modelos com hífen ("T-Cross", "HR-V", "CR-V") NÃO precisam entrar: já são um
 * único token.
 */
const COMPOUND_COMMERCIAL_MODELS = Object.freeze([
  "Corolla Cross",
  "Grand Siena",
  "Grand Cherokee",
  "Range Rover Evoque",
  "Range Rover Sport",
  "Range Rover Velar",
  "Discovery Sport",
  "Nova Saveiro",
  "Novo Uno",
  "Up Cross",
  "Golf Variant",
  "Jetta Variant",
  "Passat Variant",
  "Master Furgão",
  "Kangoo Express",
  "Express Furgão",
]);

/**
 * Tokens que NUNCA fazem parte do nome comercial — se o primeiro token bater
 * com um destes, a descrição é anômala e devolvemos `null` em vez de chutar.
 *
 * Cobre motorização (`1.0`, `1.6`), válvulas (`12V`), portas (`5p`, `4p.`),
 * tração (`4x2`, `FWD`), sobrealimentação/injeção (`TB`, `TSI`, `MSI`),
 * combustível e câmbio.
 */
const DISPLACEMENT_RE = /^\d+[.,]\d+$/;
const VALVES_RE = /^\d+v$/i;
const DOORS_RE = /^\d+p\.?$/i;
const STOP_TOKENS = new Set([
  "4x2",
  "4x4",
  "awd",
  "fwd",
  "rwd",
  "tb",
  "tsi",
  "thp",
  "msi",
  "mpi",
  "gdi",
  "turbo",
  "flex",
  "flexone",
  "gasolina",
  "alcool",
  "álcool",
  "etanol",
  "diesel",
  "eletrico",
  "elétrico",
  "hibrido",
  "híbrido",
  "gnv",
  "aut",
  "aut.",
  "mec",
  "mec.",
  "manual",
  "automatico",
  "automático",
  "cvt",
  "cs",
  "cd",
]);

function isStopToken(token) {
  const t = String(token || "").toLowerCase();
  if (!t) return true;
  if (DISPLACEMENT_RE.test(t)) return true;
  if (VALVES_RE.test(t)) return true;
  if (DOORS_RE.test(t)) return true;
  return STOP_TOKENS.has(t);
}

/**
 * Caixa de exibição do token de modelo.
 *
 * A FIPE alterna grafias ("ONIX", "Polo", "KWID", "VIRTUS"). Title-case
 * resolve as siglas em caixa alta, mas destruiria identificadores que contêm
 * dígito ou hífen — "HB20" viraria "Hb20" e "HR-V" viraria "Hr-v". Então:
 * token com dígito ou hífen é PRESERVADO como veio.
 */
function displayCaseToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return "";
  if (/[0-9-]/.test(raw)) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function tokenize(value) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Deriva o MODELO COMERCIAL a partir da descrição FIPE.
 *
 * @param {string|null|undefined} rawModel valor cru de `ads.model`
 * @param {{ brand?: string|null }} [options] marca crua (`ads.brand`) — usada
 *   pelos overrides e pelo caso de modelo numérico
 * @returns {{ label: string, slug: string, source: "override"|"compound"|"derived" } | null}
 *   `null` quando não é seguro decidir.
 */
export function deriveCommercialModel(rawModel, options = {}) {
  const tokens = tokenize(rawModel);
  if (tokens.length === 0) return null;

  const brandSlug = canonicalBrandSlug(options.brand);

  // Degrau 1 — override curado por marca + primeiro token.
  const overrideKey = `${brandSlug}::${brandModelSlug(tokens[0])}`;
  const override = COMMERCIAL_MODEL_OVERRIDES[overrideKey];
  if (override) {
    return { label: override, slug: brandModelSlug(override), source: "override" };
  }

  // Degrau 2 — composto conhecido, casado por prefixo (mais longo primeiro).
  const compound = matchCompound(tokens);
  if (compound) {
    return { label: compound, slug: brandModelSlug(compound), source: "compound" };
  }

  // Degrau 3 — heurística guardada: primeiro token.
  const head = tokens[0];
  if (isStopToken(head)) return null;

  // Modelo puramente numérico ("208", "500", "5"): sozinho não é entidade
  // buscável nem rótulo legível. Só é aceito com a marca na frente, que é
  // exatamente como o mercado o nomeia. Sem marca resolvida → null.
  if (/^\d+$/.test(head)) {
    const brandLabel = canonicalBrandLabel(options.brand);
    if (!brandLabel) return null;
    const label = `${brandLabel} ${head}`;
    return { label, slug: brandModelSlug(label), source: "derived" };
  }

  const label = displayCaseToken(head);
  const slug = brandModelSlug(label);
  if (!slug) return null;

  return { label, slug, source: "derived" };
}

function matchCompound(tokens) {
  const lowered = tokens.map((t) => t.toLowerCase());
  const candidates = [...COMPOUND_COMMERCIAL_MODELS].sort(
    (a, b) => tokenize(b).length - tokenize(a).length
  );

  for (const candidate of candidates) {
    const parts = tokenize(candidate).map((t) => t.toLowerCase());
    if (parts.length > lowered.length) continue;
    if (parts.every((part, i) => part === lowered[i])) return candidate;
  }

  return null;
}

/** Só o slug (conveniência para agregações). `""` quando não derivável. */
export function commercialModelSlug(rawModel, options = {}) {
  return deriveCommercialModel(rawModel, options)?.slug ?? "";
}

/** Só o rótulo (conveniência para exibição). `""` quando não derivável. */
export function commercialModelLabel(rawModel, options = {}) {
  return deriveCommercialModel(rawModel, options)?.label ?? "";
}

export const __testing = Object.freeze({
  COMMERCIAL_MODEL_OVERRIDES,
  COMPOUND_COMMERCIAL_MODELS,
  isStopToken,
  displayCaseToken,
});
