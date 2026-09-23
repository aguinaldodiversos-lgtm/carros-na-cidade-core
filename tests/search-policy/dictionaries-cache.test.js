import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBrandDictionary,
  resetDictionariesForTests,
} from "../../src/modules/ads/search-policy/dictionaries.js";
import { FREE_QUERY_CACHE_TTL_MS } from "../../src/modules/ads/filters/ads-free-query.constants.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("search-policy dictionaries cache", () => {
  let now;

  beforeEach(() => {
    resetDictionariesForTests();
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDictionariesForTests();
  });

  it("faz single-flight no cold start", async () => {
    const gate = deferred();
    let queries = 0;
    const db = {
      query() {
        queries += 1;
        return gate.promise;
      },
    };

    const first = getBrandDictionary(db);
    const second = getBrandDictionary(db);

    await Promise.resolve();
    expect(queries).toBe(1);

    gate.resolve({
      rows: [{ brand: "GM - Chevrolet", total: 6 }],
    });

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ original: "GM - Chevrolet", total: 6 });
    expect(queries).toBe(1);
  });

  it("serve stale imediatamente e faz uma única atualização em background após o TTL", async () => {
    const refreshGate = deferred();
    let queries = 0;
    let phase = "cold";
    const db = {
      query() {
        queries += 1;
        if (phase === "cold") {
          return Promise.resolve({
            rows: [{ brand: "GM - Chevrolet", total: 6 }],
          });
        }
        return refreshGate.promise;
      },
    };

    const cold = await getBrandDictionary(db);
    expect(cold[0]).toMatchObject({ original: "GM - Chevrolet", total: 6 });
    expect(queries).toBe(1);

    now += FREE_QUERY_CACHE_TTL_MS + 1;
    phase = "refresh";

    const staleA = await getBrandDictionary(db);
    const staleB = await getBrandDictionary(db);

    expect(staleA[0]).toMatchObject({ original: "GM - Chevrolet", total: 6 });
    expect(staleB).toEqual(staleA);
    expect(queries).toBe(2);

    refreshGate.resolve({
      rows: [{ brand: "Chevrolet", total: 7 }],
    });
    await refreshGate.promise;
    await new Promise((resolve) => setImmediate(resolve));

    const fresh = await getBrandDictionary(db);
    expect(fresh[0]).toMatchObject({ original: "Chevrolet", total: 7 });
    expect(queries).toBe(2);
  });
});
