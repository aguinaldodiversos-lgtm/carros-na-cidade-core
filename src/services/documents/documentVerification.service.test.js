import { describe, expect, it } from "vitest";
import { validateCPF, validateCNPJ, verifyDocument } from "./documentVerification.service.js";

describe("documentVerification.service", () => {
  describe("validateCPF", () => {
    it("aceita CPF com dígitos verificadores corretos", () => {
      expect(validateCPF("52998224725")).toBe(true);
      expect(validateCPF("529.982.247-25")).toBe(true);
    });

    it("rejeita sequência repetida e dígitos errados", () => {
      expect(validateCPF("11111111111")).toBe(false);
      expect(validateCPF("52998224724")).toBe(false);
    });
  });

  describe("validateCNPJ", () => {
    it("aceita CNPJ com dígitos verificadores corretos", () => {
      expect(validateCNPJ("26263257000120")).toBe(true);
      expect(validateCNPJ("26.263.257/0001-20")).toBe(true);
    });

    it("rejeita sequência repetida e dígitos errados", () => {
      expect(validateCNPJ("11111111111111")).toBe(false);
      expect(validateCNPJ("26263257000121")).toBe(false);
    });
  });

  describe("verifyDocument", () => {
    it("valida cpf e cnpj via API assíncrona", async () => {
      await expect(verifyDocument({ type: "cpf", number: "52998224725" })).resolves.toEqual({
        valid: true,
      });

      await expect(verifyDocument({ type: "cnpj", number: "26263257000120" })).resolves.toEqual({
        valid: true,
        company_name: null,
      });

      await expect(verifyDocument({ type: "cpf", number: "11111111111" })).resolves.toEqual({
        valid: false,
      });

      await expect(verifyDocument({ type: "nope", number: "52998224725" })).resolves.toEqual({
        valid: false,
      });
    });
  });
});
