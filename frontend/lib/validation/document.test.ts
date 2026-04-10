import { describe, it, expect } from "vitest";
import {
  formatCpf,
  formatCnpj,
  formatBrazilianDocument,
  isValidBrazilianDocument,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "./document";

describe("document validation", () => {
  describe("onlyDigits", () => {
    it("remove não numéricos", () => {
      expect(onlyDigits("12.345.678/0001-90")).toBe("12345678000190");
    });

    it("handles empty and null-ish", () => {
      expect(onlyDigits("")).toBe("");
      expect(onlyDigits(null as unknown as string)).toBe("");
    });
  });

  describe("formatCpf", () => {
    it("aplica máscara completa", () => {
      expect(formatCpf("39053344705")).toBe("390.533.447-05");
    });

    it("aplica máscara parcial enquanto digita", () => {
      expect(formatCpf("390")).toBe("390");
      expect(formatCpf("3905")).toBe("390.5");
      expect(formatCpf("390533")).toBe("390.533");
      expect(formatCpf("3905334")).toBe("390.533.4");
      expect(formatCpf("390533447")).toBe("390.533.447");
      expect(formatCpf("3905334470")).toBe("390.533.447-0");
    });

    it("trunca em 11 dígitos", () => {
      expect(formatCpf("390533447059999")).toBe("390.533.447-05");
    });
  });

  describe("formatCnpj", () => {
    it("aplica máscara completa", () => {
      expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    });
  });

  describe("formatBrazilianDocument", () => {
    it("delega para CPF", () => {
      expect(formatBrazilianDocument("39053344705", "cpf")).toBe("390.533.447-05");
    });

    it("delega para CNPJ", () => {
      expect(formatBrazilianDocument("11222333000181", "cnpj")).toBe("11.222.333/0001-81");
    });
  });

  describe("isValidCpf", () => {
    it("aceita CPFs válidos com e sem máscara", () => {
      expect(isValidCpf("390.533.447-05")).toBe(true);
      expect(isValidCpf("39053344705")).toBe(true);
      expect(isValidCpf("529.982.247-25")).toBe(true);
      expect(isValidCpf("52998224725")).toBe(true);
    });

    it("rejeita sequências repetidas", () => {
      expect(isValidCpf("111.111.111-11")).toBe(false);
      expect(isValidCpf("000.000.000-00")).toBe(false);
      expect(isValidCpf("22222222222")).toBe(false);
      expect(isValidCpf("33333333333")).toBe(false);
      expect(isValidCpf("99999999999")).toBe(false);
    });

    it("rejeita dígitos verificadores errados", () => {
      expect(isValidCpf("12345678901")).toBe(false);
      expect(isValidCpf("39053344706")).toBe(false);
    });

    it("rejeita comprimento incorreto", () => {
      expect(isValidCpf("1234567890")).toBe(false);
      expect(isValidCpf("123456789012")).toBe(false);
      expect(isValidCpf("")).toBe(false);
    });
  });

  describe("isValidCnpj", () => {
    it("aceita CNPJs válidos", () => {
      expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
      expect(isValidCnpj("11222333000181")).toBe(true);
    });

    it("rejeita sequências repetidas", () => {
      expect(isValidCnpj("11111111111111")).toBe(false);
      expect(isValidCnpj("00000000000000")).toBe(false);
    });

    it("rejeita dígitos verificadores errados", () => {
      expect(isValidCnpj("11222333000182")).toBe(false);
    });

    it("rejeita comprimento incorreto", () => {
      expect(isValidCnpj("1122233300018")).toBe(false);
      expect(isValidCnpj("112223330001811")).toBe(false);
      expect(isValidCnpj("")).toBe(false);
    });
  });

  describe("isValidBrazilianDocument", () => {
    it("delega CPF por tipo", () => {
      expect(isValidBrazilianDocument("39053344705", "cpf")).toBe(true);
      expect(isValidBrazilianDocument("00000000000", "cpf")).toBe(false);
    });

    it("delega CNPJ por tipo", () => {
      expect(isValidBrazilianDocument("11222333000181", "cnpj")).toBe(true);
      expect(isValidBrazilianDocument("11111111111111", "cnpj")).toBe(false);
    });
  });
});
