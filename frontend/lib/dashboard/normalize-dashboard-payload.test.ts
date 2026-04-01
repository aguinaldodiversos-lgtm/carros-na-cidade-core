import { describe, expect, it } from "vitest";
import { normalizeDashboardUserType } from "./normalize-dashboard-payload";

describe("normalizeDashboardUserType", () => {
  it("preserva CPF, CNPJ e pending canônicos", () => {
    expect(normalizeDashboardUserType("CPF")).toBe("CPF");
    expect(normalizeDashboardUserType("CNPJ")).toBe("CNPJ");
    expect(normalizeDashboardUserType("pending")).toBe("pending");
  });

  it("normaliza caixa e mapeia desconhecido para pending (conta mínima)", () => {
    expect(normalizeDashboardUserType("cpf")).toBe("CPF");
    expect(normalizeDashboardUserType("cnpj")).toBe("CNPJ");
    expect(normalizeDashboardUserType("")).toBe("pending");
    expect(normalizeDashboardUserType(null)).toBe("pending");
  });
});
