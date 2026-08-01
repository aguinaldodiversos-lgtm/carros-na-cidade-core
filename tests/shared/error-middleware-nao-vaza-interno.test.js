/**
 * O errorHandler não pode copiar a mensagem de um erro NÃO MAPEADO para o
 * corpo da resposta.
 *
 * Incidente 2026-07-29: subir foto de celular no wizard de anúncio devolvia
 * HTTP 500 com o texto interno do libvips renderizado na tela do usuário:
 *
 *   "source: bad seek to 1495082 source: bad seek to 1495060 ... heif: Error
 *    while loading plugin: Support for this compression format has not been
 *    built in (11.6003)"
 *
 * A linha responsável era `new AppError(raw?.message || "Internal Server
 * Error", ...)` — qualquer exceção de qualquer biblioteca virava resposta
 * pública, expondo caminho de código, offsets e versão de dependência.
 *
 * O contrato agora: só vaza quem marca `expose = true` explicitamente.
 */
import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import { errorHandler } from "../../src/shared/middlewares/error.middleware.js";
import { AppError } from "../../src/shared/middlewares/error.middleware.js";

/** App mínimo que lança o erro informado na rota /boom. */
function buildApp(error) {
  const app = express();
  app.get("/boom", (_req, _res, next) => next(error));
  app.use(errorHandler);
  return app;
}

const LIBVIPS_ERROR =
  "source: bad seek to 1495082 source: bad seek to 1495060 heif: Error while " +
  "loading plugin: Support for this compression format has not been built in (11.6003)";

describe("errorHandler — erro não mapeado não vaza mensagem interna", () => {
  it("o texto exato do incidente NÃO aparece na resposta", async () => {
    const res = await request(buildApp(new Error(LIBVIPS_ERROR))).get("/boom");

    expect(res.status).toBe(500);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("bad seek");
    expect(body).not.toContain("heif:");
    expect(body).not.toContain("loading plugin");
    expect(body).not.toContain("11.6003");
  });

  it("responde mensagem neutra em português no lugar", async () => {
    const res = await request(buildApp(new Error(LIBVIPS_ERROR))).get("/boom");
    expect(String(res.body?.message || "")).toMatch(/erro interno/i);
  });

  it.each([
    ["caminho de arquivo", new Error("ENOENT: /srv/app/src/secrets/keys.json")],
    ["string de conexão", new Error("connect ECONNREFUSED postgres://user:senha@10.0.0.7:5432")],
    ["stack de dependência", new Error("at Object.<anonymous> (/app/node_modules/sharp/lib/x.js)")],
  ])("não vaza %s", async (_label, error) => {
    const res = await request(buildApp(error)).get("/boom");
    const body = JSON.stringify(res.body);

    expect(body).not.toContain("secrets");
    expect(body).not.toContain("senha");
    expect(body).not.toContain("node_modules");
  });

  it("preserva o statusCode do erro original (só troca o texto)", async () => {
    const error = new Error("detalhe interno que ninguém deve ler");
    error.statusCode = 415;

    const res = await request(buildApp(error)).get("/boom");

    expect(res.status).toBe(415);
    expect(String(res.body?.message || "")).not.toContain("detalhe interno");
    expect(String(res.body?.message || "")).toMatch(/formato/i);
  });
});

describe("errorHandler — mensagem exposta é decisão explícita", () => {
  it("erro com expose=true mantém a mensagem (escrita para o usuário)", async () => {
    const error = new Error("Esta foto está em HEIC. Converta para JPG, PNG ou WebP.");
    error.statusCode = 415;
    error.expose = true;

    const res = await request(buildApp(error)).get("/boom");

    expect(res.status).toBe(415);
    expect(res.body.message).toContain("HEIC");
    expect(res.body.message).toContain("JPG, PNG ou WebP");
  });

  it("expose=true sem mensagem cai no texto neutro (não devolve vazio)", async () => {
    const error = new Error("");
    error.statusCode = 400;
    error.expose = true;

    const res = await request(buildApp(error)).get("/boom");

    expect(res.status).toBe(400);
    expect(String(res.body?.message || "").length).toBeGreaterThan(0);
  });

  it("AppError continua intacto — o caminho operacional não foi tocado", async () => {
    const res = await request(buildApp(new AppError("Este anúncio já foi publicado.", 409))).get(
      "/boom"
    );

    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Este anúncio já foi publicado.");
  });

  /**
   * 404 operacional tem corpo PROPOSITALMENTE enxuto (`{error:"not_found"}`,
   * sem `message`) — otimização de banda para enxurrada de 404 de bot. Fixado
   * aqui porque é fácil confundir com o vazamento que este arquivo trava.
   */
  it("404 operacional mantém o corpo mínimo, sem message", async () => {
    const res = await request(buildApp(new AppError("Rota inexistente.", 404))).get("/boom");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ success: false, error: "not_found" });
  });
});

/**
 * A trava de exposição criou uma regressão: `MulterError` não carrega
 * `statusCode` e sua mensagem é em inglês ("File too large"). Antes chegava
 * crua ao cliente — feia, mas informativa. Sem mapeamento, cairia no genérico
 * "Erro interno", que é pior para quem mandou uma foto grande demais.
 */
describe("errorHandler — erros de multer viram mensagem útil em português", () => {
  function multerError(code) {
    const err = new Error("File too large");
    err.name = "MulterError";
    err.code = code;
    return err;
  }

  it("LIMIT_FILE_SIZE → 413 dizendo o limite em MB", async () => {
    const res = await request(buildApp(multerError("LIMIT_FILE_SIZE"))).get("/boom");

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/grande demais/i);
    expect(res.body.message).toMatch(/\d+\s*MB/i);
    expect(res.body.message).not.toMatch(/File too large/i);
  });

  it("LIMIT_FILE_COUNT → 413 dizendo o máximo de imagens", async () => {
    const res = await request(buildApp(multerError("LIMIT_FILE_COUNT"))).get("/boom");

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/muitas imagens/i);
  });

  it("código desconhecido do multer não vira 500 genérico", async () => {
    const res = await request(buildApp(multerError("LIMIT_PART_COUNT"))).get("/boom");

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/erro interno/i);
  });

  it("nenhuma mensagem de multer sai em inglês", async () => {
    for (const code of ["LIMIT_FILE_SIZE", "LIMIT_FILE_COUNT", "LIMIT_UNEXPECTED_FILE"]) {
      const res = await request(buildApp(multerError(code))).get("/boom");
      expect(res.body.message).not.toMatch(/file|too many|unexpected/i);
    }
  });
});
