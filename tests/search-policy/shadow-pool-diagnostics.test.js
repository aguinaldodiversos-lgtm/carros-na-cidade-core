import { describe, expect, it } from "vitest";
import { withShadowStatementTimeout } from "../../src/modules/ads/search-policy/engine.js";

describe("shadow pool diagnostics", () => {
  it("captura contadores do pool antes, após aquisição e após release", async () => {
    const db = {
      totalCount: 7,
      idleCount: 0,
      waitingCount: 2,
      async connect() {
        this.waitingCount = 1;
        const owner = this;
        return {
          async query() {
            return { rows: [] };
          },
          release() {
            owner.idleCount = 1;
            owner.waitingCount = 0;
          },
        };
      },
    };

    const timings = {};
    const result = await withShadowStatementTimeout(
      db,
      async () => "ok",
      timings
    );

    expect(result).toBe("ok");
    expect(timings).toMatchObject({
      pool_total_before: 7,
      pool_idle_before: 0,
      pool_waiting_before: 2,
      pool_total_acquired: 7,
      pool_idle_acquired: 0,
      pool_waiting_acquired: 1,
      pool_total_released: 7,
      pool_idle_released: 1,
      pool_waiting_released: 0,
    });
    expect(timings.pool_wait_ms).toBeGreaterThanOrEqual(0);
  });

  it("tolera wrappers de db sem contadores de pool", async () => {
    const db = {
      async connect() {
        return {
          async query() {
            return { rows: [] };
          },
          release() {},
        };
      },
    };

    const timings = {};
    await withShadowStatementTimeout(db, async () => null, timings);

    expect(timings.pool_total_before).toBeNull();
    expect(timings.pool_idle_before).toBeNull();
    expect(timings.pool_waiting_before).toBeNull();
  });
});
