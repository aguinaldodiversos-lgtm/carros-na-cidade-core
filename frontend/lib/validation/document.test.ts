import { describe, it, expect } from "vitest";
import {
  formatCpf,
  isValidBrazilianDocument,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "./document";

describe("document validation", () => {
  it("onlyDigits remove não numéricos", () => {
    expect(onlyDigits("12.345.678/0001-90")).toBe("12345678000190");
  });

  it("formatCpf aplica máscara", () => {
    expect(formatCpf("39053344705")).toBe("390.533.447-05");
  });

  it("isValidCpf: CPF válido", () => {
    expect(isValidCpf("390.533.447-05")).toBe(true);
    expect(isValidCpf("39053344705")).toBe(true);
  });

  it("isValidCpf: rejeita repetidos e dígitos errados", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("12345678901")).toBe(false);
  });

  it("isValidCnpj: exemplo válido", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("isValidBrazilianDocument delega por tipo", () => {
    expect(isValidBrazilianDocument("39053344705", "cpf")).toBe(true);
    expect(isValidBrazilianDocument("11222333000181", "cnpj")).toBe(true);
  });
});
