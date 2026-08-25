import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
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

/**
 * UM login por conta no arquivo inteiro.
 *
 * `loginRateLimit` no backend é de 5 tentativas por 15 minutos. Com três
 * testes logando admin e dono a cada um, a suíte estourava a cota no meio da
 * execução e falhava com 429 — um erro que parece bug de produto e não é.
 * Logamos uma vez, guardamos os cookies e criamos cada contexto já autenticado.
 */
const sessionState = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();

async function authenticatedContext(
  browser: Browser,
  creds: { email: string; password: string },
  viewport = { width: 1440, height: 900 }
) {
  if (!sessionState.has(creds.email)) {
    const bootstrap = await browser.newContext();
    const page = await bootstrap.newPage();
    await loginVia(page, creds);
    sessionState.set(creds.email, await bootstrap.storageState());
    await bootstrap.close();
  }
  return browser.newContext({ viewport, storageState: sessionState.get(creds.email) });
}

/**
 * Reativa via API para deixar o ambiente limpo mesmo se o teste falhar no meio.
 *
 * No teardown os erros são engolidos (o teste já falhou por outro motivo); no
 * SETUP eles não podem ser — um `.catch()` silencioso ali deixava o anúncio
 * bloqueado de uma execução anterior e a rodada seguinte falhava no
 * aquecimento, apontando para o lugar errado.
 */
async function forceUnblock(page: Page, { assert = false } = {}) {
  const res = await page.request
    .patch(`/api/admin/ads/${AD_ID}/unblock`, { data: {} })
    .catch(() => null);
  if (assert) {
    expect(res?.ok(), "não foi possível restaurar o anúncio para o estado inicial").toBe(true);
    const state = await page.request.get(`/api/admin/ads/${AD_ID}`);
    const body = await state.json();
    expect(body?.data?.status, "anúncio precisa começar ativo").toBe("active");
  }
}

test.describe.configure({ mode: "serial" });

test.describe("Fase 4.10A — moderação administrativa de anúncio", () => {
  test("ciclo completo: ativo → bloqueado → reativado", async ({ browser }) => {
    test.setTimeout(300_000);

    const adminCtx = await authenticatedContext(browser, ADMIN);
    const ownerCtx = await authenticatedContext(browser, OWNER);
    const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const admin = await adminCtx.newPage();
    const owner = await ownerCtx.newPage();
    const anon = await publicCtx.newPage();

    try {
      await forceUnblock(admin, { assert: true });

      // ── 1. o anúncio está público (AQUECIMENTO, não é a prova) ─────────
      //
      // Este passo prepara o cenário: garante que o catálogo está quente COM o
      // anúncio antes de bloquear — senão o teste seguinte veria a ausência do
      // card e não saberia dizer se foi a invalidação ou se ele nunca esteve
      // lá. A tolerância aqui é do setup; a asserção que prova a invalidação,
      // mais abaixo, é de leitura única e sem espera.
      await expect(async () => {
        await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await expect(anon.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000, intervals: [2_000] });

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

      // O CATÁLOGO sai na PRIMEIRA leitura, não por expiração.
      //
      // O bloqueio dispara `revalidateTag('public-ads')` no Next através do
      // canal interno, além de limpar o Redis do backend. Por isso aqui não há
      // `toPass` nem tolerância de TTL: uma única navegação, feita logo após a
      // resposta administrativa, já tem de vir sem o anúncio.
      //
      // Se alguém remover o disparo de revalidação, este teste falha em vez de
      // esperar 60 segundos e passar assim mesmo — que era exatamente o buraco
      // que a tolerância antiga escondia.
      await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(
        anon.locator(CARD_SELECTOR),
        "anúncio bloqueado ainda no catálogo na primeira leitura — a invalidação do Next não aconteceu"
      ).toHaveCount(0);

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

      // Tentativas diretas pela API do dono. Depois da correção pré-merge,
      // EDITAR passou a ser permitido; tudo que PUBLICA continua barrado.
      const tryActivate = await owner.request.patch(`/api/account/ads/${AD_ID}/status`, {
        data: { action: "activate" },
      });
      expect(tryActivate.status(), "o dono não pode reativar sozinho").not.toBe(200);

      const tryPause = await owner.request.patch(`/api/account/ads/${AD_ID}/status`, {
        data: { action: "pause" },
      });
      expect(tryPause.status(), "pausar também não é do dono aqui").not.toBe(200);

      const tryPublishOptions = await owner.request.get(
        `/api/ads/${AD_ID}/publication-options`
      );
      expect(
        tryPublishOptions.status(),
        "publicar/renovar/impulsionar continuam fora de alcance"
      ).not.toBe(200);

      const tryEditStatus = await owner.request.put(`/api/ads/${AD_ID}`, {
        data: { status: "active" },
      });
      expect(tryEditStatus.status(), "mandar status na edição não pode reativar").not.toBe(200);

      const tryStructural = await owner.request.put(`/api/ads/${AD_ID}`, {
        data: { brand: "Toyota" },
      });
      expect(tryStructural.status(), "trocar de veículo continua proibido").not.toBe(200);

      // Editar CONTEÚDO funciona — é o que a moderação está pedindo.
      const editContent = await owner.request.put(`/api/ads/${AD_ID}`, {
        data: { price: 12345 },
      });
      expect(editContent.status(), "o dono precisa poder corrigir o conteúdo").toBe(200);

      // E o bloqueio sobreviveu a tudo isso.
      const stillBlocked = await admin.request.get(`/api/admin/ads/${AD_ID}`);
      const stillBlockedBody = await stillBlocked.json();
      expect(stillBlockedBody?.data?.status).toBe("blocked");
      expect(stillBlockedBody?.data?.blocked_reason_code).toBe("suspected_fraud");
      expect(stillBlockedBody?.data?.blocked_previous_status).toBe("active");

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

      // A reativação também invalida — a volta é na primeira leitura.
      await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(
        anon.locator(CARD_SELECTOR).first(),
        "anúncio reativado não voltou na primeira leitura — a invalidação do Next não aconteceu"
      ).toBeVisible({ timeout: 10_000 });

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

    const ctx = await authenticatedContext(browser, ADMIN, { width: 390, height: 844 });
    const page = await ctx.newPage();

    try {
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

/**
 * Fase 4.10A (correção) — o dono corrige o anúncio bloqueado.
 *
 * O fluxo inteiro numa sessão: o admin bloqueia por "Informação incorreta", o
 * dono vê o motivo E o caminho para corrigir, edita, lê que continua
 * bloqueado, o público segue sem ver, e só a reativação do admin publica o
 * conteúdo novo.
 */
test.describe("Fase 4.10A — correção pelo anunciante", () => {
  test("bloqueado → dono edita → continua bloqueado → admin reativa com o conteúdo novo", async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const adminCtx = await authenticatedContext(browser, ADMIN);
    const ownerCtx = await authenticatedContext(browser, OWNER);
    const publicCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    const admin = await adminCtx.newPage();
    const owner = await ownerCtx.newPage();
    const anon = await publicCtx.newPage();

    const NEW_DESCRIPTION = `Descrição corrigida pelo dono ${Date.now()}`;

    try {
      await forceUnblock(admin, { assert: true });

      // ── admin bloqueia por "Informação incorreta" ──────────────────────
      const blockRes = await admin.request.patch(`/api/admin/ads/${AD_ID}/block`, {
        data: { reason_code: "incorrect_information" },
      });
      expect(blockRes.ok()).toBe(true);

      // O catálogo já reflete o bloqueio na primeira leitura.
      await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(anon.locator(CARD_SELECTOR)).toHaveCount(0);

      // ── o dono vê BLOQUEADO e o caminho para corrigir ──────────────────
      await owner.goto("/dashboard-loja", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await owner.waitForTimeout(1500);

      const ownerText = await owner.locator("body").innerText();
      expect(ownerText).toMatch(/Bloqueado/i);
      expect(ownerText).toMatch(/continuará bloqueado até ser reativado pela administração/i);
      await expect(owner.getByTestId(`ad-blocked-edit-${AD_ID}`)).toBeVisible();
      await owner.screenshot({
        path: shotPath("11-owner-bloqueado-pode-editar.png"),
        fullPage: true,
      });

      // Fotografa o tamanho da trilha ANTES da edição, para medir o delta.
      const historyBeforeEdit = await admin.request.get(
        `/api/admin/ads/${AD_ID}/moderation-history`
      );
      const historyBeforeEditCount = ((await historyBeforeEdit.json())?.data ?? []).length;

      // ── o dono entra na edição ─────────────────────────────────────────
      await owner.getByTestId(`ad-blocked-edit-${AD_ID}`).click();
      await owner.waitForURL(/\/painel\/anuncios\/.+\/editar/, { timeout: 60_000 });
      await expect(owner.getByTestId("edit-blocked-notice")).toBeVisible({ timeout: 30_000 });
      await owner.screenshot({ path: shotPath("12-owner-edicao-bloqueada.png"), fullPage: true });

      // ── corrige a descrição e salva ────────────────────────────────────
      const descricao = owner.locator("textarea").first();
      await descricao.fill(NEW_DESCRIPTION);
      await owner.getByRole("button", { name: /salvar/i }).first().click();

      const successNotice = owner.getByTestId("edit-success-notice");
      await expect(successNotice).toBeVisible({ timeout: 60_000 });
      await expect(successNotice).toContainText(/continua bloqueado até revisão da administração/i);
      // O texto NÃO pode sugerir que o anúncio voltou ao ar.
      await expect(successNotice).not.toContainText(/publicad/i);
      await owner.screenshot({
        path: shotPath("13-owner-edicao-salva-continua-bloqueado.png"),
        fullPage: true,
      });

      // ── o bloqueio sobreviveu à edição ─────────────────────────────────
      const afterEdit = await admin.request.get(`/api/admin/ads/${AD_ID}`);
      const afterEditBody = await afterEdit.json();
      expect(afterEditBody?.data?.status).toBe("blocked");
      expect(afterEditBody?.data?.blocked_reason_code).toBe("incorrect_information");
      expect(afterEditBody?.data?.blocked_previous_status).toBe("active");
      expect(afterEditBody?.data?.description).toBe(NEW_DESCRIPTION);

      // ── o público continua sem ver ─────────────────────────────────────
      const detailAfterEdit = await anon.request.get(`/veiculo/${AD_SLUG}`);
      expect(detailAfterEdit.status()).toBe(404);

      await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(anon.locator(CARD_SELECTOR)).toHaveCount(0);

      // ── a trilha NÃO ganhou um unblock falso ───────────────────────────
      //
      // O anúncio é reaproveitado pelos testes do arquivo (modo serial), então
      // a trilha já traz ciclos anteriores. O que importa é o DELTA: a edição
      // do dono não pode ter acrescentado evento nenhum ao que existia logo
      // após o bloqueio.
      const historyAfterEdit = await admin.request.get(
        `/api/admin/ads/${AD_ID}/moderation-history`
      );
      const typesAfterEdit = ((await historyAfterEdit.json())?.data ?? []).map(
        (e: { event_type: string }) => e.event_type
      );
      expect(
        typesAfterEdit.length,
        "editar acrescentou evento à trilha de moderação"
      ).toBe(historyBeforeEditCount);
      // O evento mais recente continua sendo o bloqueio — nenhuma reativação
      // falsa foi registrada pela edição.
      expect(typesAfterEdit[0]).toBe("admin_blocked");

      // ── o admin reativa: o conteúdo CORRIGIDO vira público ─────────────
      const unblockRes = await admin.request.patch(`/api/admin/ads/${AD_ID}/unblock`, { data: {} });
      expect(unblockRes.ok()).toBe(true);

      await anon.goto(CATALOG_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(anon.locator(CARD_SELECTOR).first()).toBeVisible({ timeout: 10_000 });

      await anon.goto(`/veiculo/${AD_SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect(anon.locator("body")).toContainText(NEW_DESCRIPTION, { timeout: 30_000 });
    } finally {
      await forceUnblock(admin).catch(() => null);
      await adminCtx.close();
      await ownerCtx.close();
      await publicCtx.close();
    }
  });
});
