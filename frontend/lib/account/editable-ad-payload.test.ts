import { describe, expect, it } from "vitest";

import { pickEditablePayload } from "./editable-ad-payload";

/**
 * REGRESSÃO 2026-07-27 — a whitelist descartava `transmission` e `body_type`
 * em silêncio. O `EditAdForm` enviava os dois e o backend os aceitava; só esta
 * lista no meio não repassava. O lojista salvava, via "sucesso", e a coluna
 * ficava congelada no valor da criação — 14 de 19 anúncios ativos acabaram com
 * coluna e opcional divergentes, exibindo um câmbio e filtrando por outro.
 *
 * Os testes cobrem o CONTRATO (o que passa, o que não passa, e a diferença
 * entre ausente e limpar), não a lista literal.
 */

describe("pickEditablePayload — câmbio e carroceria", () => {
  it("repassa transmission e body_type (o bug)", () => {
    expect(pickEditablePayload({ transmission: "Automático", body_type: "Hatch" })).toEqual({
      transmission: "Automático",
      body_type: "Hatch",
    });
  });

  it("distingue AUSENTE (não mexer) de null/vazio (limpar)", () => {
    // Ausente: a chave nem aparece no payload → backend não toca na coluna.
    expect(pickEditablePayload({ title: "x" })).not.toHaveProperty("transmission");
    expect(pickEditablePayload({ title: "x" })).not.toHaveProperty("body_type");

    // Presente e vazio: chega como null → limpeza explícita. Sem isso o
    // lojista não teria como desfazer um valor errado.
    expect(pickEditablePayload({ transmission: null })).toEqual({ transmission: null });
    expect(pickEditablePayload({ transmission: "" })).toEqual({ transmission: null });
    expect(pickEditablePayload({ transmission: "   " })).toEqual({ transmission: null });
    expect(pickEditablePayload({ body_type: null })).toEqual({ body_type: null });
  });

  it("apara espaços do rótulo", () => {
    expect(pickEditablePayload({ transmission: "  CVT  " })).toEqual({ transmission: "CVT" });
  });

  it("valor não-string vira null em vez de vazar tipo errado ao backend", () => {
    expect(pickEditablePayload({ transmission: 42 })).toEqual({ transmission: null });
    expect(pickEditablePayload({ body_type: { a: 1 } })).toEqual({ body_type: null });
  });
});

describe("pickEditablePayload — contrato geral", () => {
  it("repassa os campos de conteúdo", () => {
    const out = pickEditablePayload({
      title: "Fiat Pulse",
      description: "texto",
      price: "93900",
      mileage: "12000",
      vehicle_options: ["freios_abs"],
    });
    expect(out).toEqual({
      title: "Fiat Pulse",
      description: "texto",
      price: 93900,
      mileage: 12000,
      vehicle_options: ["freios_abs"],
    });
  });

  it("NÃO repassa campo estrutural nem status (backend recusaria, mas o contrato é explícito)", () => {
    const out = pickEditablePayload({
      brand: "Fiat",
      model: "Pulse",
      year: 2024,
      city: "Atibaia",
      state: "SP",
      status: "active",
      advertiser_id: 999,
      slug: "hackeado",
      images: ["https://evil/x.webp"],
    });
    expect(out).toEqual({});
  });

  it("vehicle_options aceita array e objeto agrupado; lista vazia LIMPA", () => {
    expect(pickEditablePayload({ vehicle_options: [] })).toEqual({ vehicle_options: [] });
    expect(pickEditablePayload({ vehicle_options: { safety: ["freios_abs"] } })).toEqual({
      vehicle_options: { safety: ["freios_abs"] },
    });
  });

  it("entrada inválida não quebra", () => {
    expect(pickEditablePayload(null)).toEqual({});
    expect(pickEditablePayload("string")).toEqual({});
    expect(pickEditablePayload(undefined)).toEqual({});
  });

  /**
   * Guarda contra a próxima omissão: todo campo que o EditAdForm envia tem que
   * sobreviver à whitelist. Se alguém adicionar um campo ao formulário e
   * esquecer daqui, este teste falha em vez de o lojista descobrir salvando.
   */
  it("todo campo do EditAdForm sobrevive à whitelist", () => {
    // Espelha o payload montado em EditAdForm.handleSubmit.
    const doFormulario = {
      title: "Fiat Pulse Drive",
      description: "desc",
      price: 93900,
      transmission: "Automático",
      body_type: "Hatch",
      vehicle_options: ["freios_abs", "cambio_automatico"],
      mileage: 12000,
    };

    const out = pickEditablePayload(doFormulario) as Record<string, unknown>;
    for (const campo of Object.keys(doFormulario)) {
      expect(out, `campo "${campo}" do formulário é descartado pela whitelist`).toHaveProperty(
        campo
      );
    }
  });
});
