import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

/**
 * Fase 4.10A — E2E do bloqueio administrativo, com backend e banco reais.
 *
 * Percorre o ciclo inteiro numa única sessão, porque é o encadeamento que
 * importa: bloquear e sumir do público, o dono ver o motivo sem poder
 * reverter, reativar e voltar. Testes isolados provariam cada passo e
 * nenhum deles provaria o fluxo.
 *
 * Um BrowserContext POR CONTA (admin e dono). Alternar login na mesma sessão
 * dispara o rate limit do /api/auth/login depois de poucas trocas.
 *
 * Pré-requisitos:
 *   - Postgres de teste no ar, migrations aplicadas (inclui a 062)
 *   - backend em 127.0.0.1:4000, frontend em 127.0.0.1:3000
 *   - contas semeadas (ver ADMIN/OWNER abaixo)
 */

const ADMIN = { email: "admin.mod@example.com", password: "Admin@12345" };
const OWNER = { email: "cnpj@carrosnacidade.com", password: "Admin@12345" };

const AD_ID = "1";
const AD_SLUG = "honda-hr-v-ex-2020-atibaia-sp-e2e-1";
const AD_TITLE = "Honda HR-V EX 2020";

/**
 * Catálogo da cidade do anúncio. `/comprar` sem parâmetro serve a cidade ativa
 * do visitante (São Paulo por padrão), onde este anúncio não aparece nem
 * quando está ativo — usar aquela rota testaria a segmentação territorial, não
 * o bloqueio.
 */
const CATALOG_URL = "/carros-em/atibaia-sp";

/**
 * O card do catálogo mostra a descrição FIPE do modelo ("HONDA HR-V EX 1.8
 * Flex 16V 5p Aut."), não o título do anúncio — e o mesmo texto aparece na
 * lista de filtros de modelo à esquerda, que continua lá mesmo com o anúncio
 * fora do ar. Casar por texto testaria o filtro, não o card. O link para o
 * slug é o único sinal inequívoco de que ESTE anúncio está no catálogo.
 */
const CARD_SELECTOR = `a[href*="/veiculo/${AD_SLUG}"]`;

// ESM: sem __dirname. O cwd do Playwright é `frontend/`.
const SHOT_DIR = path.resolve(process.cwd(), "../reports/screenshots/fase-4-10a");

function shotPath(name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  return path.join(SHOT_DIR, name);
}

async function loginVia(page: Page, creds: { email: string; password: string }) {
  const res = await page.request.post("/api/auth/login", {
    data: { email: creds.email, password: creds.password },
  });
  expect(res.ok(), `login falhou para ${creds.email}: ${res.status()}`).toBe(true);
}

/** Reativa via API para deixar o ambiente limpo mesmo se o teste falhar no meio. */
async function forceUnblock(page: Page) {
  await page.request.patch(`/api/admin/ads/${AD_ID}/unblock`, { data: {} }).catch(() => null);
}

test.describe.configure({ mode: "serial" });

test.describe("Fase 4.10A — moderação administrativa de anúncio", () => {
  test("ciclo completo: ativo → bloqueado → reativado", async ({ browser }) => {
    test.setTimeout(300_000);

    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const admin = await adminCtx.newPage();
    const owner = await ownerCtx.newPage();
    const anon = await publicCtx.newPage();

    try {
      await loginVia(admin, ADMIN);
      await forceUnblock(admin);

      // ── 1. o anúncio está público ──────────────────────────────────────
      //
      // A mesma janela de `revalidate: 60` vale nos dois sentidos: uma execução
      // anterior pode ter deixado no cache a versão SEM o card. Esperar aqui é
      // o que torna a suíte repetível — sem isto ela passa na primeira rodada
      // e falha na segunda, o pior tipo de teste.
      await expect(async () => {
        await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(anon.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 90_000, intervals: [5_000] });

      const detailBefore = await anon.request.get(`/veiculo/${AD_SLUG}`);
      expect(detailBefore.status(), "detalhe público deve responder 200 antes do bloqueio").toBe(
        200
      );

      // ── 2. admin abre o anúncio ────────────────────────────────────────
      await admin.goto(`/admin/anuncios/${AD_ID}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await expect(admin.getByRole("button", { name: "Bloquear anúncio" })).toBeVisible({
        timeout: 30_000,
      });
      await admin.screenshot({ path: shotPath("01-admin-anuncio-ativo.png"), fullPage: true });

      // ── 3. modal de bloqueio ───────────────────────────────────────────
      await admin.getByRole("button", { name: "Bloquear anúncio" }).click();

      const confirm = admin.getByRole("button", { name: "Bloquear anúncio" }).last();
      // Sem motivo escolhido, o confirm nasce travado.
      await expect(confirm).toBeDisabled();
      await expect(admin.getByText("Escolha um motivo para continuar.")).toBeVisible();
      await admin.screenshot({ path: shotPath("02-admin-modal-bloquear.png"), fullPage: true });

      await admin.getByTestId("block-reason-select").selectOption("suspected_fraud");
      await expect(confirm).toBeEnabled();
      await confirm.click();

      // ── 4. o painel reflete o bloqueio ─────────────────────────────────
      await expect(admin.getByTestId("admin-blocked-banner")).toBeVisible({ timeout: 30_000 });
      await expect(admin.getByRole("button", { name: "Reativar anúncio" })).toBeVisible();
      // O rótulo é interpolado junto da data no mesmo parágrafo, então a
      // asserção é sobre o texto acumulado do banner, não sobre um nó exato.
      await expect(admin.getByTestId("admin-blocked-banner")).toContainText(/Possível fraude/);
      await admin.screenshot({ path: shotPath("03-admin-anuncio-bloqueado.png"), fullPage: true });

      // Histórico de moderação com a entrada do bloqueio.
      // Escopado ao histórico: "Anúncio bloqueado" também aparece na faixa de
      // aviso acima, e uma busca global casaria com ela em vez da trilha.
      const historyPanel = admin.getByTestId("moderation-history-list");
      await expect(historyPanel).toBeVisible();
      await expect(historyPanel).toContainText(/Anúncio bloqueado/);
      await expect(historyPanel).toContainText(/Possível fraude/);
      await admin
        .getByTestId("moderation-history-list")
        .screenshot({ path: shotPath("04-admin-historico-moderacao.png") });

      // ── 5. o público deixa de ver ──────────────────────────────────────
      //
      // O DETALHE cai na hora: é a URL que o Google indexa e que alguém pode
      // ter salvo, então não pode depender de expiração de cache nenhuma.
      const detailAfter = await anon.request.get(`/veiculo/${AD_SLUG}`);
      expect(
        detailAfter.status(),
        "detalhe de anúncio bloqueado tem de virar 404 imediatamente"
      ).toBe(404);

      const apiAfter = await anon.request.get(`/api/ads/${AD_SLUG}`);
      expect(apiAfter.status(), "API pública não pode devolver anúncio bloqueado").not.toBe(200);

      // O CATÁLOGO tem uma janela de atraso, e ela é medida aqui de propósito.
      //
      // A página de cidade é servida pelo fetch cache do Next com
      // `revalidate: 60` (frontend/lib/search/*). O bloqueio invalida na hora o
      // cache do BACKEND, mas o cache do Next vive no processo do frontend e
      // só se renova ao expirar — não há hoje um webhook de revalidateTag
      // ligando os dois (ver a dívida registrada no relatório da fase).
      //
      // O teto de 90s não é folga arbitrária: é o que transforma este teste num
      // alarme. Se alguém elevar o `revalidate` para 300 ou 3600, o anúncio
      // bloqueado passaria a ficar visível por minutos ou horas — e o teste
      // quebra em vez de deixar passar.
      await expect(async () => {
        await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(anon.locator(CARD_SELECTOR)).toHaveCount(0);
      }).toPass({ timeout: 90_000, intervals: [5_000] });

      await anon.screenshot({
        path: shotPath("06-publico-anuncio-ausente-catalogo.png"),
        fullPage: true,
      });

      // Busca pelo termo exato do anúncio bloqueado devolve zero.
      const search = await anon.request.get(`/api/ads?q=${encodeURIComponent("HR-V EX 2020")}`);
      if (search.ok()) {
        const body = await search.json();
        const ids = (body?.data ?? []).map((a: { id: string | number }) => String(a.id));
        expect(ids, "busca pública não pode devolver o anúncio bloqueado").not.toContain(AD_ID);
      }

      // ── 6. o dono vê o bloqueio e não consegue reverter ────────────────
      await loginVia(owner, OWNER);
      await owner.goto("/dashboard-loja", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await owner.waitForTimeout(2000);

      const ownerText = await owner.locator("body").innerText();
      expect(ownerText, "o dono precisa ver que o anúncio está bloqueado").toMatch(/Bloqueado/i);
      // A nota interna e a identidade do admin nunca aparecem para o dono.
      expect(ownerText).not.toMatch(/admin\.mod@example\.com/);
      expect(ownerText).not.toMatch(/suspected_fraud/);
      await owner.screenshot({
        path: shotPath("05-anunciante-anuncio-bloqueado.png"),
        fullPage: true,
      });

      // Tentativa direta pela API do dono: ativar e editar.
      const tryActivate = await owner.request.patch(`/api/account/ads/${AD_ID}/status`, {
        data: { action: "activate" },
      });
      expect(tryActivate.status(), "o dono não pode reativar sozinho").not.toBe(200);

      const tryEdit = await owner.request.put(`/api/ads/${AD_ID}`, {
        data: { price: 12345 },
      });
      expect(tryEdit.status(), "editar não pode passar em anúncio bloqueado").not.toBe(200);

      const tryEditStatus = await owner.request.put(`/api/ads/${AD_ID}`, {
        data: { status: "active" },
      });
      expect(tryEditStatus.status(), "mandar status na edição não pode reativar").not.toBe(200);

      // O bloqueio sobreviveu às tentativas.
      const stillBlocked = await admin.request.get(`/api/admin/ads/${AD_ID}`);
      const stillBlockedBody = await stillBlocked.json();
      expect(stillBlockedBody?.data?.status).toBe("blocked");

      // ── 7. reativação ──────────────────────────────────────────────────
      await admin.reload({ waitUntil: "domcontentloaded" });
      await admin.getByRole("button", { name: "Reativar anúncio" }).click();
      await expect(admin.getByText(/voltará a ficar disponível publicamente/i)).toBeVisible();
      await admin.screenshot({ path: shotPath("07-admin-modal-reativar.png"), fullPage: true });

      await admin.getByRole("button", { name: "Reativar anúncio" }).last().click();

      await expect(admin.getByTestId("admin-blocked-banner")).toHaveCount(0, { timeout: 30_000 });
      await expect(admin.getByRole("button", { name: "Bloquear anúncio" })).toBeVisible();
      await admin.screenshot({ path: shotPath("08-admin-anuncio-reativado.png"), fullPage: true });

      // ── 8. o audit trail mostra DOIS eventos ───────────────────────────
      const history = await admin.request.get(`/api/admin/ads/${AD_ID}/moderation-history`);
      const historyBody = await history.json();
      const types = (historyBody?.data ?? []).map((e: { event_type: string }) => e.event_type);
      expect(types).toContain("admin_blocked");
      expect(types).toContain("admin_unblocked");
      // A identidade de quem moderou não sai na resposta.
      expect(JSON.stringify(historyBody)).not.toContain("actor_user_id");

      // ── 9. o público volta a ver ───────────────────────────────────────
      const detailBack = await anon.request.get(`/veiculo/${AD_SLUG}`);
      expect(detailBack.status(), "reativado deve voltar a responder 200").toBe(200);

      await expect(async () => {
        await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(anon.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 90_000, intervals: [5_000] });

      await anon.screenshot({
        path: shotPath("09-publico-anuncio-reativado.png"),
        fullPage: true,
      });
    } finally {
      await forceUnblock(admin).catch(() => null);
      await adminCtx.close();
      await ownerCtx.close();
      await publicCtx.close();
    }
  });

  test("o modal de bloqueio cabe em 390px", async ({ browser }) => {
    test.setTimeout(180_000);

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    try {
      await loginVia(page, ADMIN);
      await page.goto(`/admin/anuncios/${AD_ID}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });

      await page.getByRole("button", { name: "Bloquear anúncio" }).click();
      await expect(page.getByTestId("block-reason-select")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("block-reason-select").selectOption("other");

      await page.screenshot({ path: shotPath("10-mobile-admin-bloqueio-390.png"), fullPage: true });

      // Sem overflow horizontal: o documento não pode ser mais largo que a tela.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, "modal de bloqueio causa scroll horizontal em 390px").toBeLessThanOrEqual(1);
    } finally {
      await ctx.close();
    }
  });
});
