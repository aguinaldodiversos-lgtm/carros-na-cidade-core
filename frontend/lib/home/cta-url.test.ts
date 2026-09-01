import { describe, expect, it } from "vitest";

import { isValidCtaUrl, sanitizeCtaUrl } from "@/lib/home/cta-url";

/**
 * Validação de LEITURA do `cta_url` do hero — SEO Fase 4.1A, achado P1-5.
 *
 * A validação de ESCRITA já existe no backend
 * (`admin-home.service.js#validateCtaUrl`) e já rejeita este exato valor. Ela
 * chegou DEPOIS do dado: medido em produção em 2026-08-31, `home_hero_3` tem
 * `cta_url = "/abaixo da fipe"` e a home renderizava `href="/abaixo da fipe"`
 * — 404 no link mais visível do site.
 *
 * Estes testes travam o espelho de leitura: o componente não pode confiar no
 * banco. As duas listas abaixo são as MESMAS regras do backend.
 */

describe("cta_url — aceita", () => {
  it.each([
    "/carros-em/atibaia-sp",
    "/comprar",
    "/comprar?below_fipe=true",
    "/blog/ipva-2025-entenda-tudo",
    "/planos#precos",
    "https://exemplo.com/x",
    "http://exemplo.com/x",
    // Espaço codificado é URL legítima — só o literal é recusado.
    "/busca?q=carro%20usado",
  ])("%p", (value) => {
    expect(isValidCtaUrl(value)).toBe(true);
    expect(sanitizeCtaUrl(value)).toBe(value);
  });

  it("apara espaços das bordas sem rejeitar", () => {
    expect(sanitizeCtaUrl("  /comprar  ")).toBe("/comprar");
  });
});

describe("cta_url — rejeita", () => {
  it.each([
    // O valor REAL que quebrou a home.
    ["/abaixo da fipe", "espaço literal no caminho"],
    ["abaixo da fipe", "rótulo, não URL"],
    ["javascript:alert(1)", "protocolo executável"],
    ["data:text/html,<script>alert(1)</script>", "data URI"],
    ["file:///etc/passwd", "protocolo de arquivo"],
    ["//evil.example.com", "protocol-relative sai da origem"],
    ["/\\evil.example.com", "barra invertida sai da origem"],
    ["   ", "só espaços"],
    ["", "vazio"],
    ["/rota\tcom\ttab", "control char"],
    ["comprar", "caminho relativo sem barra"],
  ])("%p (%s)", (value) => {
    expect(isValidCtaUrl(value)).toBe(false);
    expect(sanitizeCtaUrl(value)).toBeNull();
  });

  it.each([[null], [undefined], [42], [{}], [[]]])("valor não-string %p", (value) => {
    expect(isValidCtaUrl(value)).toBe(false);
    // `null` é ausência legítima de override — o caller cai no destino canônico.
    expect(sanitizeCtaUrl(value)).toBeNull();
  });
});
