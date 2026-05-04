import { describe, expect, it, vi } from "vitest";
import { loadDotenvIfAvailable } from "./_load-dotenv-optional.js";

// Helper que simula o `require()` do `createRequire` quando o módulo não
// existe — preserva o `code` que Node usaria.
function makeNotFoundError(code) {
  const err = new Error(`Cannot find module 'dotenv'`);
  err.code = code;
  return err;
}

describe("loadDotenvIfAvailable — carregamento opcional", () => {
  it("dotenv presente (CJS shape: require retorna objeto com .config) → chama .config() e reporta loaded=true", () => {
    const config = vi.fn();
    const requireFn = vi.fn(() => ({ config }));

    const result = loadDotenvIfAvailable({ requireFn });

    expect(requireFn).toHaveBeenCalledWith("dotenv");
    expect(config).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ loaded: true });
  });

  it("dotenv presente (ESM shape: require retorna { default: { config } }) → chama default.config()", () => {
    const config = vi.fn();
    const requireFn = vi.fn(() => ({ default: { config } }));

    const result = loadDotenvIfAvailable({ requireFn });

    expect(config).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ loaded: true });
  });

  it("require lança MODULE_NOT_FOUND → silencia e reporta loaded=false (Render sem dotenv)", () => {
    const requireFn = vi.fn(() => {
      throw makeNotFoundError("MODULE_NOT_FOUND");
    });

    const result = loadDotenvIfAvailable({ requireFn });

    expect(result).toEqual({ loaded: false, reason: "module_not_found" });
  });

  it("require lança ERR_MODULE_NOT_FOUND → silencia (variante ESM)", () => {
    const requireFn = vi.fn(() => {
      throw makeNotFoundError("ERR_MODULE_NOT_FOUND");
    });

    const result = loadDotenvIfAvailable({ requireFn });

    expect(result).toEqual({ loaded: false, reason: "module_not_found" });
  });

  it("require lança erro com code DIFERENTE (ex.: SyntaxError do dotenv) → propaga", () => {
    const otherError = new Error("dotenv: SyntaxError no .env");
    otherError.code = "ERR_INVALID_ARG_VALUE";
    const requireFn = vi.fn(() => {
      throw otherError;
    });

    expect(() => loadDotenvIfAvailable({ requireFn })).toThrow(/SyntaxError/);
  });

  it("require lança erro SEM code (Error genérico) → propaga", () => {
    const requireFn = vi.fn(() => {
      throw new Error("kaboom");
    });

    expect(() => loadDotenvIfAvailable({ requireFn })).toThrow(/kaboom/);
  });

  it("dotenv presente mas SEM função config → reporta loaded=false (no_config_function)", () => {
    const requireFn = vi.fn(() => ({ /* sem config */ }));

    const result = loadDotenvIfAvailable({ requireFn });

    expect(result).toEqual({ loaded: false, reason: "no_config_function" });
  });

  it("dotenv = null → reporta loaded=false sem chamar nada", () => {
    const requireFn = vi.fn(() => null);

    const result = loadDotenvIfAvailable({ requireFn });

    expect(result).toEqual({ loaded: false, reason: "no_config_function" });
  });
});
