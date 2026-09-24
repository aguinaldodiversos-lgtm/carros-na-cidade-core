import { describe, expect, it } from "vitest";

import { normalizeCatalogItem, toSafeCatalogItems } from "./catalog-helpers";

const CITY = { slug: "atibaia-sp", name: "Atibaia", state: "SP" } as Parameters<
  typeof normalizeCatalogItem
>[1];

describe("normalizeCatalogItem — campos que o motor acrescenta", () => {
  // Esta é uma allowlist: um campo novo que ninguém copia aqui some sem erro.
  // Foi exatamente o que aconteceu com distance_km na F3 — a API mandava 18.34,
  // o AdCard sabia renderizar, e o card saía sem distância porque o normalizador
  // no meio do caminho não conhecia o campo.
  it("carrega distance_km da resposta do motor até o item do catálogo", () => {
    expect(normalizeCatalogItem({ id: 1, distance_km: 18.34 }, CITY).distance_km).toBe(18.34);
  });

  it("distância ausente vira null, não undefined solto", () => {
    expect(normalizeCatalogItem({ id: 1 }, CITY).distance_km).toBeNull();
  });

  it("distância 0 (própria cidade) é preservada, não confundida com ausência", () => {
    expect(normalizeCatalogItem({ id: 1, distance_km: 0 }, CITY).distance_km).toBe(0);
  });

  it("valor não numérico não vira NaN no card", () => {
    expect(
      normalizeCatalogItem({ id: 1, distance_km: "18" as unknown as number }, CITY).distance_km
    ).toBeNull();
    expect(normalizeCatalogItem({ id: 1, distance_km: Number.NaN }, CITY).distance_km).toBeNull();
  });

  it("toSafeCatalogItems preserva a distância de cada item", () => {
    const items = toSafeCatalogItems(
      [
        { id: 1, distance_km: 0 },
        { id: 2, distance_km: 18.34 },
      ] as Parameters<typeof toSafeCatalogItems>[0],
      CITY
    );
    expect(items.map((item) => item.distance_km)).toEqual([0, 18.34]);
  });
});
