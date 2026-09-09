// tests/search-policy/f2-regions-guard.test.js
//
// §4.5 — o guard `rm.layer <= 2` da Página Regional só sai no caminho v1 para
// origem na allowlist. Com off/shadow, ou base fora da allowlist, o SQL é o de
// sempre. Banco mockado: o que se prova é o SQL emitido.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
}));
vi.mock("../../src/modules/admin/regional-settings/admin-regional-settings.service.js", () => ({
  getRegionalRadiusKm: vi.fn(async () => 80),
}));
vi.mock("../../src/modules/platform/settings.service.js", () => ({
  getSetting: vi.fn(async (_k, d) => d),
}));

import { pool } from "../../src/infrastructure/database/db.js";
import { getRegionByBaseSlug } from "../../src/modules/regions/regions.service.js";

function arm() {
  vi.mocked(pool.query).mockReset();
  vi.mocked(pool.query)
    .mockResolvedValueOnce({
      rows: [
        {
          id: 4800,
          slug: "braganca-paulista-sp",
          name: "Bragança Paulista",
          state: "SP",
          latitude: -22.9,
          longitude: -46.5,
        },
      ],
    })
    .mockResolvedValueOnce({ rows: [] });
}
function membersSql() {
  return String(vi.mocked(pool.query).mock.calls[1][0]).replace(/\s+/g, " ");
}

describe("regions.service — guard layer <= 2 sob flag", () => {
  const env = { ...process.env };
  beforeEach(() => arm());
  afterEach(() => {
    process.env = { ...env };
  });

  it("off: guard presente", async () => {
    process.env.SEARCH_POLICY_ENGINE = "off";
    await getRegionByBaseSlug("braganca-paulista-sp");
    expect(membersSql()).toContain("AND rm.layer <= 2");
  });
  it("shadow: guard presente", async () => {
    process.env.SEARCH_POLICY_ENGINE = "shadow";
    process.env.SEARCH_POLICY_ENGINE_CITIES = "*";
    await getRegionByBaseSlug("braganca-paulista-sp");
    expect(membersSql()).toContain("AND rm.layer <= 2");
  });
  it("v1 com base fora da allowlist: guard presente", async () => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    process.env.SEARCH_POLICY_ENGINE_CITIES = "atibaia-sp";
    await getRegionByBaseSlug("braganca-paulista-sp");
    expect(membersSql()).toContain("AND rm.layer <= 2");
  });
  it("v1 com base na allowlist: guard removido", async () => {
    process.env.SEARCH_POLICY_ENGINE = "v1";
    process.env.SEARCH_POLICY_ENGINE_CITIES = "braganca-paulista-sp";
    await getRegionByBaseSlug("braganca-paulista-sp");
    expect(membersSql()).not.toContain("rm.layer <= 2");
    expect(membersSql()).toContain("rm.member_city_id != $1");
  });
});
