import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.INTERNAL_API_TOKEN;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.restoreAllMocks();
});

async function loadHelper() {
  return await import("./internal-backend-headers");
}

describe("buildInternalBackendHeaders", () => {
  it("sempre envia User-Agent cnc-internal/1.0", async () => {
    const { buildInternalBackendHeaders, INTERNAL_USER_AGENT } = await loadHelper();
    const headers = buildInternalBackendHeaders();
    expect(headers["User-Agent"]).toBe(INTERNAL_USER_AGENT);
    expect(headers["User-Agent"]).toBe("cnc-internal/1.0");
  });

  it("adiciona X-Internal-Token quando INTERNAL_API_TOKEN existe", async () => {
    process.env.INTERNAL_API_TOKEN = "tok-secret-xyz";
    const { buildInternalBackendHeaders } = await loadHelper();
    const headers = buildInternalBackendHeaders();
    expect(headers["X-Internal-Token"]).toBe("tok-secret-xyz");
  });

  it("omite X-Internal-Token quando INTERNAL_API_TOKEN ausente", async () => {
    const { buildInternalBackendHeaders } = await loadHelper();
    const headers = buildInternalBackendHeaders();
    expect(headers["X-Internal-Token"]).toBeUndefined();
    expect(headers["User-Agent"]).toBe("cnc-internal/1.0");
  });

  it("omite X-Internal-Token quando includeToken=false", async () => {
    process.env.INTERNAL_API_TOKEN = "tok-secret-xyz";
    const { buildInternalBackendHeaders } = await loadHelper();
    const headers = buildInternalBackendHeaders({ includeToken: false });
    expect(headers["X-Internal-Token"]).toBeUndefined();
    expect(headers["User-Agent"]).toBe("cnc-internal/1.0");
  });

  it("nao loga o valor do token em nenhum console.* visivel", async () => {
    process.env.INTERNAL_API_TOKEN = "tok-supersecret-zzz";
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const { buildInternalBackendHeaders } = await loadHelper();
    buildInternalBackendHeaders();
    buildInternalBackendHeaders();

    const allCalls = [
      ...errSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...logSpy.mock.calls,
    ].flat();

    for (const c of allCalls) {
      const s = typeof c === "string" ? c : JSON.stringify(c);
      expect(s).not.toContain("tok-supersecret-zzz");
    }
  });

  it("warning em producao quando token ausente, so 1 vez", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.INTERNAL_API_TOKEN;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { buildInternalBackendHeaders } = await loadHelper();
    buildInternalBackendHeaders();
    buildInternalBackendHeaders();
    buildInternalBackendHeaders();
    expect(errSpy).toHaveBeenCalledTimes(1);
    const message = String(errSpy.mock.calls[0][0]);
    expect(message).toContain("INTERNAL_API_TOKEN ausente");
  });

  it("nao emite warning em dev quando token ausente", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.INTERNAL_API_TOKEN;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { buildInternalBackendHeaders } = await loadHelper();
    buildInternalBackendHeaders();
    expect(errSpy).not.toHaveBeenCalled();
  });
});
