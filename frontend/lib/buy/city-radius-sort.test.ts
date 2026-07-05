import { describe, expect, it } from "vitest";

import {
  buildCitySlugs,
  buildDistanceMap,
  sortByDistanceThenHighlight,
  partitionByOrigin,
  type RadiusMember,
} from "./city-radius-sort";

const members: RadiusMember[] = [
  { slug: "braganca-paulista-sp", name: "Bragança Paulista", distance_km: 18 },
  { slug: "jundiai-sp", name: "Jundiaí", distance_km: 31 },
];

type Ad = { id: string; city_slug: string; highlight?: boolean };
const getCitySlug = (a: Ad) => a.city_slug;
const getHighlight = (a: Ad) => Boolean(a.highlight);

describe("buildCitySlugs / buildDistanceMap", () => {
  it("base primeiro, sem duplicar", () => {
    expect(buildCitySlugs("atibaia-sp", members)).toEqual([
      "atibaia-sp",
      "braganca-paulista-sp",
      "jundiai-sp",
    ]);
  });
  it("mapa: base 0 km, membros arredondados", () => {
    const map = buildDistanceMap("atibaia-sp", "Atibaia", members);
    expect(map.get("atibaia-sp")?.distanceKm).toBe(0);
    expect(map.get("braganca-paulista-sp")?.distanceKm).toBe(18);
  });
});

describe("sortByDistanceThenHighlight — destaque respeita a geografia", () => {
  const distanceMap = buildDistanceMap("atibaia-sp", "Atibaia", members);

  it("distância é PRIMÁRIA: cidade própria antes de vizinha, mesmo vizinha em destaque", () => {
    const ads: Ad[] = [
      { id: "braganca-destaque", city_slug: "braganca-paulista-sp", highlight: true }, // 18km, destaque
      { id: "atibaia-normal", city_slug: "atibaia-sp", highlight: false }, // 0km, normal
    ];
    const out = sortByDistanceThenHighlight(ads, { distanceMap, getCitySlug, getHighlight }).map(
      (a) => a.id
    );
    // O destaque de Bragança (18km) NUNCA vem antes do normal de Atibaia (0km).
    expect(out).toEqual(["atibaia-normal", "braganca-destaque"]);
  });

  it("destaque desempata DENTRO da mesma distância", () => {
    const ads: Ad[] = [
      { id: "atibaia-normal", city_slug: "atibaia-sp", highlight: false },
      { id: "atibaia-destaque", city_slug: "atibaia-sp", highlight: true },
    ];
    const out = sortByDistanceThenHighlight(ads, { distanceMap, getCitySlug, getHighlight }).map(
      (a) => a.id
    );
    expect(out).toEqual(["atibaia-destaque", "atibaia-normal"]);
  });

  it("mais próxima antes de mais distante; fora do mapa vai pro fim", () => {
    const ads: Ad[] = [
      { id: "jundiai", city_slug: "jundiai-sp" }, // 31km
      { id: "fora", city_slug: "campinas-sp" }, // desconhecida → fim
      { id: "braganca", city_slug: "braganca-paulista-sp" }, // 18km
      { id: "atibaia", city_slug: "atibaia-sp" }, // 0km
    ];
    const out = sortByDistanceThenHighlight(ads, { distanceMap, getCitySlug, getHighlight }).map(
      (a) => a.id
    );
    expect(out).toEqual(["atibaia", "braganca", "jundiai", "fora"]);
  });
});

describe("partitionByOrigin — dois blocos", () => {
  it("separa 'Em [cidade]' das vizinhas", () => {
    const ads: Ad[] = [
      { id: "a1", city_slug: "atibaia-sp" },
      { id: "b1", city_slug: "braganca-paulista-sp" },
      { id: "a2", city_slug: "atibaia-sp" },
    ];
    const { own, nearby } = partitionByOrigin(ads, "atibaia-sp", getCitySlug);
    expect(own.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(nearby.map((a) => a.id)).toEqual(["b1"]);
  });
});
