import { describe, it, expect } from "vitest";
import * as backend from "../../src/modules/ads/ad-options.catalog.js";
import * as frontend from "../../frontend/lib/ads/vehicle-options.ts";

/**
 * Guarda de sincronia: o catálogo do backend (autoridade de validação) e o
 * espelho do frontend (UI + render público) DEVEM ter exatamente as mesmas
 * keys, labels e categorias. Se alguém adicionar/alterar um opcional só de um
 * lado, este teste quebra — evita "key salva mas sem label público" e vice-versa.
 */
describe("catálogo de opcionais — sincronia backend ↔ frontend", () => {
  const backendByKey = new Map(backend.VEHICLE_OPTIONS_CATALOG.map((i) => [i.key, i]));
  const frontendByKey = new Map(frontend.VEHICLE_OPTIONS_CATALOG.map((i) => [i.key, i]));

  it("mesmas categorias na mesma ordem", () => {
    expect(frontend.VEHICLE_OPTION_CATEGORIES).toEqual(backend.VEHICLE_OPTION_CATEGORIES);
  });

  it("mesmo conjunto de keys", () => {
    const backendKeys = [...backendByKey.keys()].sort();
    const frontendKeys = [...frontendByKey.keys()].sort();
    expect(frontendKeys).toEqual(backendKeys);
  });

  it("mesmo label e categoria para cada key", () => {
    for (const [key, b] of backendByKey) {
      const f = frontendByKey.get(key);
      expect(f, `key ausente no frontend: ${key}`).toBeTruthy();
      expect(f.label, `label divergente em ${key}`).toBe(b.label);
      expect(f.category, `categoria divergente em ${key}`).toBe(b.category);
    }
  });

  it("rótulos das categorias idênticos", () => {
    expect(frontend.VEHICLE_OPTION_CATEGORY_LABELS).toEqual(backend.VEHICLE_OPTION_CATEGORY_LABELS);
  });
});
