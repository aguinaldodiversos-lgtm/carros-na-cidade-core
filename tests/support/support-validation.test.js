import { describe, it, expect } from "vitest";
import {
  parseTicketId,
  validateBody,
  validateCategory,
  validateStatus,
  validateSubject,
} from "../../src/modules/support/support.validation.js";
import { escapeHtml } from "../../src/services/email.service.js";

describe("support.validation — validateSubject", () => {
  it("aceita e faz trim de assunto válido", () => {
    expect(validateSubject("  Preciso de ajuda  ")).toBe("Preciso de ajuda");
  });

  it("rejeita assunto curto (<3) e longo (>120)", () => {
    expect(() => validateSubject("ab")).toThrowError();
    expect(() => validateSubject("a".repeat(121))).toThrowError();
    expect(() => validateSubject("   ")).toThrowError();
    expect(() => validateSubject(undefined)).toThrowError();
  });

  it("erros de validação são 400", () => {
    try {
      validateSubject("x");
      throw new Error("deveria ter lançado");
    } catch (err) {
      expect(err.statusCode).toBe(400);
    }
  });
});

describe("support.validation — validateBody", () => {
  it("aceita e faz trim de corpo válido", () => {
    expect(validateBody("  olá  ")).toBe("olá");
  });

  it("rejeita corpo vazio e acima de 5000", () => {
    expect(() => validateBody("   ")).toThrowError();
    expect(() => validateBody("a".repeat(5001))).toThrowError();
  });
});

describe("support.validation — validateCategory", () => {
  it("retorna null quando ausente/vazia (opcional)", () => {
    expect(validateCategory(undefined)).toBe(null);
    expect(validateCategory("")).toBe(null);
    expect(validateCategory("   ")).toBe(null);
  });

  it("normaliza e aceita categoria da lista", () => {
    expect(validateCategory("Plano")).toBe("plano");
    expect(validateCategory("PAGAMENTO")).toBe("pagamento");
  });

  it("rejeita categoria fora da lista", () => {
    expect(() => validateCategory("hacking")).toThrowError();
  });
});

describe("support.validation — validateStatus", () => {
  it("aceita os três status válidos", () => {
    expect(validateStatus("aberto")).toBe("aberto");
    expect(validateStatus("em_andamento")).toBe("em_andamento");
    expect(validateStatus("resolvido")).toBe("resolvido");
  });

  it("rejeita status inválido", () => {
    expect(() => validateStatus("fechado")).toThrowError();
    expect(() => validateStatus("")).toThrowError();
  });
});

describe("support.validation — parseTicketId", () => {
  it("converte id positivo", () => {
    expect(parseTicketId("42")).toBe(42);
    expect(parseTicketId(7)).toBe(7);
  });

  it("id inválido é 404 (não vaza)", () => {
    for (const bad of ["0", "-1", "abc", "", null, undefined]) {
      try {
        parseTicketId(bad);
        throw new Error(`deveria ter lançado para ${String(bad)}`);
      } catch (err) {
        expect(err.statusCode).toBe(404);
      }
    }
  });
});

describe("email.service — escapeHtml (segurança de conteúdo)", () => {
  it("escapa caracteres perigosos de HTML", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeHtml("a & b")).toBe("a &amp; b");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("lida com valores nulos/indefinidos sem quebrar", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });
});
