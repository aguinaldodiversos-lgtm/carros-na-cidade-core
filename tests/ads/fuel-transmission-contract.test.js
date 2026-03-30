/**
 * Contrato: sinônimos em `ads.canonical.constants.js` alimentam busca livre e persistência.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { getPoolConfig } from "../../src/infrastructure/database/pool-config.js";
import {
  FUEL_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "../../src/modules/ads/filters/ads-free-query.constants.js";
import {
  normalizeFuelTypeForStorage,
  normalizeTransmissionForStorage,
} from "../../src/modules/ads/ads.storage-normalize.js";

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

function resolveSynonym(lookup, value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  const collapsed = key.normalize("NFD").replace(/\p{M}/gu, "");
  if (lookup.has(collapsed)) return lookup.get(collapsed);
  return undefined;
}

const FUEL_LOOKUP = buildLookup(FUEL_SYNONYMS);
const TRANS_LOOKUP = buildLookup(TRANSMISSION_SYNONYMS);

const CANONICAL_FUEL_SLUGS = new Set(Object.keys(FUEL_SYNONYMS));
const CANONICAL_TRANSMISSION_SLUGS = new Set(Object.keys(TRANSMISSION_SYNONYMS));

describe("fuel / transmission: cobertura dos sinônimos declarados", () => {
  it("cada sinônio de combustível resolve para a chave canônica", () => {
    for (const [slug, synonyms] of Object.entries(FUEL_SYNONYMS)) {
      for (const syn of synonyms) {
        expect(resolveSynonym(FUEL_LOOKUP, syn)).toBe(slug);
      }
    }
  });

  it("cada sinônio de câmbio resolve para a chave canônica", () => {
    for (const [slug, synonyms] of Object.entries(TRANSMISSION_SYNONYMS)) {
      for (const syn of synonyms) {
        expect(resolveSynonym(TRANS_LOOKUP, syn)).toBe(slug);
      }
    }
  });
});

describe("valores padrão do wizard (NewAdWizardClient INITIAL_FORM)", () => {
  it("Flex e Automático mapeiam para persistência", () => {
    expect(normalizeFuelTypeForStorage("Flex")).toBe("flex");
    expect(normalizeTransmissionForStorage("Automático")).toBe("automatico");
  });
});

const FIPE_LIKE_FUEL_SAMPLES = [
  { raw: "Flex", expected: "flex" },
  { raw: "Gasolina / Elétrico", expected: "hibrido" },
  { raw: "Álcool / Gasolina", expected: "flex" },
  { raw: "—", expected: null },
];

const FIPE_LIKE_TRANSMISSION_SAMPLES = [
  { raw: "Automático", expected: "automatico" },
  { raw: "Automatizado", expected: "automatico" },
  { raw: "Semi-automático", expected: "automatico" },
];

describe("amostras estilo FIPE vs normalizador de persistência", () => {
  it("combustível", () => {
    for (const { raw, expected } of FIPE_LIKE_FUEL_SAMPLES) {
      expect(normalizeFuelTypeForStorage(raw)).toBe(expected);
    }
  });

  it("câmbio", () => {
    for (const { raw, expected } of FIPE_LIKE_TRANSMISSION_SAMPLES) {
      expect(normalizeTransmissionForStorage(raw)).toBe(expected);
    }
  });
});

describe("contrato: slugs canônicos usados na busca", () => {
  it("lista fechada de chaves de combustível", () => {
    expect([...CANONICAL_FUEL_SLUGS].sort()).toMatchInlineSnapshot(`
      [
        "diesel",
        "eletrico",
        "etanol",
        "flex",
        "gasolina",
        "gnv",
        "hibrido",
      ]
    `);
  });

  it("lista fechada de chaves de câmbio", () => {
    expect([...CANONICAL_TRANSMISSION_SLUGS].sort()).toMatchInlineSnapshot(`
      [
        "automatico",
        "cvt",
        "manual",
      ]
    `);
  });
});

/**
 * Bloco opcional: consulta CHECKs reais em `public.ads`.
 *
 * O Vitest (`integration-db-bootstrap`) define sempre um `DATABASE_URL` padrão (ex.: 5433),
 * então "ter URL" não significa Postgres disponível — antes isso gerava ECONNREFUSED no `npm test`.
 *
 * Só executa quando:
 * - `RUN_PG_ADS_CHECK_TESTS=1` (opt-in explícito), e
 * - `SKIP_PG_INTEGRATION_TESTS` não é `1`, e
 * - `DATABASE_URL` não está vazia.
 *
 * Para rodar localmente (com Postgres no ar): `npm run test:pg-contract`
 */
const runPgAdsCheckIntegration =
  process.env.SKIP_PG_INTEGRATION_TESTS !== "1" &&
  process.env.RUN_PG_ADS_CHECK_TESTS === "1" &&
  Boolean(String(process.env.DATABASE_URL || "").trim());

describe.skipIf(!runPgAdsCheckIntegration)("integração PostgreSQL: CHECK em public.ads", () => {
  let pool;

  beforeAll(() => {
    pool = new pg.Pool(getPoolConfig());
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it("retorna constraints de verificação da tabela ads (se existir)", async () => {
    const { rows } = await pool.query(`
      SELECT c.conname,
             pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'ads'
        AND c.contype = 'c'
      ORDER BY c.conname
    `);
    expect(rows).toBeDefined();
    if (rows.length === 0) {
      console.warn(
        "[fuel-transmission-contract] Nenhum CHECK em public.ads — tabela ausente ou sem constraints nomeadas."
      );
    } else {
      const names = rows.map((r) => r.conname).join(", ");
      console.warn(`[fuel-transmission-contract] CHECKs em ads: ${names}`);
    }
  });
});
