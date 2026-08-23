import { expect, test } from "@playwright/test";

/**
 * Fase 4.7 — HANDOFF DIRETO, RESSELEÇÃO e RODADAS, ponta a ponta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO SUBSTITUI
 * ════════════════════════════════════════════════════════════════════════════
 * `sale-request-inspection-final-offer.spec.ts` (4.5) e
 * `sale-request-owner-final-decision.spec.ts` (4.6). Os dois percorriam o fluxo
 * de avaliação presencial dentro do portal — agendar, inspecionar, propor valor
 * final, aceitá-lo. A 4.7 aposentou tudo isso.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O CRITÉRIO VISUAL OBRIGATÓRIO (§8, §57)
 * ════════════════════════════════════════════════════════════════════════════
 * A captura `04-dealer-oferta-aceita-sem-avaliacao.png` precisa comprovar que o
 * card "Registrar avaliação" NÃO EXISTE mais. O passo 10 do §53 é asserido campo
 * a campo antes da captura.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UM CONTEXTO POR CONTA — QUATRO LOGINS
 * ════════════════════════════════════════════════════════════════════════════
 * `loginRateLimit` permite 10 logins por IP a cada 15 minutos, e todo o E2E sai
 * do mesmo 127.0.0.1. Cada conta tem o próprio `BrowserContext`, com o próprio
 * cofre de cookies: as quatro sessões vivem em paralelo e ninguém se reautentica
 * para "voltar a ser" quem já era.
 *
 * O SETUP (ofertas, aceite inicial) vai pelos endpoints REAIS via
 * `page.request`: banco real, transações reais, FKs reais. O que a 4.7 ADICIONA
 * — o card do handoff, o WhatsApp, o "não houve acordo", a resseleção e a nova
 * rodada — é exercitado pela INTERFACE, que é onde ele existe.
 *
 * PRÉ-REQUISITOS (fora do CI padrão)
 *   npm run e2e:prepare      # migrations (inclui a 060) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/sale-request-handoff-rounds.spec.ts
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };

const DEALER_FEED = "/dashboard-loja/oportunidades/veiculos";
const OWNER_LIST = "/dashboard/vender-para-lojas";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = "../reports/screenshots/fase-4-7/";

/** Ordem CRESCENTE: cada proposta precisa superar a maior atual. */
const OFFER_B = 63500;
const OFFER_A = 65000;

type Page = import("@playwright/test").Page;

/** As larguras do §56. */
const VIEWPORTS = [360, 390, 412, 768, 1024, 1440];

const FORBIDDEN_CONTACT = [
  "cpf@carrosnacidade.com",
  "cnpj@carrosnacidade.com",
];

/**
 * §8 — os campos do card "Registrar avaliação".
 *
 * Cada termo era um campo do formulário removido. A lista é a asserção: se
 * alguém reintroduzir o card — inteiro ou em pedaços — o E2E acusa.
 */
const RETIRED_INSPECTION_FIELDS = [
  "registrar avaliação",
  "avaliação confirmada para",
  "quilometragem lida",
  "estado geral observado",
  "registrar proposta final",
  "proposta final",
];

async function login(page: Page, user: { email: string; password: string }) {
  const res = await page.request.post("/api/auth/login", {
    data: user,
    headers: { "Content-Type": "application/json" },
  });

  if (res.status() === 429) {
    test.skip(
      true,
      "loginRateLimit esgotado (10 logins/IP a cada 15 min). Aguarde a janela e rode de novo."
    );
  }
  expect(res.ok(), `login de ${user.email} falhou com ${res.status()}`).toBeTruthy();
}

async function expectNoContactLeak(page: Page) {
  const text = ((await page.locator("body").innerText()) || "").toLowerCase();
  for (const term of FORBIDDEN_CONTACT) {
    expect(text, `a tela vazou "${term}"`).not.toContain(term);
  }
}

/** Nenhuma barra horizontal, em nenhuma largura (§56). */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(120);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scroll: doc.scrollWidth, client: doc.clientWidth };
    });

    expect(
      overflow.scroll,
      `${label} @ ${width}px: overflow horizontal (${overflow.scroll} > ${overflow.client})`
    ).toBeLessThanOrEqual(overflow.client + 1);
  }

  await page.setViewportSize({ width: 1280, height: 900 });
}

// ── setup pelos endpoints reais ────────────────────────────────────────────

async function findSeededSaleRequest(page: Page): Promise<string> {
  const res = await page.request.get("/api/account/opportunities/sale-requests");

  if (res.status() === 403) {
    test.skip(true, "lojista sem loja elegível — o seed rodou? (npm run e2e:prepare)");
  }
  expect(res.ok(), `o feed do lojista respondeu ${res.status()}`).toBeTruthy();

  const body = (await res.json()) as {
    items?: Array<{ id: number | string; fipe_model_description: string }>;
  };
  const target = (body.items || []).find((item) =>
    /T-Cross/i.test(item.fipe_model_description)
  );

  expect(
    target,
    "a solicitação semeada não está no feed. Ou o seed não rodou, ou uma rodada anterior já " +
      "avançou o handoff. Rode: npm run e2e:prepare"
  ).toBeTruthy();

  return String(target!.id);
}

async function submitOffer(page: Page, saleRequestId: string, amount: number) {
  const res = await page.request.post(
    `/api/account/opportunities/sale-requests/${saleRequestId}/offers`,
    {
      data: { amount: String(amount) },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(
    res.ok(),
    `a oferta de ${amount} respondeu ${res.status()}: ${await res.text()}`
  ).toBeTruthy();
}

/** O id da oferta ATUAL de uma loja, lido do detalhe do proprietário. */
async function offerIdByAmount(page: Page, saleRequestId: string, amount: number) {
  const res = await page.request.get(`/api/account/sale-requests/${saleRequestId}`);
  expect(res.ok(), `o detalhe respondeu ${res.status()}`).toBeTruthy();

  const body = (await res.json()) as {
    proposals?: Array<{ id: number | string; amount: string }>;
  };
  const target = (body.proposals || []).find(
    (proposal) => Math.round(Number(proposal.amount)) === amount
  );
  expect(target, `nenhuma oferta de ${amount} no detalhe`).toBeTruthy();
  return String(target!.id);
}

test.describe("@sale-request-handoff o handoff direto, a resseleção e as rodadas", () => {
  test("aceita, não há acordo, aceita outra, e abre nova rodada", async ({ browser }) => {
    test.setTimeout(300_000);

    const ownerCtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerACtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerBCtx = await browser.newContext({ baseURL: BASE_URL });

    const page = await ownerCtx.newPage(); // a tela do PROPRIETÁRIO
    const dealerA = await dealerACtx.newPage();
    const dealerB = await dealerBCtx.newPage();

    try {
      await login(page, OWNER);
      await login(dealerA, DEALER_A);
      await login(dealerB, DEALER_B);

      // ══════════════════════════════════════════════════════════════════════
      // 1 a 5 — as ofertas, e o proprietário vendo a lista
      // ══════════════════════════════════════════════════════════════════════
      const saleRequestId = await findSeededSaleRequest(dealerA);

      // Ordem crescente: B (63.500) e depois A (65.000).
      await submitOffer(dealerB, saleRequestId, OFFER_B);
      await submitOffer(dealerA, saleRequestId, OFFER_A);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(2);

      // §5 — o aviso de compromisso está VISÍVEL antes de qualquer clique.
      const commitment = page.getByTestId("sale-request-offer-commitment");
      await expect(commitment).toBeVisible();
      await expect(commitment).toContainText("intenção real de compra");
      await expect(commitment).toContainText("revisar o valor ou desistir");

      // §3 — o CTA continua sendo ACEITAR OFERTA.
      const ctas = page.getByTestId("sale-request-proposal-select");
      await expect(ctas.first()).toContainText("Aceitar oferta");

      await expectNoHorizontalOverflow(page, "ofertas recebidas");
      await page.screenshot({ path: SHOTS + "01-owner-ofertas.png", fullPage: true });

      // ══════════════════════════════════════════════════════════════════════
      // 6 a 8 — o modal com o aviso
      // ══════════════════════════════════════════════════════════════════════
      const cardA = page
        .getByTestId("sale-request-proposal")
        .filter({ hasText: "R$ 65.000,00" });
      await cardA.getByTestId("sale-request-proposal-select").click();

      const dialog = page.getByTestId("sale-request-select-dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog).toContainText("Você está aceitando a oferta de");
      await expect(dialog).toContainText("divergências relevantes");
      await expect(dialog).toContainText("confirma sua intenção de vender");
      // A linguagem que enfraqueceria a oferta não pode voltar.
      await expect(dialog).not.toContainText("preliminar");

      await page.screenshot({
        path: SHOTS + "02-owner-modal-aceitar-oferta.png",
        fullPage: true,
      });

      // ══════════════════════════════════════════════════════════════════════
      // 9 — o HANDOFF: loja, valor, endereço, WhatsApp
      // ══════════════════════════════════════════════════════════════════════
      await page.getByTestId("sale-request-select-confirm").click();

      const handoff = page.getByTestId("owner-handoff");
      await expect(handoff).toBeVisible({ timeout: 30_000 });

      await page.reload();
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("handoff-store-name")).toContainText("Loja Atibaia");
      await expect(page.getByTestId("handoff-amount")).toContainText("65.000");
      await expect(page.getByTestId("handoff-address")).toBeVisible();
      await expect(page.getByTestId("handoff-whatsapp")).toBeVisible();

      // §55 — o link do WhatsApp, validado sem abrir o app externo.
      const whatsappResponse = await page.request.get(
        `/api/account/sale-requests/${saleRequestId}/handoff/whatsapp`
      );
      expect(whatsappResponse.ok()).toBeTruthy();
      const { url } = (await whatsappResponse.json()) as { url: string };

      expect(url).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/);
      const message = decodeURIComponent(url.split("text=")[1]);
      expect(message).toContain("Carros na Cidade");
      expect(message).toContain("T-Cross");
      // Sem CPF, sem e-mail, sem id interno — e sem o valor.
      expect(message).not.toMatch(/cpf|@|\d{5,}/i);

      await expectNoContactLeak(page);
      await expectNoHorizontalOverflow(page, "handoff ativo");

      await page.screenshot({
        path: SHOTS + "03-owner-oferta-aceita-whatsapp.png",
        fullPage: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: SHOTS + "10-mobile-390-handoff.png", fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });

      // ══════════════════════════════════════════════════════════════════════
      // 10 a 12 — A LOJA: oferta aceita, SEM o card de avaliação
      // ══════════════════════════════════════════════════════════════════════
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      const dealerPanel = dealerA.getByTestId("dealer-handoff-accepted");
      await expect(dealerPanel).toBeVisible({ timeout: 60_000 });

      await expect(dealerPanel).toContainText("Sua oferta foi aceita");
      await expect(dealerA.getByTestId("dealer-handoff-amount")).toContainText("65.000");
      await expect(dealerPanel).toContainText("recebeu os dados da sua loja");

      // §8 — O CRITÉRIO VISUAL OBRIGATÓRIO, campo a campo.
      const dealerText = ((await dealerA.locator("body").innerText()) || "").toLowerCase();
      for (const field of RETIRED_INSPECTION_FIELDS) {
        expect(dealerText, `o card removido reapareceu: "${field}"`).not.toContain(field);
      }

      // E os testids do painel antigo não existem.
      for (const testId of [
        "dealer-inspection-slot-form",
        "dealer-inspection-form",
        "dealer-inspection-mileage",
        "dealer-decision-form",
        "dealer-decision-amount",
      ]) {
        await expect(dealerA.getByTestId(testId), testId).toHaveCount(0);
      }

      // §16 — nenhum dado do proprietário chega à loja pelo portal.
      await expectNoContactLeak(dealerA);
      expect(dealerText).not.toMatch(/whatsapp|telefone/);

      await expectNoHorizontalOverflow(dealerA, "lojista — oferta aceita");
      await dealerA.screenshot({
        path: SHOTS + "04-dealer-oferta-aceita-sem-avaliacao.png",
        fullPage: true,
      });

      // ══════════════════════════════════════════════════════════════════════
      // 13 e 14 — NÃO HOUVE ACORDO
      // ══════════════════════════════════════════════════════════════════════
      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId("handoff-no-agreement-cta").click();

      const noAgreementDialog = page.getByTestId("handoff-no-agreement-dialog");
      await expect(noAgreementDialog).toBeVisible({ timeout: 15_000 });
      await expect(noAgreementDialog).toContainText("Confirma que não houve acordo");
      await expect(noAgreementDialog).toContainText("não tiver prosseguido");
      // §17 — não pergunta motivo: nenhum campo.
      await expect(noAgreementDialog.locator("input, textarea, select")).toHaveCount(0);

      await page.screenshot({ path: SHOTS + "05-owner-modal-sem-acordo.png", fullPage: true });

      await page.getByTestId("handoff-no-agreement-dialog-confirm").click();

      // ══════════════════════════════════════════════════════════════════════
      // 15 — as OUTRAS ofertas reaparecem
      // ══════════════════════════════════════════════════════════════════════
      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({ timeout: 60_000 });

      await expect(page.getByTestId("owner-handoff-failed")).toContainText(
        "Não houve acordo com"
      );
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(2);
      await expect(page.getByTestId("handoff-new-round-cta")).toBeVisible();

      await expectNoHorizontalOverflow(page, "outras ofertas");
      await page.screenshot({ path: SHOTS + "06-owner-outras-ofertas.png", fullPage: true });

      // ══════════════════════════════════════════════════════════════════════
      // 16 a 19 — a RESSELEÇÃO
      // ══════════════════════════════════════════════════════════════════════
      const cardB = page
        .getByTestId("sale-request-proposal")
        .filter({ hasText: "R$ 63.500,00" });
      await cardB.getByTestId("sale-request-proposal-select").click();
      await page.getByTestId("sale-request-select-confirm").click();

      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("handoff-amount")).toContainText("63.500", {
        timeout: 60_000,
      });

      // 18 — o HISTÓRICO da Loja A permanece, marcado como encerrado.
      const history = page.getByTestId("handoff-history");
      await expect(history).toBeVisible();
      await expect(history).toContainText("Não houve acordo com");
      await expect(history).toContainText("65.000");

      await page.screenshot({
        path: SHOTS + "07-owner-segunda-oferta-aceita.png",
        fullPage: true,
      });

      // 19 — a Loja A NÃO é mais o match atual.
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      const blockedA = await dealerA.request.get(
        `/api/account/opportunities/sale-requests/${saleRequestId}`
      );
      expect(blockedA.status(), "a loja anterior continuou vendo a oportunidade").toBe(404);

      // E a Loja B passou a ver.
      await dealerB.goto(`${DEALER_FEED}/${saleRequestId}`);
      await expect(dealerB.getByTestId("dealer-handoff-accepted")).toBeVisible({
        timeout: 60_000,
      });
      await expect(dealerB.getByTestId("dealer-handoff-amount")).toContainText("63.500");

      // ══════════════════════════════════════════════════════════════════════
      // §54 — A NOVA RODADA
      // ══════════════════════════════════════════════════════════════════════
      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 60_000 });

      // Encerra também o segundo handoff.
      await page.getByTestId("handoff-no-agreement-cta").click();
      await page.getByTestId("handoff-no-agreement-dialog-confirm").click();
      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({ timeout: 30_000 });

      await page.getByTestId("handoff-new-round-cta").click();
      const roundDialog = page.getByTestId("handoff-new-round-dialog");
      await expect(roundDialog).toBeVisible({ timeout: 15_000 });
      await expect(roundDialog).toContainText("Receber novas ofertas");
      await expect(roundDialog).toContainText("não participarão automaticamente");
      await expect(page.getByTestId("handoff-new-round-minimum")).toBeVisible();

      // "Valor mínimo atual" NÃO é asserido aqui de propósito.
      //
      // A solicitação do seed nasce com `minimum_accepted_price` NULL — ela
      // simula uma publicação anterior à regra da 4.3.3 —, e o diálogo omite a
      // linha corretamente quando não há piso. Exigi-la aqui provaria o fixture,
      // não o produto.
      //
      // O caso COM piso é coberto pelo teste de componente
      // (`SaleRequestHandoff.test.tsx`), que renderiza a rodada com 60.000 e
      // verifica tanto o texto quanto o campo pré-preenchido.

      await page.screenshot({ path: SHOTS + "08-owner-modal-nova-rodada.png", fullPage: true });

      const minimumInput = page.getByTestId("handoff-new-round-minimum");
      await minimumInput.fill("");
      await minimumInput.type("58000");
      await page.getByTestId("handoff-new-round-dialog-confirm").click();

      // A disputa reabriu, na RODADA 2.
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({ timeout: 60_000 });

      // 7 e 8 do §54 — as ofertas da rodada 1 NÃO aparecem como atuais.
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(0);
      await expect(page.getByTestId("sale-request-proposals-empty")).toBeVisible();

      await expectNoHorizontalOverflow(page, "rodada 2");
      await page.screenshot({ path: SHOTS + "09-owner-round-2.png", fullPage: true });

      // 9 e 10 do §54 — a loja oferta de novo, pelo piso NOVO, e o dono recebe.
      await submitOffer(dealerA, saleRequestId, 58000);

      await page.reload();
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(1, {
        timeout: 60_000,
      });
      await expect(page.getByTestId("sale-request-proposal-amount")).toContainText("58.000");

      await expectNoContactLeak(page);
    } finally {
      await ownerCtx.close().catch(() => {});
      await dealerACtx.close().catch(() => {});
      await dealerBCtx.close().catch(() => {});
    }
  });
});
