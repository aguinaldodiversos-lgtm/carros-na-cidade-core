import { describe, it, expect } from "vitest";
import {
  getDefaultDashboardRedirect,
  sanitizeInternalRedirect,
  resolvePostLoginRedirect,
} from "./redirects";

describe("getDefaultDashboardRedirect", () => {
  it("routes CNPJ to /dashboard-loja", () => {
    expect(getDefaultDashboardRedirect("CNPJ")).toBe("/dashboard-loja");
  });

  it("routes CPF to /dashboard", () => {
    expect(getDefaultDashboardRedirect("CPF")).toBe("/dashboard");
  });

  it("routes pending to /dashboard", () => {
    expect(getDefaultDashboardRedirect("pending")).toBe("/dashboard");
  });
});

describe("sanitizeInternalRedirect", () => {
  it("accepts valid internal paths (com query preservada)", () => {
    expect(sanitizeInternalRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/anunciar/novo")).toBe("/anunciar/novo");
    expect(sanitizeInternalRedirect("/anunciar/novo?tipo=lojista")).toBe(
      "/anunciar/novo?tipo=lojista"
    );
  });

  it("rejects null/empty", () => {
    expect(sanitizeInternalRedirect(null)).toBeNull();
    expect(sanitizeInternalRedirect("")).toBeNull();
    expect(sanitizeInternalRedirect(undefined)).toBeNull();
  });

  it("rejects absolute URLs e protocolos (open redirect)", () => {
    expect(sanitizeInternalRedirect("https://evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("http://evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("//evil.com")).toBeNull();
    // `javascript:`/`data:` montados por concatenação — são fixtures, não URLs
    // reais (evita a regra no-script-url sem precisar de disable).
    expect(sanitizeInternalRedirect("java" + "script:alert(1)")).toBeNull();
    expect(sanitizeInternalRedirect("data" + ":text/html,x")).toBeNull();
  });

  // Bypasses de barra-invertida: navegadores normalizam "\" -> "/", então
  // "/\host" viraria "//host". TODOS devem ser rejeitados.
  it("rejects bypasses de barra-invertida (literal e encodada)", () => {
    expect(sanitizeInternalRedirect("/\\evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("/\\/evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("\\/evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("/%5Cevil.com")).toBeNull();
    expect(sanitizeInternalRedirect("/%5cevil.com")).toBeNull();
  });

  it("rejects encoding duplo e path traversal para fora da origem", () => {
    // "%252F%252F" (// duplamente encodado) não começa com "/" -> rejeitado.
    expect(sanitizeInternalRedirect("%252F%252Fevil.com")).toBeNull();
    // "/..//evil.com" normaliza para "//evil.com" -> rejeitado no guard final.
    expect(sanitizeInternalRedirect("/..//evil.com")).toBeNull();
  });

  it("rejects espaço/tab/control-chars no início (navegador os remove)", () => {
    expect(sanitizeInternalRedirect(" /evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("\t/evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("\n/evil.com")).toBeNull();
    expect(sanitizeInternalRedirect(" //evil.com")).toBeNull();
  });

  it("rejects /api/ paths", () => {
    expect(sanitizeInternalRedirect("/api/auth/me")).toBeNull();
  });

  it("rejects as próprias telas de auth (loop)", () => {
    expect(sanitizeInternalRedirect("/login")).toBeNull();
    expect(sanitizeInternalRedirect("/login?next=/x")).toBeNull();
    expect(sanitizeInternalRedirect("/cadastro")).toBeNull();
    expect(sanitizeInternalRedirect("/cadastro?next=/x")).toBeNull();
  });
});

describe("resolvePostLoginRedirect", () => {
  it("uses next when valid", () => {
    expect(resolvePostLoginRedirect("CPF", "/comprar")).toBe("/comprar");
  });

  it("falls back to dashboard when next is invalid", () => {
    expect(resolvePostLoginRedirect("CPF", "//evil.com")).toBe("/dashboard");
    expect(resolvePostLoginRedirect("CNPJ", null)).toBe("/dashboard-loja");
  });
});
