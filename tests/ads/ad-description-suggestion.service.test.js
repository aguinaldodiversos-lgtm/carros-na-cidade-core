/**
 * Serviço da sugestão de descrição (Fase 4.5) — sem banco, sem rede.
 *
 * O que este ficheiro protege:
 *   • rascunho de OUTRO usuário é rejeitado (quando há anúncio real);
 *   • falha da IA vira erro operacional genérico — nunca vaza motivo interno
 *     nem devolve o template do orquestrador como se fosse texto gerado;
 *   • o guard roda DEPOIS do modelo, então saída suja não chega ao cliente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const generate = vi.fn();
const findOwnerContextById = vi.fn();

vi.mock("../../src/brain/index.js", () => ({
  getSharedAiOrchestrator: () => ({ generate }),
}));

vi.mock("../../src/modules/ads/ads.repository.js", () => ({
  findOwnerContextById: (...args) => findOwnerContextById(...args),
}));

vi.mock("../../src/shared/logger.js", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { generateDescriptionSuggestion, __testing } = await import(
  "../../src/modules/ads/description-suggestion/ad-description.service.js"
);

const USER = { id: "user-1", role: "user" };

function payload(over = {}) {
  return {
    brandLabel: "Jeep",
    modelLabel: "COMPASS",
    versionLabel: "LONGITUDE 2.0",
    yearModel: "2017",
    color: "Preto",
    fuel: "Diesel",
    mileage: "110000",
    vehicleOptionKeys: ["cambio_automatico", "tracao_4x4", "freios_abs", "airbag_duplo"],
    ...over,
  };
}

const TEXTO_BOM = [
  "Jeep Compass Longitude 2.0 2017, preto, diesel, câmbio automático e tração 4x4, com 110.000 km rodados.",
  "",
  "Em segurança, traz freios ABS e airbag duplo. A configuração combina mecânica diesel com tração nas quatro rodas.",
].join("\n");

function okResult(output = TEXTO_BOM) {
  return { ok: true, provider: "local", model: "test", latencyMs: 10, output };
}

beforeEach(() => {
  vi.clearAllMocks();
  findOwnerContextById.mockReset();
});

describe("posse do rascunho", () => {
  it("não consulta o banco quando não há adId (rascunho é localStorage)", async () => {
    generate.mockResolvedValue(okResult());
    await generateDescriptionSuggestion(USER, payload());
    expect(findOwnerContextById).not.toHaveBeenCalled();
  });

  it("rejeita anúncio de OUTRO usuário com 403", async () => {
    generate.mockResolvedValue(okResult());
    findOwnerContextById.mockResolvedValue({
      id: "ad-9",
      advertiser_user_id: "outro-usuario",
      status: "active",
    });

    await expect(
      generateDescriptionSuggestion(USER, payload({ adId: "ad-9" }))
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(generate).not.toHaveBeenCalled();
  });

  it("rejeita anúncio inexistente com 404 sem chamar a IA", async () => {
    findOwnerContextById.mockResolvedValue(null);

    await expect(
      generateDescriptionSuggestion(USER, payload({ adId: "nao-existe" }))
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(generate).not.toHaveBeenCalled();
  });

  it("aceita anúncio do próprio usuário", async () => {
    generate.mockResolvedValue(okResult());
    findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "user-1",
      status: "active",
    });

    const result = await generateDescriptionSuggestion(USER, payload({ adId: "ad-1" }));
    expect(result.text).toMatch(/Compass/);
  });
});

describe("falha da IA não quebra o passo de revisão", () => {
  const cenarios = [
    [
      "provedor caiu e voltou template",
      {
        ok: false,
        provider: "template",
        output: "Veículo em excelente estado. Documentação em dia.",
        error: "AI_FAILED",
      },
    ],
    [
      "template mesmo com ok:true",
      { ok: true, provider: "template", output: "Veículo em excelente estado." },
    ],
    ["saída vazia", { ok: true, provider: "local", output: "" }],
    ["saída não textual", { ok: true, provider: "local", output: { foo: 1 } }],
  ];

  for (const [nome, resultado] of cenarios) {
    it(`${nome} → 503 com mensagem genérica`, async () => {
      generate.mockResolvedValue(resultado);

      await expect(generateDescriptionSuggestion(USER, payload())).rejects.toMatchObject({
        statusCode: 503,
        message: __testing.GENERIC_FAILURE,
      });
    });
  }

  it("o template do orquestrador NUNCA vira sugestão", async () => {
    generate.mockResolvedValue({
      ok: false,
      provider: "template",
      output:
        "Veículo em excelente estado. Documentação em dia. Entre em contato para agendar uma visita.",
    });

    await expect(generateDescriptionSuggestion(USER, payload())).rejects.toThrow();
  });

  it("exceção do orquestrador vira erro operacional, não 500 cru", async () => {
    generate.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:11434 ollama"));

    const err = await generateDescriptionSuggestion(USER, payload()).catch((e) => e);

    expect(err.statusCode).toBe(503);
    expect(err.message).toBe(__testing.GENERIC_FAILURE);
    // Contrato do errorHandler (d463abee): detalhe interno só no log.
    expect(err.message).not.toMatch(/ECONNREFUSED|11434|ollama/i);
  });

  it("estouro do deadline vira 503 genérico", async () => {
    vi.useFakeTimers();
    generate.mockImplementation(() => new Promise(() => {}));

    const promise = generateDescriptionSuggestion(USER, payload()).catch((e) => e);
    await vi.advanceTimersByTimeAsync(__testing.DEADLINE_FOR_TEST ?? 15_000);
    const err = await promise;

    expect(err.statusCode).toBe(503);
    expect(err.message).toBe(__testing.GENERIC_FAILURE);
    vi.useRealTimers();
  });
});

describe("guard roda depois do modelo", () => {
  it("saída com preço e CTA é limpa antes de chegar ao cliente", async () => {
    generate.mockResolvedValue(
      okResult(
        [
          "Jeep Compass Longitude 2.0 2017, preto, diesel, câmbio automático e tração 4x4, com 110.000 km rodados.",
          "Em segurança, traz freios ABS e airbag duplo, o que cobre o essencial da categoria.",
          "Sai por R$ 94.900,00, abaixo da tabela FIPE.",
          "Entre em contato para agendar uma visita.",
        ].join(" ")
      )
    );

    const result = await generateDescriptionSuggestion(USER, payload());

    expect(result.text).not.toMatch(/R\$|FIPE|tabela/i);
    expect(result.text).not.toMatch(/contato|visita/i);
    expect(result.text).toMatch(/Compass/);
  });

  it("saída que cita opcional não marcado é rejeitada quando sobra pouco", async () => {
    generate.mockResolvedValue(okResult("Tem teto solar, couro e piloto automático."));

    await expect(generateDescriptionSuggestion(USER, payload())).rejects.toMatchObject({
      statusCode: 503,
      message: __testing.GENERIC_FAILURE,
    });
  });

  it("trunca em 1000 caracteres (limite do campo)", async () => {
    const frase =
      "Jeep Compass Longitude 2.0 2017, preto, diesel, câmbio automático e tração 4x4 com 110.000 km rodados. ";
    generate.mockResolvedValue(okResult(frase.repeat(30)));

    const result = await generateDescriptionSuggestion(USER, payload());
    expect(result.text.length).toBeLessThanOrEqual(1000);
    expect(result.meta.chars).toBe(result.text.length);
  });
});

describe("ficha magra", () => {
  it("sem marca nem modelo devolve 422 sem gastar chamada de IA", async () => {
    await expect(generateDescriptionSuggestion(USER, { mileage: "50000" })).rejects.toMatchObject({
      statusCode: 422,
    });

    expect(generate).not.toHaveBeenCalled();
  });
});

describe("contrato enviado ao orquestrador", () => {
  it("usa a task dedicada e nunca manda preço nem cidade", async () => {
    generate.mockResolvedValue(okResult());

    await generateDescriptionSuggestion(
      USER,
      payload({ price: "R$ 94.900,00", city: "Atibaia", whatsapp: "11999999999" })
    );

    const arg = generate.mock.calls[0][0];
    expect(arg.task).toBe("ad_description_suggestion");
    expect(arg.context.userId).toBe("user-1");

    const serialized = JSON.stringify(arg.input);
    expect(serialized).not.toMatch(/94\.?900|R\$|Atibaia|11999999999/);
  });
});
