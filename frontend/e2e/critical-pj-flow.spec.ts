import { test, expect } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

/**
 * PJ (lojista) — fluxo crítico com CNPJ (placeholder).
 *
 * Quando `E2E_PJ_EMAIL` e `E2E_PJ_PASSWORD` não estão definidos, o bloco inteiro é skipped
 * (sem exigir Next no ar para esse ficheiro).
 *
 * Para implementar: login loja + `/dashboard-loja` ou `/anunciar/novo?tipo=lojista` + asserts.
 */

const hasPjCreds = Boolean(
  process.env.E2E_PJ_EMAIL?.trim() && process.env.E2E_PJ_PASSWORD?.trim()
);

const describePj = hasPjCreds ? test.describe : test.describe.skip;

describePj("PJ — lojista (credenciais E2E_PJ_*)", () => {
  test.beforeAll(async ({ request, baseURL }) => {
    await ensureDevServerUp(request, baseURL);
  });

  test("placeholder — expandir login loja + wizard lojista", async () => {
    expect(process.env.E2E_PJ_EMAIL).toBeTruthy();
  });
});
