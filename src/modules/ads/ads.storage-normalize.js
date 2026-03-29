/**
 * Normalização de campos de veículo para persistência em `ads`.
 * Sinônimos: `BODY_TYPE_SYNONYMS`, `FUEL_SYNONYMS`, `TRANSMISSION_SYNONYMS`
 * em `./ads.canonical.constants.js` (reexportados em `filters/ads-free-query.constants.js`).
 */
import {
  BODY_TYPE_SYNONYMS,
  FUEL_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "./ads.canonical.constants.js";

function buildLookup(synonymsMap) {
  const map = new Map();
  for (const [slug, synonyms] of Object.entries(synonymsMap)) {
    map.set(slug.toLowerCase(), slug);
    for (const syn of synonyms) {
      map.set(String(syn).toLowerCase(), slug);
    }
  }
  return map;
}

const BODY_LOOKUP = buildLookup(BODY_TYPE_SYNONYMS);
const FUEL_LOOKUP = buildLookup(FUEL_SYNONYMS);
const TRANS_LOOKUP = buildLookup(TRANSMISSION_SYNONYMS);

function stripDiacritics(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function resolveFromLookup(lookup, raw) {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const key = trimmed.toLowerCase();
  if (lookup.has(key)) return lookup.get(key);

  const collapsed = stripDiacritics(key);
  if (lookup.has(collapsed)) return lookup.get(collapsed);

  return undefined;
}

/**
 * Heurística para textos compostos (FIPE / mercado BR) antes do lookup.
 * Retorna slug canônico ou null para seguir em frente com lookup/tokenização.
 */
function inferFuelCompoundSlug(collapsed) {
  if (!collapsed || collapsed === "—" || collapsed === "-") return null;

  const has = (s) => collapsed.includes(s);

  if (has("hibrido") || has("hybrid")) return "hibrido";

  if ((has("alcool") || has("etanol")) && has("gasolina")) return "flex";
  if (has("alcool") && has("gasolina")) return "flex";
  if (has("etanol") && has("gasolina")) return "flex";

  if (has("eletrico") && (has("gasolina") || has("etanol") || has("alcool"))) {
    return "hibrido";
  }
  if (has("gasolina") && has("eletrico")) return "hibrido";

  if (has("gnv")) return "gnv";
  if (has("diesel")) return "diesel";

  return null;
}

function tokenizeFuelParts(collapsed) {
  return collapsed
    .split(/[/|,&+]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Carroceria: label → slug CHECK. Desconhecido → `sedan` (fallback seguro).
 */
export function normalizeBodyTypeForStorage(value) {
  const resolved = resolveFromLookup(BODY_LOOKUP, value);
  if (resolved !== undefined) return resolved;
  return "sedan";
}

/**
 * Combustível: label → chave canônica (`FUEL_SYNONYMS`) ou null.
 * Não mapeado → null (evita violar CHECK no banco).
 */
export function normalizeFuelTypeForStorage(value) {
  const resolved = resolveFromLookup(FUEL_LOOKUP, value);
  if (resolved !== undefined) return resolved;

  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const collapsed = stripDiacritics(raw.toLowerCase());
  const compound = inferFuelCompoundSlug(collapsed);
  if (compound) return compound;

  for (const part of tokenizeFuelParts(collapsed)) {
    const partResolved = resolveFromLookup(FUEL_LOOKUP, part);
    if (partResolved !== undefined) return partResolved;
    const partCompound = inferFuelCompoundSlug(
      stripDiacritics(part.toLowerCase())
    );
    if (partCompound) return partCompound;
  }

  return null;
}

/**
 * Câmbio: label → chave canônica (`TRANSMISSION_SYNONYMS`) ou null.
 * Não mapeado → null.
 */
export function normalizeTransmissionForStorage(value) {
  const resolved = resolveFromLookup(TRANS_LOOKUP, value);
  if (resolved !== undefined) return resolved;
  return null;
}

/**
 * Aplica normalização de campos de veículo antes de INSERT/UPDATE.
 * @param {Record<string, unknown>} input
 * @param {{ partial?: boolean }} [options]
 */
export function normalizeAdVehicleFieldsForPersistence(input, options = {}) {
  const { partial = false } = options;
  const out = { ...input };

  if (!partial) {
    out.body_type = normalizeBodyTypeForStorage(input.body_type);
    out.fuel_type = normalizeFuelTypeForStorage(input.fuel_type);
    out.transmission = normalizeTransmissionForStorage(input.transmission);
    return out;
  }

  if (Object.prototype.hasOwnProperty.call(input, "body_type")) {
    out.body_type = normalizeBodyTypeForStorage(input.body_type);
  }
  if (Object.prototype.hasOwnProperty.call(input, "fuel_type")) {
    out.fuel_type = normalizeFuelTypeForStorage(input.fuel_type);
  }
  if (Object.prototype.hasOwnProperty.call(input, "transmission")) {
    out.transmission = normalizeTransmissionForStorage(input.transmission);
  }
  return out;
}
