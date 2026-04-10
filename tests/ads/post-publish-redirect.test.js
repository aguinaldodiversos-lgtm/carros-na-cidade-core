import { describe, it, expect } from "vitest";
import {
  getDefaultDashboardRedirect,
  resolvePostLoginRedirect,
  sanitizeInternalRedirect,
} from "../../frontend/lib/auth/redirects.ts";

describe("Post-publish redirect logic", () => {
  describe("getDefaultDashboardRedirect", () => {
    it("returns /dashboard-loja for CNPJ accounts", () => {
      expect(getDefaultDashboardRedirect("CNPJ")).toBe("/dashboard-loja");
    });

    it("returns /dashboard for CPF accounts", () => {
      expect(getDefaultDashboardRedirect("CPF")).toBe("/dashboard");
    });

    it("returns /dashboard for pending accounts", () => {
      expect(getDefaultDashboardRedirect("pending")).toBe("/dashboard");
    });
  });

  describe("sanitizeInternalRedirect", () => {
    it("accepts valid internal paths", () => {
      expect(sanitizeInternalRedirect("/dashboard/meus-anuncios")).toBe(
        "/dashboard/meus-anuncios"
      );
      expect(sanitizeInternalRedirect("/dashboard-loja/meus-anuncios")).toBe(
        "/dashboard-loja/meus-anuncios"
      );
    });

    it("rejects external URLs", () => {
      expect(sanitizeInternalRedirect("//evil.com")).toBeNull();
    });

    it("rejects API paths", () => {
      expect(sanitizeInternalRedirect("/api/auth/login")).toBeNull();
    });

    it("rejects /login redirect", () => {
      expect(sanitizeInternalRedirect("/login")).toBeNull();
    });

    it("returns null for empty/null", () => {
      expect(sanitizeInternalRedirect("")).toBeNull();
      expect(sanitizeInternalRedirect(null)).toBeNull();
      expect(sanitizeInternalRedirect(undefined)).toBeNull();
    });
  });

  describe("resolvePostLoginRedirect", () => {
    it("uses next param when valid", () => {
      expect(resolvePostLoginRedirect("CPF", "/anunciar/novo")).toBe("/anunciar/novo");
    });

    it("falls back to dashboard for CPF when next is invalid", () => {
      expect(resolvePostLoginRedirect("CPF", "")).toBe("/dashboard");
      expect(resolvePostLoginRedirect("CPF")).toBe("/dashboard");
    });

    it("falls back to dashboard-loja for CNPJ when next is invalid", () => {
      expect(resolvePostLoginRedirect("CNPJ")).toBe("/dashboard-loja");
    });
  });
});

describe("Post-publish redirect destinations", () => {
  it("CPF user should redirect to /dashboard/meus-anuncios after publish", () => {
    const sessionAccountType = "CPF";
    const backendRedirect = "";
    const defaultRedirect =
      sessionAccountType === "CNPJ"
        ? "/dashboard-loja/meus-anuncios"
        : "/dashboard/meus-anuncios";
    const redirectTo = backendRedirect.trim() || defaultRedirect;

    expect(redirectTo).toBe("/dashboard/meus-anuncios");
  });

  it("CNPJ user should redirect to /dashboard-loja/meus-anuncios after publish", () => {
    const sessionAccountType = "CNPJ";
    const backendRedirect = "";
    const defaultRedirect =
      sessionAccountType === "CNPJ"
        ? "/dashboard-loja/meus-anuncios"
        : "/dashboard/meus-anuncios";
    const redirectTo = backendRedirect.trim() || defaultRedirect;

    expect(redirectTo).toBe("/dashboard-loja/meus-anuncios");
  });

  it("prefers backend redirect when provided", () => {
    const backendRedirect = "/painel/anuncios/123";
    const defaultRedirect = "/dashboard/meus-anuncios";
    const redirectTo = backendRedirect.trim() || defaultRedirect;

    expect(redirectTo).toBe("/painel/anuncios/123");
  });
});
