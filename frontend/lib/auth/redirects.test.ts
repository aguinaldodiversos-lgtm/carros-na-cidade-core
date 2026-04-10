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
  it("accepts valid internal paths", () => {
    expect(sanitizeInternalRedirect("/dashboard")).toBe("/dashboard");
    expect(sanitizeInternalRedirect("/anunciar/novo")).toBe("/anunciar/novo");
  });

  it("rejects null/empty", () => {
    expect(sanitizeInternalRedirect(null)).toBeNull();
    expect(sanitizeInternalRedirect("")).toBeNull();
    expect(sanitizeInternalRedirect(undefined)).toBeNull();
  });

  it("rejects absolute URLs (open redirect attack)", () => {
    expect(sanitizeInternalRedirect("//evil.com")).toBeNull();
    expect(sanitizeInternalRedirect("https://evil.com")).toBeNull();
  });

  it("rejects /api/ paths", () => {
    expect(sanitizeInternalRedirect("/api/auth/me")).toBeNull();
  });

  it("rejects /login to avoid redirect loop", () => {
    expect(sanitizeInternalRedirect("/login")).toBeNull();
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
