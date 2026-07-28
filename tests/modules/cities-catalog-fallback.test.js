/**
 * `findCatalogAdsTerritoryFallback` — a regra que decide QUAL território doa
 * anúncios para uma cidade sem estoque.
 *
 * Não havia teste nenhum desta função. O passo global antigo ("qualquer cidade
 * do Brasil, ORDER BY live_ads DESC") transformou Atibaia-SP na doadora das
 * 5.572 cidades do banco: `/comprar/cidade/altaneira-ce` exibia carros a
 * ~2.500 km numa página que se declarava do Ceará (auditoria 2026-07-28).
 *
 * Os três casos que estes testes travam:
 *   1. Bragança Paulista (18,34 km de Atibaia) CONTINUA recebendo — legítimo.
 *   2. Altaneira-CE NÃO recebe nada — o caso patológico.
 *   3. Cidade com estoque próprio nunca cai no fallback.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: (...args) => queryMock(...args) },
}));

vi.mock("../../src/shared/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { findCatalogAdsTerritoryFallback } = await import(
  "../../src/modules/cities/cities.repository.js"
);

/** Identifica a query pelo texto do SQL, sem depender da ordem de chamada. */
function routeQuery(sql) {
  const s = String(sql);
  if (s.includes("FROM cities") && s.includes("WHERE slug =")) return "city";
  if (s.includes("FROM ads a") && s.includes("a.city_id = $1")) return "ownCount";
  if (s.includes("FROM region_memberships rm")) return "radiusDonor";
  if (s.includes("FROM region_memberships") && s.includes("SELECT 1")) return "hasMemberships";
  if (s.includes("UPPER(TRIM(BOTH FROM COALESCE(c.state::text")) return "sameState";
  return "unknown";
}

/**
 * @param {object} plan
 * @param {object|null} plan.city
 * @param {number} plan.ownCount
 * @param {object|null} plan.radiusDonor
 * @param {boolean} plan.hasMemberships
 * @param {object|null} plan.sameStateDonor
 */
function mockDb(plan) {
  const seen = [];
  queryMock.mockImplementation((sql) => {
    const kind = routeQuery(sql);
    seen.push(kind);
    switch (kind) {
      case "city":
        return { rows: plan.city ? [plan.city] : [], rowCount: plan.city ? 1 : 0 };
      case "ownCount":
        return { rows: [{ n: plan.ownCount ?? 0 }], rowCount: 1 };
      case "radiusDonor":
        return {
          rows: plan.radiusDonor ? [plan.radiusDonor] : [],
          rowCount: plan.radiusDonor ? 1 : 0,
        };
      case "hasMemberships":
        return {
          rows: plan.hasMemberships ? [{ "?column?": 1 }] : [],
          rowCount: plan.hasMemberships ? 1 : 0,
        };
      case "sameState":
        return {
          rows: plan.sameStateDonor ? [plan.sameStateDonor] : [],
          rowCount: plan.sameStateDonor ? 1 : 0,
        };
      default:
        throw new Error(`Query não mapeada no teste:\n${sql}`);
    }
  });
  return seen;
}

const ATIBAIA = { slug: "atibaia-sp", name: "Atibaia", state: "SP", live_ads: 19 };

beforeEach(() => {
  queryMock.mockReset();
});

describe("findCatalogAdsTerritoryFallback — caso legítimo (não pode quebrar)", () => {
  it("Bragança Paulista recebe Atibaia (18,34 km) via raio", async () => {
    mockDb({
      city: { id: 10, slug: "braganca-paulista-sp", name: "Bragança Paulista", state: "SP" },
      ownCount: 0,
      radiusDonor: { ...ATIBAIA, distance_km: 18.34 },
      hasMemberships: true,
    });

    const out = await findCatalogAdsTerritoryFallback("braganca-paulista-sp");

    expect(out).toMatchObject({
      mode: "fallback",
      slug: "atibaia-sp",
      state: "SP",
      live_ads: 19,
      distance_km: 18.34,
    });
  });
});

describe("findCatalogAdsTerritoryFallback — caso patológico (o motivo da correção)", () => {
  it("Altaneira-CE NÃO recebe Atibaia: sem vizinha estocada → empty", async () => {
    const seen = mockDb({
      city: { id: 99, slug: "altaneira-ce", name: "Altaneira", state: "CE" },
      ownCount: 0,
      radiusDonor: null, // vizinhas cearenses, nenhuma com estoque
      hasMemberships: true, // malha construída
    });

    const out = await findCatalogAdsTerritoryFallback("altaneira-ce");

    expect(out).toEqual({
      mode: "empty",
      slug: "altaneira-ce",
      name: "Altaneira",
      state: "CE",
      live_ads: 0,
    });
    // O passo global foi REMOVIDO: nenhuma query pode varrer o país inteiro.
    expect(seen).not.toContain("unknown");
  });

  it("cidade com malha e sem vizinha estocada NUNCA cai no fallback por UF", async () => {
    const seen = mockDb({
      city: { id: 99, slug: "altaneira-ce", name: "Altaneira", state: "CE" },
      ownCount: 0,
      radiusDonor: null,
      hasMemberships: true,
      sameStateDonor: { slug: "fortaleza-ce", name: "Fortaleza", state: "CE", live_ads: 5 },
    });

    const out = await findCatalogAdsTerritoryFallback("altaneira-ce");

    expect(out.mode).toBe("empty");
    expect(seen).not.toContain("sameState");
  });
});

describe("findCatalogAdsTerritoryFallback — estoque próprio", () => {
  it("cidade com anúncios próprios devolve 'self' e nem consulta vizinhança", async () => {
    const seen = mockDb({
      city: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      ownCount: 19,
    });

    const out = await findCatalogAdsTerritoryFallback("atibaia-sp");

    expect(out).toEqual({
      mode: "self",
      slug: "atibaia-sp",
      name: "Atibaia",
      state: "SP",
      live_ads: 19,
    });
    expect(seen).not.toContain("radiusDonor");
    expect(seen).not.toContain("sameState");
  });
});

describe("findCatalogAdsTerritoryFallback — cidade sem malha (build não rodou)", () => {
  it("cai no fallback por UF quando não há region_memberships", async () => {
    const seen = mockDb({
      city: { id: 500, slug: "cidade-nova-sp", name: "Cidade Nova", state: "SP" },
      ownCount: 0,
      radiusDonor: null,
      hasMemberships: false, // cadastrada depois do último regions:build
      sameStateDonor: ATIBAIA,
    });

    const out = await findCatalogAdsTerritoryFallback("cidade-nova-sp");

    expect(out).toMatchObject({ mode: "fallback", slug: "atibaia-sp", distance_km: null });
    expect(seen).toContain("sameState");
  });

  it("sem malha e sem doadora na UF → empty", async () => {
    mockDb({
      city: { id: 501, slug: "cidade-nova-ac", name: "Cidade Nova", state: "AC" },
      ownCount: 0,
      radiusDonor: null,
      hasMemberships: false,
      sameStateDonor: null,
    });

    const out = await findCatalogAdsTerritoryFallback("cidade-nova-ac");
    expect(out.mode).toBe("empty");
  });
});

describe("findCatalogAdsTerritoryFallback — bordas", () => {
  it("slug vazio → null sem tocar o banco", async () => {
    mockDb({ city: null });
    expect(await findCatalogAdsTerritoryFallback("   ")).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("cidade inexistente → null", async () => {
    mockDb({ city: null });
    expect(await findCatalogAdsTerritoryFallback("nao-existe-sp")).toBeNull();
  });

  it("erro de banco → null (nunca propaga para a página)", async () => {
    queryMock.mockRejectedValue(new Error("connection lost"));
    expect(await findCatalogAdsTerritoryFallback("atibaia-sp")).toBeNull();
  });
});
