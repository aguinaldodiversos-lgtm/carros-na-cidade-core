import { expect, test } from "@playwright/test";

import {
  ensureBackendApiReachable,
  ensureDevServerUp,
  getBackendApiBaseUrl,
  loginAsLocalUser,
} from "./helpers";

/**
 * Homologação pré-lançamento — AUTH-08 e AD-03.
 *
 * Duas lacunas pequenas e P0 que a suíte existente deixava em aberto:
 *
 *   AUTH-08 — `full-flow.spec.ts` cobre login, logout e "sem sessão vai para
 *   /login", mas nunca RECARREGA uma página autenticada. O F5 é o gesto mais
 *   comum do usuário real e é onde um cookie sem `maxAge`, ou marcado como
 *   `session-only` por engano, aparece: a navegação por SPA continua
 *   funcionando (o estado vive em memória) e só o reload revela a perda.
 *
 *   AD-03 — existe teste para `/dashboard` sem sessão, e um que abre
 *   `/anunciar/novo` JÁ autenticado. Ninguém abria o wizard ANÔNIMO. É a porta
 *   de entrada do funil de publicação; se ela deixar passar, o visitante
 *   preenche sete passos para descobrir no POST final que não estava logado.
 */

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  await ensureBackendApiReachable(request, getBackendApiBaseUrl());
});

test.describe("@auth-sessao AUTH-08 — recarregar não derruba a sessão", () => {
  test("F5 no painel mantém o usuário autenticado", async ({ page, context }) => {
    await loginAsLocalUser(page, context);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(new URL(page.url()).pathname, "pré-condição: o login precisa ter valido").not.toBe(
      "/login"
    );

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });

    expect(new URL(page.url()).pathname, "o F5 derrubou a sessão").not.toBe("/login");
  });

  test("dois reloads seguidos continuam autenticados (não é sorte de um refresh só)", async ({
    page,
    context,
  }) => {
    await loginAsLocalUser(page, context);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });

    expect(new URL(page.url()).pathname).not.toBe("/login");
  });

  test("navegar para outra rota privada depois do reload continua funcionando", async ({
    page,
    context,
  }) => {
    await loginAsLocalUser(page, context);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });

    await page.goto("/anunciar/novo", { waitUntil: "domcontentloaded", timeout: 60_000 });

    expect(new URL(page.url()).pathname, "sessão pós-reload não abre o wizard").not.toBe("/login");
  });
});

test.describe("@auth-sessao AD-03 — wizard exige autenticação", () => {
  /**
   * O gate do wizard é de CLIENTE, não de servidor: `/anunciar/novo` é um
   * Server Component público (200 + `noindex`), e quem barra é
   * `NewAdWizardClient` — ele chama `/api/dashboard/me` depois da hidratação e
   * faz `router.replace('/login?next=…')` quando recebe 401.
   *
   * Por isso a asserção ESPERA a URL mudar, em vez de olhar o instante logo
   * após o `domcontentloaded`. Naquele instante o redirect ainda não ocorreu,
   * e conferir ali reprovava um produto correto — foi o que aconteceu na
   * primeira versão deste arquivo. O que importa ao usuário é não conseguir
   * preencher o wizard sem sessão, e é isso que a espera prova.
   */
  test("/anunciar/novo anônimo termina em /login, não no formulário", async ({ page, context }) => {
    await context.clearCookies();

    await page.goto("/anunciar/novo", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });

    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("o destino original é preservado em ?next (o usuário volta ao wizard)", async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    await page.goto("/anunciar/novo", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForURL(/\/login(\?|$)/, { timeout: 30_000 });

    const next = new URL(page.url()).searchParams.get("next");
    expect(next, "sem `next`, o usuário loga e cai na home em vez do wizard").toContain(
      "/anunciar"
    );
  });

  test("AUTH-11: login com `next` externo NÃO leva o navegador para fora do domínio", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.clearCookies();
    const hostDoApp = new URL(baseURL ?? "http://127.0.0.1:3000").host;

    // O open redirect só se materializa DEPOIS do login bem-sucedido — é o
    // momento em que o app decide para onde mandar o usuário. Abrir /login com
    // o parâmetro e conferir a URL da própria tela de login não provaria nada.
    await page.goto("/login?next=https://exemplo-malicioso.test/roubo", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await loginAsLocalUser(page, context);
    await page.waitForLoadState("domcontentloaded");

    expect(new URL(page.url()).host, "o login redirecionou para fora do domínio").toBe(hostDoApp);
    expect(page.url()).not.toContain("exemplo-malicioso.test");
  });
});
