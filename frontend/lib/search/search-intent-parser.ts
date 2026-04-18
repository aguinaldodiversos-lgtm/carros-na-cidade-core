/**
 * Parser heurístico de busca em linguagem natural → filtros parciais da API de anúncios.
 * Preparado para composição futura com provedor de IA (mesma forma de saída).
 */

import type { AdsSearchFilters } from "@/lib/search/ads-search";
import type { SearchIntentParseResult, SearchIntentProviderContext } from "./search-intent-types";

const BRAND_ALIASES: Record<string, string> = {
  vw: "Volkswagen",
  chev: "Chevrolet",
  gm: "Chevrolet",
};

const BRANDS = [
  "Mercedes-Benz",
  "Volkswagen",
  "Chevrolet",
  "Toyota",
  "Honda",
  "Hyundai",
  "Fiat",
  "Jeep",
  "Nissan",
  "Renault",
  "Peugeot",
  "Citroën",
  "BMW",
  "Audi",
  "Ford",
  "Mitsubishi",
  "Kia",
  "BYD",
  "Volvo",
  "Chery",
  "Ram",
];

const MODEL_HINTS: Record<string, string[]> = {
  Toyota: ["Corolla", "Hilux", "Yaris", "SW4", "RAV4"],
  Honda: ["Civic", "City", "HR-V", "CR-V", "Fit", "WR-V"],
  Volkswagen: ["T-Cross", "Nivus", "Virtus", "Taos", "Polo", "Jetta", "Amarok"],
  Chevrolet: ["Onix", "Tracker", "Cruze", "S10", "Spin"],
  Fiat: ["Pulse", "Fastback", "Toro", "Strada", "Argo", "Cronos", "Mobi"],
  Hyundai: ["HB20", "Creta", "Tucson", "Santa Fe"],
  Jeep: ["Compass", "Renegade", "Commander"],
  Nissan: ["Kicks", "Sentra", "Versa", "Frontier"],
  BMW: ["320i", "X1", "X3", "X5"],
  Audi: ["A3", "A4", "Q3", "Q5"],
  BYD: ["Yuan Plus", "Song Plus", "Dolphin"],
};

const GENERIC_MODELS =
  /\b(corolla|civic|onix|hb20|compass|renegade|kicks|yaris|hilux|polo|virtus|t-cross|tcross|argo|creta|tracker|cruze|fit|city)\b/i;

function stripAccents(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePrice(working: string): { max?: number; min?: number; rest: string } {
  let rest = working;

  const ateMil = rest.match(/\bat[eê]?\s*(\d{1,3}(?:\.\d{3})?|\d+)\s*mil\b/i);
  if (ateMil) {
    const digits = ateMil[1].replace(/\D/g, "");
    const v = Number(digits) * 1000;
    if (Number.isFinite(v) && v > 0) {
      rest = rest.replace(ateMil[0], " ").replace(/\s+/g, " ").trim();
      return { max: v, rest };
    }
  }

  const ateReais = rest.match(/\bat[eê]?\s*R?\$?\s*([\d.]+),?(\d{3})\b/i);
  if (ateReais) {
    const full = `${ateReais[1].replace(/\./g, "")}${ateReais[2]}`;
    const v = Number(full);
    if (Number.isFinite(v) && v >= 1000) {
      rest = rest.replace(ateReais[0], " ").replace(/\s+/g, " ").trim();
      return { max: v, rest };
    }
  }

  const shortK = rest.match(/\b(\d{2,3})\s*k\b/i);
  if (shortK) {
    const v = Number(shortK[1]) * 1000;
    rest = rest.replace(shortK[0], " ").replace(/\s+/g, " ").trim();
    return { max: v, rest };
  }

  return { rest };
}

function parseYear(working: string): { year?: number; rest: string } {
  const m = working.match(/\b(20[12]\d)\b/);
  if (!m) return { rest: working };
  const y = Number(m[1]);
  const maxY = new Date().getFullYear() + 1;
  if (y >= 1990 && y <= maxY) {
    return { year: y, rest: working.replace(m[0], " ").replace(/\s+/g, " ").trim() };
  }
  return { rest: working };
}

function parseCity(
  working: string,
  ctx: SearchIntentProviderContext
): { filters: Partial<AdsSearchFilters>; rest: string } {
  const emMatch = working.match(/\bem\s+([a-záàâãéêíóôõúç\s-]+?)(?=\s*$|\s+(?:com|para|e)\b)/i);
  const candidates = ctx.featuredCities || [];

  if (emMatch) {
    const guess = emMatch[1].trim();
    const nk = stripAccents(guess).toLowerCase();
    for (const c of candidates) {
      const cn = stripAccents(c.name).toLowerCase();
      if (nk === cn || nk.includes(cn) || cn.includes(nk)) {
        return {
          filters: { city_slug: c.slug },
          rest: working.replace(emMatch[0], " ").replace(/\s+/g, " ").trim(),
        };
      }
    }
    return {
      filters: { city: guess.replace(/\s+/g, " ") },
      rest: working.replace(emMatch[0], " ").replace(/\s+/g, " ").trim(),
    };
  }

  const lower = stripAccents(working).toLowerCase();
  for (const c of candidates) {
    const cn = stripAccents(c.name).toLowerCase();
    if (cn.length < 4) continue;
    if (lower.includes(cn)) {
      const re = new RegExp(`\\b${escapeRegExp(c.name)}\\b`, "i");
      if (re.test(working)) {
        return {
          filters: { city_slug: c.slug },
          rest: working.replace(re, " ").replace(/\s+/g, " ").trim(),
        };
      }
    }
  }

  return { filters: {}, rest: working };
}

function applyAliases(working: string): string {
  let w = working;
  for (const [alias, canonical] of Object.entries(BRAND_ALIASES)) {
    w = w.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi"), canonical);
  }
  return w;
}

function parseBrandModel(working: string): { filters: Partial<AdsSearchFilters>; rest: string } {
  let rest = applyAliases(working);
  let brand: string | undefined;
  let model: string | undefined;

  for (const b of BRANDS) {
    const re = new RegExp(`\\b${escapeRegExp(b)}\\b`, "i");
    if (re.test(rest)) {
      brand = b;
      rest = rest.replace(re, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  if (brand && MODEL_HINTS[brand]) {
    for (const mo of MODEL_HINTS[brand]) {
      const re = new RegExp(`\\b${escapeRegExp(mo)}\\b`, "i");
      if (re.test(rest)) {
        model = mo;
        rest = rest.replace(re, " ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  if (!model) {
    const gm = rest.match(GENERIC_MODELS);
    if (gm) {
      let m = gm[1];
      if (/^t-?cross$/i.test(m)) m = "T-Cross";
      else m = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
      model = m;
      rest = rest.replace(gm[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  const filters: Partial<AdsSearchFilters> = {};
  if (brand) filters.brand = brand;
  if (model) filters.model = model;
  return { filters, rest };
}

function parseTransmissionFuelBody(working: string): {
  filters: Partial<AdsSearchFilters>;
  rest: string;
} {
  let rest = working;
  const f: Partial<AdsSearchFilters> = {};

  if (/\b(autom[aá]tico|automática|automatico|cvt)\b/i.test(rest)) {
    f.transmission = "Automático";
    rest = rest.replace(/\b(autom[aá]tico|automática|automatico|cvt)\b/gi, " ");
  } else if (/\bmanual\b/i.test(rest)) {
    f.transmission = "Manual";
    rest = rest.replace(/\bmanual\b/gi, " ");
  }

  if (/\bflex\b/i.test(rest)) {
    f.fuel_type = "Flex";
    rest = rest.replace(/\bflex\b/gi, " ");
  } else if (/\bgasolina\b/i.test(rest)) {
    f.fuel_type = "Gasolina";
    rest = rest.replace(/\bgasolina\b/gi, " ");
  } else if (/\bdiesel\b/i.test(rest)) {
    f.fuel_type = "Diesel";
    rest = rest.replace(/\bdiesel\b/gi, " ");
  } else if (/\bel[eé]tric[oa]\b/i.test(rest)) {
    f.fuel_type = "Elétrico";
    rest = rest.replace(/\bel[eé]tric[oa]\b/gi, " ");
  }

  if (/\bsuv\b/i.test(rest)) {
    f.body_type = "SUV";
    rest = rest.replace(/\bsuv\b/gi, " ");
  } else if (/\bsed[aã]n\b/i.test(rest)) {
    f.body_type = "Sedan";
    rest = rest.replace(/\bsed[aã]n\b/gi, " ");
  } else if (/\bhatch\b/i.test(rest)) {
    f.body_type = "Hatch";
    rest = rest.replace(/\bhatch\b/gi, " ");
  } else if (/\bpicape\b/i.test(rest)) {
    f.body_type = "Picape";
    rest = rest.replace(/\bpicape\b/gi, " ");
  }

  return { filters: f, rest: rest.replace(/\s+/g, " ").trim() };
}

function stripBelowFipe(working: string): { flag: boolean; rest: string } {
  if (/\b(abaixo\s*da\s*fipe|abaixo\s+fipe)\b/i.test(working)) {
    return {
      flag: true,
      rest: working
        .replace(/\b(abaixo\s*da\s*fipe|abaixo\s+fipe)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }
  return { flag: false, rest: working };
}

function stripMotoWords(working: string): { isMoto: boolean; rest: string } {
  if (/\b(moto|motocicleta)\b/i.test(working)) {
    return {
      isMoto: true,
      rest: working
        .replace(/\b(moto|motocicleta)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim(),
    };
  }
  return { isMoto: false, rest: working };
}

export function parseSearchIntent(
  raw: string,
  ctx: SearchIntentProviderContext
): SearchIntentParseResult {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { filters: {}, remainderText: "", detectedMotoInText: false };
  }

  let working = trimmed;
  const filters: Partial<AdsSearchFilters> = {};

  const bf = stripBelowFipe(working);
  if (bf.flag) filters.below_fipe = true;
  working = bf.rest;

  const motoW = stripMotoWords(working);
  const wantsMotoInText = motoW.isMoto;
  working = motoW.rest;

  const price = parsePrice(working);
  if (price.max !== undefined) filters.max_price = price.max;
  if (price.min !== undefined) filters.min_price = price.min;
  working = price.rest;

  const yr = parseYear(working);
  if (yr.year !== undefined) {
    filters.year_min = yr.year;
    filters.year_max = yr.year;
  }
  working = yr.rest;

  const cityP = parseCity(working, ctx);
  Object.assign(filters, cityP.filters);
  working = cityP.rest;

  let tfb = parseTransmissionFuelBody(working);
  Object.assign(filters, tfb.filters);
  working = tfb.rest;

  const bm = parseBrandModel(working);
  Object.assign(filters, bm.filters);
  working = bm.rest;

  tfb = parseTransmissionFuelBody(working);
  Object.assign(filters, tfb.filters);
  working = tfb.rest;

  const remainderText = working.replace(/\s+/g, " ").trim();

  return {
    filters,
    remainderText,
    detectedMotoInText: wantsMotoInText,
  };
}

export async function parseSearchIntentWithOptionalAI(
  raw: string,
  ctx: SearchIntentProviderContext
): Promise<SearchIntentParseResult> {
  return parseSearchIntent(raw, ctx);
}

/** Fachada estável para evoluir com provedor de IA sem mudar importações. */
export const SearchIntentParser = {
  parse: parseSearchIntent,
  parseAsync: parseSearchIntentWithOptionalAI,
};
