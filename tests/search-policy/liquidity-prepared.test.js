import { describe, expect, it } from "vitest";
import { runLiquidityQuery } from "../../src/modules/ads/search-policy/scope-resolver.js";

describe("runLiquidityQuery prepared statement", () => {
  it("usa named prepared statement estável no shape browse sem filtros", async () => {
    const calls = [];
    const db = {
      processID: 123,
      async query(input, params) {
        calls.push({ input, params });
        return { rows: [] };
      },
    };

    await runLiquidityQuery(db, { originId: 4761, radiusKm: 75, filters: {} });
    await runLiquidityQuery(db, { originId: 4800, radiusKm: 50, filters: {} });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(typeof call.input).toBe("object");
      expect(call.input.name).toMatch(/^sp_liq_browse_[a-f0-9]{12}$/);
      expect(call.input.text).toContain("FROM region_memberships rm");
      expect(Array.isArray(call.input.values)).toBe(true);
    }
    expect(calls[0].input.name).toBe(calls[1].input.name);
    expect(calls[0].input.text).toBe(calls[1].input.text);
    expect(calls[0].input.values).not.toEqual(calls[1].input.values);
  });

  it("mantém query não nomeada quando há filtro de produto", async () => {
    let captured;
    const db = {
      processID: 123,
      async query(input, params) {
        captured = { input, params };
        return { rows: [] };
      },
    };

    await runLiquidityQuery(db, {
      originId: 4761,
      radiusKm: 75,
      filters: { q: "onix" },
    });

    expect(typeof captured.input).toBe("string");
    expect(captured.input).toContain("plainto_tsquery");
    expect(captured.params).toEqual(expect.arrayContaining([4761, 75, "onix"]));
  });

  it("preserva compatibilidade com db stubs sem suporte detectável a prepared statement", async () => {
    let captured;
    const db = {
      async query(input, params) {
        captured = { input, params };
        return { rows: [] };
      },
    };

    await runLiquidityQuery(db, { originId: 4761, radiusKm: 75, filters: {} });

    expect(typeof captured.input).toBe("string");
    expect(captured.params).toEqual([4761, 75]);
  });
});
