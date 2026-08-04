/**
 * Guard e ficha da sugestão de descrição (Fase 4.5).
 *
 * O teste central é o primeiro bloco: nenhum item NÃO MARCADO pode sobreviver
 * na saída. É o que separa "descrição que cita os dados reais do veículo" de
 * "propaganda enganosa assinada pelo domínio da plataforma".
 */

import { describe, it, expect } from "vitest";

import { buildDescriptionFacts } from "../../src/modules/ads/description-suggestion/ad-description.facts.js";
import {
  guardDescription,
  findViolation,
  stripFormatting,
  normalizeForMatch,
  DESCRIPTION_MAX_CHARS,
  __testing,
} from "../../src/modules/ads/description-suggestion/ad-description.guard.js";

/** Rascunho do print do briefing: Jeep Compass 2017 diesel automático. */
function compassPayload(over = {}) {
  return {
    brandLabel: "Jeep",
    modelLabel: "COMPASS",
    versionLabel: "LONGITUDE 2.0 4x4 Dies. 16V Aut.",
    yearModel: "2017",
    yearManufacture: "2017",
    color: "Preto",
    fuel: "Diesel",
    transmission: "Automático",
    bodyStyle: "SUV",
    mileage: "110000",
    vehicleOptionKeys: [
      "cambio_automatico",
      "tracao_4x4",
      "ar_condicionado_digital",
      "bancos_couro",
      "freios_abs",
      "airbag_duplo",
      "chave_reserva",
    ],
    ...over,
  };
}

function ctxFor(payload) {
  const { declaredVocabulary, selectedKeys } = buildDescriptionFacts(payload);
  return { declaredVocabulary, selectedKeys };
}

describe("guard — item não marcado (teste central)", () => {
  it("derruba frase que cita opcional que o anunciante não marcou", () => {
    const ctx = ctxFor(compassPayload());
    const raw = [
      "Jeep Compass Longitude 2.0 2017, preto, câmbio automático e tração 4x4, com 110.000 km rodados.",
      "Traz ar-condicionado digital, bancos em couro, freios ABS e airbag duplo, além de chave reserva.",
      "Conta também com teto solar e piloto automático.",
    ].join(" ");

    const result = guardDescription(raw, ctx);

    expect(result.ok).toBe(true);
    expect(result.text).not.toMatch(/teto solar/i);
    expect(result.text).not.toMatch(/piloto autom/i);
    expect(result.text).toMatch(/Compass/);
    expect(result.text).toMatch(/bancos em couro/i);
    expect(result.droppedSentences).toBe(1);
  });

  it("'de entrada' (versão de entrada) não é confundido com entrada de pagamento", () => {
    const ctx = ctxFor(compassPayload());
    expect(findViolation("A Longitude fica acima da Sport de entrada.", ctx)).toBeNull();
    expect(findViolation("Entrada de R$ 20.000 e o resto financiado.", ctx)?.reason).toBe("preco");
    expect(findViolation("Saia com ela sem entrada.", ctx)?.reason).toBe("preco");
  });

  it("mantém o opcional que FOI marcado", () => {
    const ctx = ctxFor(compassPayload());
    const raw =
      "Jeep Compass Longitude 2017, preto, câmbio automático e tração 4x4. Traz ar-condicionado digital, bancos em couro, freios ABS e airbag duplo, além de chave reserva.";

    const result = guardDescription(raw, ctx);

    expect(result.ok).toBe(true);
    expect(result.droppedSentences).toBe(0);
    expect(result.text).toMatch(/ar-condicionado digital/i);
    expect(result.text).toMatch(/bancos em couro/i);
    expect(result.text).toMatch(/freios ABS/i);
    expect(result.text).toMatch(/chave reserva/i);
  });

  it("não confunde superstring: 'Ar-condicionado digital' marcado não dispara 'Ar-condicionado' não marcado", () => {
    const payload = compassPayload({
      vehicleOptionKeys: ["ar_condicionado_digital"],
    });
    const violation = findViolation("Traz ar-condicionado digital de série.", ctxFor(payload));
    expect(violation).toBeNull();
  });

  it("pega a variante curta que a varredura de rótulo exato não pegaria (ABS solto)", () => {
    const payload = compassPayload({ vehicleOptionKeys: ["bancos_couro"] });
    const violation = findViolation("Tem ABS e bancos em couro.", ctxFor(payload));
    expect(violation).not.toBeNull();
    expect(violation.reason).toBe("opcional");
  });

  it("'câmbio manual' do campo transmission é dado declarado, não invenção", () => {
    const payload = compassPayload({
      transmission: "Manual",
      vehicleOptionKeys: [],
    });
    const violation = findViolation("Hyundai HB20 2025, prata, câmbio manual.", ctxFor(payload));
    expect(violation).toBeNull();
  });
});

describe("guard — proibições de estilo", () => {
  const ctx = ctxFor(compassPayload());

  const cases = [
    ["preço em reais", "O valor é de R$ 94.900,00 à vista.", "preco"],
    ["preço por extenso", "Sai por noventa mil reais, com desconto.", "preco"],
    ["FIPE", "Está bem abaixo da tabela FIPE.", "fipe"],
    ["urgência", "Aproveite antes que seja vendido.", "urgencia"],
    ["CTA", "Entre em contato para agendar uma visita.", "cta"],
    ["test drive", "Agende seu test drive sem compromisso.", "cta"],
    ["elogio vazio", "Carro impecável, muito bonito e moderno.", "elogio"],
    ["estado não declarado", "Veículo em excelente estado de conservação.", "elogio"],
    ["doc em dia", "Documentação em dia e sem multas.", "fato_inventado"],
    ["nunca bateu", "Nunca bateu, sem detalhes na lataria.", "fato_inventado"],
    ["consumo numérico", "Faz 14 km/l na estrada com facilidade.", "consumo"],
    ["nome de loja", "Confira no nosso estoque, a nossa loja tem garantia.", "cta"],
    ["troca", "Aceita troca e financiamento em até 60x.", "preco"],
  ];

  for (const [nome, frase, motivo] of cases) {
    it(`reprova ${nome}`, () => {
      const violation = findViolation(frase, ctx);
      expect(violation, `esperava violação em: ${frase}`).not.toBeNull();
      expect(violation.reason).toBe(motivo);
    });
  }

  it("o texto final sai sem preço, FIPE, CTA e elogio", () => {
    const raw = [
      "Jeep Compass Longitude 2017, preto, câmbio automático, tração 4x4, 110.000 km.",
      "Traz ar-condicionado digital, bancos em couro, freios ABS e airbag duplo.",
      "",
      "Está abaixo da tabela FIPE por R$ 94.900,00. Carro impecável, aproveite!",
      "Entre em contato para agendar uma visita.",
    ].join("\n");

    const result = guardDescription(raw, ctx);

    expect(result.ok).toBe(true);
    expect(result.text).not.toMatch(/R\$|fipe|tabela/i);
    expect(result.text).not.toMatch(/impecável|aproveite/i);
    expect(result.text).not.toMatch(/contato|visita|agendar/i);
    expect(result.text).toMatch(/Compass/);
  });
});

describe("guard — fatos que só são permitidos quando declarados", () => {
  it("'único dono' é reprovado quando a caixa não está marcada", () => {
    const ctx = ctxFor(compassPayload());
    const violation = findViolation("Veículo de único dono.", ctx);
    expect(violation?.reason).toBe("dono");
  });

  it("'único dono' passa quando a caixa ESTÁ marcada", () => {
    const payload = compassPayload({
      vehicleOptionKeys: [...compassPayload().vehicleOptionKeys, "unico_dono"],
    });
    const violation = findViolation("Veículo de único dono.", ctxFor(payload));
    expect(violation).toBeNull();
  });

  it("'revisões' é reprovado sem a caixa e passa com ela", () => {
    expect(findViolation("Todas as revisões feitas.", ctxFor(compassPayload()))?.reason).toBe(
      "revisao"
    );

    const comRevisao = compassPayload({
      vehicleOptionKeys: ["todas_revisoes_feitas"],
    });
    expect(findViolation("Todas as revisões feitas.", ctxFor(comRevisao))).toBeNull();
  });

  it("'laudo cautelar' é reprovado sem a caixa", () => {
    expect(findViolation("Com laudo cautelar aprovado.", ctxFor(compassPayload()))?.reason).toBe(
      "laudo"
    );
  });
});

describe("guard — formatação", () => {
  it("remove markdown, títulos e bullets", () => {
    const raw = [
      "## Jeep Compass",
      "**Jeep Compass Longitude 2017**, preto, câmbio automático e tração 4x4 com 110.000 km rodados.",
      "- ar-condicionado digital",
      "- bancos em couro",
    ].join("\n");

    const cleaned = stripFormatting(raw);
    expect(cleaned).not.toMatch(/[*#]/);
    expect(cleaned).not.toMatch(/^-\s/m);
    expect(cleaned).toMatch(/Jeep Compass Longitude 2017/);
  });

  it("remove aspas que envolvem a resposta inteira", () => {
    const cleaned = stripFormatting('"Jeep Compass Longitude 2017, preto."');
    expect(cleaned).toBe("Jeep Compass Longitude 2017, preto.");
  });

  it("trunca em 1000 caracteres sem partir palavra", () => {
    const frase =
      "Jeep Compass Longitude 2017, preto, câmbio automático e tração 4x4 com 110.000 km rodados. ";
    const result = guardDescription(frase.repeat(30), ctxFor(compassPayload()));

    expect(result.ok).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS);
    expect(result.text).not.toMatch(/\s$/);
  });

  it("normalizeForMatch tira acento e hífen", () => {
    expect(normalizeForMatch("Ar-Condicionado Automático")).toBe("ar condicionado automatico");
    expect(normalizeForMatch("Direção elétrica")).toBe("direcao eletrica");
  });
});

describe("guard — regressões de quebra de frase e de moeda", () => {
  const ctx = ctxFor(compassPayload());

  it("não parte número decimal nem milhar ao remontar o texto", () => {
    const raw =
      "Jeep Compass Longitude 2.0 2017, preto, câmbio automático e tração 4x4, com 110.000 km rodados. Traz freios ABS e airbag duplo de série no conjunto.";

    const result = guardDescription(raw, ctx);

    expect(result.ok).toBe(true);
    // A versão ingênua devolvia "2. 0" e "110. 000".
    expect(result.text).toMatch(/2\.0/);
    expect(result.text).toMatch(/110\.000/);
    expect(result.text).not.toMatch(/\d\.\s\d/);
  });

  it("não quebra em abreviação seguida de número", () => {
    const frases = __testing.splitSentences(
      "Jeep Compass Longitude 2.0 4x4 Dies. 16V Aut. 2017 em bom acabamento."
    );
    expect(frases).toHaveLength(1);
  });

  it("pega 'R$' mesmo sem outra palavra de preço na frase", () => {
    // A normalização apaga o cifrão, então este caso só é detectável no texto
    // cru — era um buraco real antes do RAW_BANS.
    expect(findViolation("Sai por R$ 94.900,00.", ctx)?.reason).toBe("preco");
    expect(findViolation("Fica em 94.900,00 fechado.", ctx)?.reason).toBe("preco");
    expect(findViolation("Saindo por 90 mil reais.", ctx)?.reason).toBe("preco");
  });

  it("110.000 km não é confundido com dinheiro", () => {
    expect(findViolation("Está com 110.000 km rodados.", ctx)).toBeNull();
  });
});

describe("guard — recusa em vez de devolver fragmento", () => {
  it("reprova quando sobra pouco texto depois do filtro", () => {
    const result = guardDescription(
      "Carro impecável. Aproveite. Entre em contato.",
      ctxFor(compassPayload())
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_short_after_guard");
  });

  it("reprova entrada vazia", () => {
    expect(guardDescription("", ctxFor(compassPayload())).ok).toBe(false);
    expect(guardDescription(null, ctxFor(compassPayload())).ok).toBe(false);
  });
});

describe("ficha — allowlist estrita", () => {
  it("ignora preço mesmo se o cliente mandar", () => {
    const { facts } = buildDescriptionFacts(
      compassPayload({ price: "R$ 94.900,00", fipeValue: "R$ 90.000,00" })
    );
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toMatch(/94\.?900|90\.?000|R\$/);
  });

  it("ignora cidade e telefone", () => {
    const { facts } = buildDescriptionFacts(
      compassPayload({ city: "Atibaia", state: "SP", whatsapp: "11999999999" })
    );
    const serialized = JSON.stringify(facts);
    expect(serialized).not.toMatch(/Atibaia|11999999999/);
  });

  it("descarta key fora do catálogo", () => {
    const { selectedKeys } = buildDescriptionFacts(
      compassPayload({ vehicleOptionKeys: ["cambio_automatico", "banho_de_ouro", ""] })
    );
    expect(selectedKeys).toContain("cambio_automatico");
    expect(selectedKeys).not.toContain("banho_de_ouro");
  });

  it("suprime 'Preço competitivo em relação à FIPE' mesmo marcado", () => {
    const { facts, selectedKeys } = buildDescriptionFacts(
      compassPayload({ vehicleOptionKeys: ["preco_competitivo_fipe", "freios_abs"] })
    );
    expect(selectedKeys).not.toContain("preco_competitivo_fipe");
    expect(JSON.stringify(facts)).not.toMatch(/FIPE/i);
  });

  it("separa ficha, avulsos, categorias e condição declarada", () => {
    const { facts } = buildDescriptionFacts(
      compassPayload({
        vehicleOptionKeys: [
          "cambio_automatico",
          "tracao_4x4",
          "manual_proprietario",
          "chave_reserva",
          "laudo_cautelar_aprovado",
          "freios_abs",
          "ar_condicionado_digital",
          "start_stop",
          "motor_revisado",
        ],
      })
    );

    expect(facts.ficha.cambio).toBe("Câmbio automático");
    expect(facts.ficha.tracao).toBe("Tração 4x4");
    expect(facts.itensAvulsos).toEqual([
      "Manual do proprietário",
      "Chave reserva",
      "Laudo cautelar aprovado",
    ]);
    expect(facts.seguranca).toContain("Freios ABS");
    expect(facts.conforto).toContain("Ar-condicionado digital");
    expect(facts.dirigibilidade).toContain("Start-stop");
    expect(facts.condicaoDeclarada).toContain("Motor revisado");
    // Câmbio/tração/avulsos não se repetem entre os baldes.
    expect(facts.dirigibilidade).not.toContain("Câmbio automático");
    expect(facts.seguranca).not.toContain("Laudo cautelar aprovado");
  });

  it("omite ano de fabricação igual ao ano modelo", () => {
    const { facts } = buildDescriptionFacts(compassPayload());
    expect(facts.ficha.anoFabricacao).toBeUndefined();

    const { facts: outro } = buildDescriptionFacts(compassPayload({ yearManufacture: "2016" }));
    expect(outro.ficha.anoFabricacao).toBe(2016);
  });

  it("marca ficha magra quando não há marca nem modelo", () => {
    expect(buildDescriptionFacts({ mileage: "50000" }).isTooThin).toBe(true);
    expect(buildDescriptionFacts(compassPayload()).isTooThin).toBe(false);
  });

  it("poucos campos: ficha curta e sem invenção", () => {
    const { facts, selectedKeys } = buildDescriptionFacts({
      brandLabel: "Fiat",
      modelLabel: "UNO",
      yearModel: "2012",
    });

    expect(selectedKeys).toEqual([]);
    expect(facts.ficha).toEqual({ marca: "Fiat", modelo: "UNO", ano: 2012 });
    expect(facts.seguranca).toBeUndefined();
    expect(facts.conforto).toBeUndefined();
    expect(facts.itensAvulsos).toBeUndefined();
  });

  it("higieniza texto do formulário (markdown, cifrão, tamanho)", () => {
    const { facts } = buildDescriptionFacts({
      brandLabel: "  Jeep  ",
      modelLabel: "**COMPASS**",
      versionLabel: "R$ LONGITUDE",
      color: "x".repeat(200),
    });
    expect(facts.ficha.marca).toBe("Jeep");
    expect(facts.ficha.modelo).toBe("COMPASS");
    expect(facts.ficha.versao).toBe("LONGITUDE");
    expect(facts.ficha.cor.length).toBeLessThanOrEqual(80);
  });

  it("rejeita quilometragem e ano absurdos", () => {
    const { facts } = buildDescriptionFacts(
      compassPayload({ mileage: "99999999", yearModel: "1500" })
    );
    expect(facts.ficha.quilometragem).toBeUndefined();
    expect(facts.ficha.ano).toBeUndefined();
  });
});

describe("exemplo do briefing — HB20 Sense Plus", () => {
  const payload = {
    brandLabel: "Hyundai",
    modelLabel: "HB20",
    versionLabel: "Sense Plus",
    yearModel: "2025",
    color: "Prata",
    transmission: "Manual",
    vehicleOptionKeys: [
      "cambio_manual",
      "tracao_dianteira",
      "motor_revisado",
      "baixo_consumo",
      "airbag_duplo",
      "freios_abs",
      "isofix",
      "alarme",
      "desembacador_traseiro",
      "limpador_traseiro",
      "ar_condicionado",
      "direcao_eletrica",
      "vidros_eletricos_dianteiros",
      "travas_eletricas",
      "volante_multifuncional",
      "banco_motorista_regulagem_altura",
      "painel_digital",
      "computador_bordo",
      "som_original_fabrica",
      "entrada_usb",
      "manual_proprietario",
      "chave_reserva",
      "laudo_cautelar_aprovado",
    ],
  };

  it("a saída-alvo do briefing passa inteira pelo guard", () => {
    const saidaEsperada = [
      "Hyundai HB20 Sense Plus 2025, prata, câmbio manual, tração dianteira. Acompanha manual do proprietário e chave reserva, com laudo cautelar aprovado.",
      "",
      "Em segurança, traz airbag duplo, freios ABS, fixação Isofix para cadeirinha, alarme, desembaçador e limpador traseiro. No conforto, ar-condicionado, direção elétrica, vidros e travas elétricas, volante multifuncional, banco do motorista com regulagem de altura, painel digital, computador de bordo, som de fábrica e entrada USB.",
      "",
      "A Sense Plus fica acima da Sense de entrada, e o painel digital com volante multifuncional é o que a distingue na linha. Motor revisado.",
    ].join("\n");

    const result = guardDescription(saidaEsperada, ctxFor(payload));

    expect(result.ok).toBe(true);
    expect(result.droppedSentences).toBe(0);
    expect(result.text.length).toBeGreaterThanOrEqual(400);
  });
});
