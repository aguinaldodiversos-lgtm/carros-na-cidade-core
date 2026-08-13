// Normalização de número para link de WhatsApp (Fase 3.1).
//
// O resultado desta função vira uma URL que uma PESSOA vai clicar. Um número
// errado aqui não dá erro em lugar nenhum: abre o WhatsApp numa conversa que
// não existe, e o comprador fica esperando resposta de um número inventado.
// Por isso o contrato é celular brasileiro completo ou `null` — nunca chute.

import { describe, expect, it } from "vitest";

import {
  normalizeBrazilPhoneDigits,
  normalizeWhatsappDigits,
} from "../../src/shared/utils/brPhone.js";

const EXPECTED = "5511999999999";

describe("normalizeWhatsappDigits — formatos que os lojistas realmente digitam", () => {
  it("aceita as quatro grafias do §37 sem duplicar o DDI", () => {
    // O caso que motiva o teste é o segundo: com um `55` cego na frente,
    // "+55 (11) 99999-9999" viraria "555511999999999" e o link não abriria.
    for (const input of [
      "(11) 99999-9999",
      "+55 (11) 99999-9999",
      "55 11 99999-9999",
      "11 99999-9999",
    ]) {
      expect(normalizeWhatsappDigits(input), `entrada: ${input}`).toBe(EXPECTED);
    }
  });

  it("limpa espaços, parênteses, hífen, ponto e sinal de mais", () => {
    for (const input of [
      "11999999999",
      "11 9 9999-9999",
      "  (11)   99999 . 9999  ",
      "+5511999999999",
      "+55 11 9 9999 9999",
    ]) {
      expect(normalizeWhatsappDigits(input), `entrada: ${input}`).toBe(EXPECTED);
    }
  });

  it("aceita fixo com 8 dígitos (DDD + 8) — ainda é WhatsApp Business válido", () => {
    expect(normalizeWhatsappDigits("(11) 3333-4444")).toBe("551133334444");
    expect(normalizeWhatsappDigits("+55 11 3333-4444")).toBe("551133334444");
  });

  it("descarta o zero de discagem interurbana", () => {
    expect(normalizeWhatsappDigits("011 99999-9999")).toBe(EXPECTED);
    expect(normalizeWhatsappDigits("0 11 99999-9999")).toBe(EXPECTED);
  });

  it("recusa o que não é número brasileiro completo", () => {
    for (const input of [
      null,
      undefined,
      "",
      "   ",
      "abc",
      "-",
      "()",
      "99999999", // sem DDD
      "999999999", // 9 dígitos, sem DDD
      "1", // lixo
      "5511", // só DDI + DDD
      "551199999999999999", // longo demais
    ]) {
      expect(normalizeWhatsappDigits(input), `entrada: ${JSON.stringify(input)}`).toBeNull();
    }
  });

  it("um 55 que NÃO é DDI não é confundido com DDI", () => {
    // "55 9999-9999" é um telefone de Santa Maria/RS (DDD 55), com 10 dígitos.
    // Começa com "55", mas o que sobra tem 8 dígitos — não 10 nem 11 — então a
    // regra do DDI não se aplica e o número recebe o 55 na frente.
    expect(normalizeWhatsappDigits("(55) 9999-9999")).toBe("555599999999");
    // E o celular do mesmo DDD, com 9 dígitos.
    expect(normalizeWhatsappDigits("(55) 99999-9999")).toBe("5555999999999");
  });

  it("não altera o dado de origem — devolve string nova", () => {
    const input = "(11) 99999-9999";
    const copy = String(input);
    normalizeWhatsappDigits(input);
    expect(input).toBe(copy);
  });
});

describe("normalizeWhatsappDigits vs normalizeBrazilPhoneDigits", () => {
  it("as duas concordam no caminho feliz", () => {
    for (const input of ["(11) 99999-9999", "+55 11 99999-9999", "11999999999"]) {
      expect(normalizeWhatsappDigits(input)).toBe(normalizeBrazilPhoneDigits(input));
    }
  });

  it("mas SÓ a de WhatsApp recusa número incompleto", () => {
    // É exatamente esta diferença que justifica as duas existirem. A de
    // ingestão guarda "99999999" porque um dado parcial ainda é registro; a de
    // WhatsApp o recusa porque `wa.me/5599999999` abre uma conversa fantasma.
    expect(normalizeBrazilPhoneDigits("99999999")).toBe("5599999999");
    expect(normalizeWhatsappDigits("99999999")).toBeNull();
  });
});
