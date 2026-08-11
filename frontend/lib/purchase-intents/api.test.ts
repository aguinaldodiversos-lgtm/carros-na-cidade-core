import { describe, expect, it } from "vitest";

import {
  BODY_TYPE_OPTIONS,
  DISPLAY_STATUS_LABEL,
  TRANSMISSION_OPTIONS,
  describeVehicle,
  formatCity,
  formatMaxPrice,
  formatPublishedAt,
} from "./api";

/**
 * Helpers puros do módulo de procuras.
 *
 * O ponto crítico aqui é `formatMaxPrice`: `max_price` vem do Postgres como
 * NUMERIC, e o driver `pg` entrega NUMERIC como STRING. Um `value.toFixed()`
 * ou um `value > 0` direto quebraria — e quebraria mostrando o preço errado,
 * não estourando.
 */

/**
 * `Intl.NumberFormat("pt-BR", { currency: "BRL" })` separa "R$" do número com
 * ESPAÇO NÃO SEPARÁVEL (U+00A0), não com espaço comum. Comparar contra um
 * literal digitado à mão falha com duas strings visualmente idênticas — então
 * normalizamos aqui em vez de colar um caractere invisível no teste.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/\s/g, " ");
}

describe("formatMaxPrice — NUMERIC chega como string", () => {
  it("formata string vinda do banco", () => {
    expect(normalizeSpaces(formatMaxPrice("95000.00"))).toBe("Até R$ 95.000");
  });

  it("formata number também", () => {
    expect(normalizeSpaces(formatMaxPrice(95000))).toBe("Até R$ 95.000");
  });

  it("arredonda centavos para o rótulo curto", () => {
    expect(normalizeSpaces(formatMaxPrice("95000.49"))).toBe("Até R$ 95.000");
  });

  it.each([null, undefined, "", "abc", "0", "-1"])("degrada com %p", (value) => {
    expect(formatMaxPrice(value as string)).toBe("Sem orçamento definido");
  });
});

describe("describeVehicle — descreve o VEÍCULO, nunca quem procura", () => {
  it("modo específico junta marca e modelo", () => {
    expect(
      describeVehicle({ intent_type: "specific_model", brand: "Volkswagen", model: "T-Cross" })
    ).toBe("Volkswagen T-Cross");
  });

  it("modo aberto usa o rótulo da carroceria", () => {
    expect(describeVehicle({ intent_type: "open_category", body_type: "suv" })).toBe("SUV");
    expect(describeVehicle({ intent_type: "open_category", body_type: "sedan" })).toBe("Sedã");
  });

  it("carroceria desconhecida cai no próprio valor em vez de sumir", () => {
    expect(describeVehicle({ intent_type: "open_category", body_type: "novo-tipo" })).toBe(
      "novo-tipo"
    );
  });

  it("modo específico sem modelo não deixa espaço solto", () => {
    expect(describeVehicle({ intent_type: "specific_model", brand: "Honda", model: null })).toBe(
      "Honda"
    );
  });
});

describe("formatCity", () => {
  it("junta nome e UF", () => {
    expect(formatCity({ name: "Atibaia", state: "SP", slug: "atibaia-sp" })).toBe("Atibaia - SP");
  });

  it("sem UF devolve só o nome", () => {
    expect(formatCity({ name: "Atibaia", state: "", slug: "atibaia" })).toBe("Atibaia");
  });

  it("sem cidade devolve string vazia em vez de 'undefined'", () => {
    expect(formatCity(null)).toBe("");
  });
});

describe("formatPublishedAt — `now` explícito, sem fake timer", () => {
  const now = new Date("2026-08-10T12:00:00.000Z");

  it.each([
    ["2026-08-10T09:00:00.000Z", "Publicado hoje"],
    ["2026-08-09T23:00:00.000Z", "Publicado ontem"],
    ["2026-08-05T12:00:00.000Z", "Publicado há 5 dias"],
  ])("%s → %s", (iso, expected) => {
    expect(formatPublishedAt(iso, now)).toBe(expected);
  });

  it("acima de 30 dias mostra a data", () => {
    expect(formatPublishedAt("2026-06-01T12:00:00.000Z", now)).toMatch(/^Publicado em /);
  });

  it("data inválida não quebra a listagem", () => {
    expect(formatPublishedAt("lixo", now)).toBe("");
  });
});

describe("vocabulário espelhado do backend", () => {
  it("os valores de câmbio são os slugs canônicos, sem acento", () => {
    // O rótulo é acentuado; o VALOR não pode ser. Enviar "Automático" faria a
    // procura nunca casar com um anúncio gravado como "automatico".
    expect(TRANSMISSION_OPTIONS.map((item) => item.value)).toEqual(["automatico", "manual", "cvt"]);
    expect(TRANSMISSION_OPTIONS.find((item) => item.value === "automatico")?.label).toBe(
      "Automático"
    );
  });

  it("as carrocerias são as sete canônicas dos anúncios", () => {
    expect(BODY_TYPE_OPTIONS.map((item) => item.value).sort()).toEqual(
      ["coupe", "hatch", "minivan", "picape", "sedan", "suv", "wagon"].sort()
    );
  });

  it("os três estados de exibição têm rótulo", () => {
    expect(DISPLAY_STATUS_LABEL).toEqual({
      active: "Ativa",
      closed: "Encerrada",
      expired: "Expirada",
    });
  });
});
