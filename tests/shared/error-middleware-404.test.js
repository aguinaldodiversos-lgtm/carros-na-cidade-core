import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("../../src/shared/logger.js", () => ({
  getLogger: () => ({ warn: mocks.loggerWarn, error: mocks.loggerError }),
  logger: { warn: mocks.loggerWarn, error: mocks.loggerError },
}));

import { errorHandler, AppError } from "../../src/shared/middlewares/error.middleware.js";

const loggerWarn = mocks.loggerWarn;
const loggerError = mocks.loggerError;

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  res._headers = headers;
  return res;
}

beforeEach(() => {
  loggerWarn.mockReset();
  loggerError.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("errorHandler — 404 público (ruído controlado)", () => {
  it("404 operacional vira warn, NÃO error", () => {
    const err = new AppError("Rota não encontrada: GET /catalog/ads/foo", 404);
    const req = { method: "GET", originalUrl: "/catalog/ads/foo" };
    const res = makeRes();
    errorHandler(err, req, res, vi.fn());

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerError).not.toHaveBeenCalled();
  });

  it("404 sem stack trace no log", () => {
    const err = new AppError("Not found", 404);
    const req = { method: "GET", originalUrl: "/foo" };
    errorHandler(err, req, makeRes(), vi.fn());

    const warnArgs = loggerWarn.mock.calls[0][0];
    expect(warnArgs.stack).toBeUndefined();
  });

  it("404 responde com corpo mínimo (sem requestId/details)", () => {
    const err = new AppError("Not found", 404);
    const req = { method: "GET", originalUrl: "/foo", requestId: "req-abc" };
    const res = makeRes();
    errorHandler(err, req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ success: false, error: "not_found" });
    // Sem requestId no body — corpo minúsculo.
    expect(res.body.requestId).toBeUndefined();
    expect(res.body.message).toBeUndefined();
    expect(res._headers["cache-control"]).toContain("max-age=60");
  });

  it("400 (validação) continua sendo logado como error", () => {
    const err = new AppError("Campo obrigatório.", 400);
    errorHandler(err, { method: "POST", originalUrl: "/api/ads" }, makeRes(), vi.fn());

    expect(loggerError).toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  it("500 (erro real) continua sendo logado como error", () => {
    const err = new AppError("Internal", 500, false);
    errorHandler(err, { method: "GET", originalUrl: "/api/ads" }, makeRes(), vi.fn());

    expect(loggerError).toHaveBeenCalled();
  });

  it("404 NÃO operacional (não passou pelo nosso 404 handler) ainda é error", () => {
    // Edge case — se alguém criar AppError(404, isOperational=false)
    const err = new AppError("Bug interno", 404, false);
    errorHandler(err, { method: "GET", originalUrl: "/x" }, makeRes(), vi.fn());

    expect(loggerError).toHaveBeenCalled();
    expect(loggerWarn).not.toHaveBeenCalled();
  });
});
