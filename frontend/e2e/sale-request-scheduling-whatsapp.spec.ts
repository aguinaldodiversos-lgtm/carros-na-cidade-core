import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Fase 4.9B — AGENDAMENTO PELO PORTAL + WHATSAPP, ponta a ponta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA QUE NENHUM TESTE DE COMPONENTE PROVA
 * ════════════════════════════════════════════════════════════════════════════
 * Que a agenda pertence à SELEÇÃO — no banco de verdade, com a migration 061
 * aplicada, as FKs reais e as duas telas conversando pelos endpoints reais.
 *
 * Os testes de componente montam o DTO à mão: eles provam que a tela reage certo
 * ao que recebe. Só o E2E prova o que ela RECEBE — e é exatamente aí que estão os
 * dois cenários que a 4.9A existiu para consertar:
 *
 *   §33  Loja A agenda → não houve acordo → Loja B aceita → a agenda de A NÃO
 *        aparece no match de B;
 *   §34  Loja A agenda → não houve acordo → rodada 2 → Loja A DE NOVO → a
 *        agenda A1 não é lida como se fosse a A2.
 *
 * O segundo é o que filtrar por `advertiser_id` não resolveria: as duas linhas
 * são da mesma loja e da mesma solicitação, e só o `selection_id` as distingue.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * §15 — A CAPTURA MAIS IMPORTANTE
 * ════════════════════════════════════════════════════════════════════════════
 * `07-owner-handoff-failed-sem-agenda-ativa.png`. A 4.9A preserva a agenda no
 * banco e o ponteiro `selected_offer_id` continua apontando para a seleção
 * encerrada — então o DTO de `handoff_failed` TRAZ uma inspeção agendada. Todo o
 * dado necessário para pintar "Avaliação agendada" está presente; só o status
 * diz que aquilo acabou.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UM CONTEXTO POR CONTA — §38
 * ════════════════════════════════════════════════════════════════════════════
 * `loginRateLimit` permite 10 logins por IP a cada 15 minutos, e todo o E2E sai
 * do mesmo 127.0.0.1. Três contas, três `BrowserContext`, três logins no arquivo
 * inteiro. Nenhuma sessão se reautentica para "voltar a ser" quem já era — foi
 * assim que a 4.6 estourou o limitador.
 *
 * PRÉ-REQUISITOS (fora do CI padrão)
 *   npm run e2e:prepare      # migrations (inclui a 060 e a 061) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/sale-request-scheduling-whatsapp.spec.ts
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };

const DEALER_FEED = "/dashboard-loja/oportunidades/veiculos";
const OWNER_LIST = "/dashboard/vender-para-lojas";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SHOTS = "../reports/screenshots/fase-4-9b/";

/** Ordem CRESCENTE: cada proposta precisa superar a maior atual. */
const OFFER_B = 63500;
const OFFER_A = 65000;

type Page = import("@playwright/test").Page;

/** As larguras do §28. */
const VIEWPORTS = [360, 390, 412, 768, 1024, 1440];

const FORBIDDEN_CONTACT = ["cpf@carrosnacidade.com", "cnpj@carrosnacidade.com"];

/**
 * §23 — os campos do fluxo APOSENTADO.
 *
 * Cada termo era um campo de um dos dois formulários que a 4.7 removeu e que a
 * 4.9B NÃO traz de volta. A lista é a asserção: se alguém restaurar um dos
 * componentes antigos inteiro — que é o caminho mais provável para reintroduzir
 * isto —, o E2E acusa na tela.
 *
 * "pneus", "motor" e "câmbio" NÃO estão aqui, e a ausência é deliberada (§24):
 * os três aparecem legitimamente na FICHA DECLARADA pelo proprietário, na mesma
 * página. Um termo com homônimo inocente transforma o teste num alarme falso, e
 * um alarme falso é desativado na primeira vez que atrapalha.
 */
const RETIRED_FIELDS = [
  "registrar avaliação",
  "quilometragem lida",
  "estado geral observado",
  "observações da avaliação",
  "registrar proposta final",
  "aceitar proposta final",
  "recusar proposta final",
];

/** Os testids dos painéis aposentados. Nenhum pode existir. */
const RETIRED_TESTIDS = [
  "dealer-inspection-form",
  "dealer-inspection-mileage",
  "dealer-decision-form",
  "dealer-decision-amount",
  "owner-final-decision-form",
];

/**
 * A raiz do repositório, procurada a partir do diretório de trabalho.
 *
 * Nem `__dirname` (o spec é ESM) nem um `../..` fixo servem: o segundo depende de
 * o Playwright ter sido invocado de `frontend/`, e ele também roda da raiz.
 * Subir até encontrar `scripts/e2e-seed.mjs` responde certo nos dois casos.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i += 1) {
    if (existsSync(path.join(dir, "scripts", "e2e-seed.mjs"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `não encontrei scripts/e2e-seed.mjs subindo a partir de ${process.cwd()}`
  );
}

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

/** §23 — a varredura contextual, na tela inteira. */
async function expectNoRetiredEvaluation(page: Page, label: string) {
  const text = ((await page.locator("body").innerText()) || "").toLowerCase();
  for (const field of RETIRED_FIELDS) {
    expect(text, `${label}: o fluxo aposentado reapareceu ("${field}")`).not.toContain(
      field
    );
  }
  for (const testId of RETIRED_TESTIDS) {
    await expect(page.getByTestId(testId), `${label}: ${testId}`).toHaveCount(0);
  }
}

/** §28 — nenhuma barra horizontal, em nenhuma largura. */
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

/**
 * Um instante futuro, em ISO COM offset, no formato do `datetime-local`.
 *
 * O input não aceita offset — ele quer `YYYY-MM-DDTHH:mm` no fuso local —, então
 * o helper devolve as DUAS formas: a que se digita e a que o servidor grava.
 *
 * `daysAhead` sempre positivo: o validador recusa passado, e um teste que
 * rodasse às 23h50 com `+0` mandaria um horário já vencido.
 */
function futureSlot(daysAhead: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, minute, 0, 0);

  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  // O rótulo que a tela vai exibir: "dd/mm às HH:MM" (formatSlot).
  const label = `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;

  return { local, label };
}

/** Preenche N campos de horário na tela do lojista e envia. */
async function offerSlots(dealer: Page, slots: Array<{ local: string }>) {
  const form = dealer.getByTestId("dealer-scheduling-form");
  await expect(form).toBeVisible({ timeout: 60_000 });

  for (let i = 1; i < slots.length; i += 1) {
    await form.getByTestId("dealer-scheduling-add").click();
  }

  const inputs = form.getByTestId("dealer-scheduling-input");
  await expect(inputs).toHaveCount(slots.length);

  for (let i = 0; i < slots.length; i += 1) {
    await inputs.nth(i).fill(slots[i].local);
  }

  await form.getByTestId("dealer-scheduling-submit").click();
  await expect(dealer.getByTestId("dealer-scheduling-sent")).toBeVisible({
    timeout: 30_000,
  });
}

/** O `scheduled_at` que o SERVIDOR gravou para o match VIGENTE. */
async function currentScheduledAt(page: Page, saleRequestId: string) {
  const res = await page.request.get(`/api/account/sale-requests/${saleRequestId}`);
  expect(res.ok(), `o detalhe respondeu ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as {
    inspection?: { scheduled_at?: string | null; state?: string } | null;
  };
  return body.inspection?.scheduled_at ?? null;
}

// ══════════════════════════════════════════════════════════════════════════

test.describe("@sale-request-scheduling o agendamento pelo portal e o WhatsApp", () => {
  /**
   * CADA TESTE COMEÇA DE UMA SOLICITAÇÃO NOVA.
   *
   * Os dois testes deste arquivo levam a MESMA solicitação semeada até um estado
   * terminal — um a deixa agendada com a Loja B, o outro em rodada 2. Sem este
   * reseed, o segundo a rodar não encontra nada no feed do lojista e falha com
   * "a solicitação semeada não está no feed", que é uma mensagem sobre o
   * fixture e não sobre o produto.
   *
   * `e2e-seed.mjs` APAGA as solicitações do proprietário (com toda a cascata:
   * agendas, slots, seleções, outcomes) e recria uma limpa. É o mesmo script do
   * `npm run e2e:prepare`, sem as migrations — que já rodaram.
   *
   * Chamado daqui, e não de um `globalSetup`: o setup global roda UMA vez para
   * o arquivo inteiro, e o que se precisa aqui é de isolamento entre TESTES.
   */
  test.beforeEach(() => {
    execFileSync(process.execPath, [path.join("scripts", "e2e-seed.mjs")], {
      cwd: repoRoot(),
      stdio: "pipe",
    });
  });

  test("agenda, confirma, encerra, resseleciona e agenda de novo", async ({ browser }) => {
    test.setTimeout(420_000);

    const ownerCtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerACtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerBCtx = await browser.newContext({ baseURL: BASE_URL });

    const page = await ownerCtx.newPage(); // o PROPRIETÁRIO
    const dealerA = await dealerACtx.newPage();
    const dealerB = await dealerBCtx.newPage();

    try {
      await login(page, OWNER);
      await login(dealerA, DEALER_A);
      await login(dealerB, DEALER_B);

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 1 a 3 — as ofertas e o aceite
      // ══════════════════════════════════════════════════════════════════════
      const saleRequestId = await findSeededSaleRequest(dealerA);

      await submitOffer(dealerB, saleRequestId, OFFER_B);
      await submitOffer(dealerA, saleRequestId, OFFER_A);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({
        timeout: 60_000,
      });

      const cardA = page
        .getByTestId("sale-request-proposal")
        .filter({ hasText: "R$ 65.000,00" });
      await cardA.getByTestId("sale-request-proposal-select").click();
      await page.getByTestId("sale-request-select-confirm").click();

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 4 — AS DUAS OPÇÕES, LADO A LADO   ← a captura 01
      // ══════════════════════════════════════════════════════════════════════
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 60_000 });

      await expect(page.getByTestId("handoff-store-name")).toContainText("Loja Atibaia");
      await expect(page.getByTestId("handoff-amount")).toContainText("65.000");
      await expect(page.getByTestId("handoff-address")).toBeVisible();

      // §9 — o portal diz de quem é a vez, e não inventa horário nenhum.
      await expect(page.getByTestId("owner-scheduling-waiting-text")).toContainText(
        "Aguardando a loja disponibilizar horários"
      );
      // §1 — E o WhatsApp está visível AO MESMO TEMPO. É esta coexistência que a
      // captura 01 precisa provar.
      await expect(page.getByTestId("handoff-whatsapp")).toBeVisible();
      await expect(page.getByTestId("handoff-two-paths")).toBeVisible();

      await expectNoRetiredEvaluation(page, "proprietário — oferta aceita");
      await expectNoContactLeak(page);
      await expectNoHorizontalOverflow(page, "oferta aceita, duas opções");

      await page.screenshot({
        path: SHOTS + "01-owner-oferta-aceita-duas-opcoes.png",
        fullPage: true,
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await page.screenshot({
        path: SHOTS + "11-mobile-390-duas-opcoes.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      // §7 — o link do WhatsApp, validado sem abrir o app externo.
      const whatsappA = await page.request.get(
        `/api/account/sale-requests/${saleRequestId}/handoff/whatsapp`
      );
      expect(whatsappA.ok()).toBeTruthy();
      const urlA = ((await whatsappA.json()) as { url: string }).url;
      expect(urlA).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/);
      const messageA = decodeURIComponent(urlA.split("text=")[1]);
      expect(messageA).toContain("Carros na Cidade");
      expect(messageA).toContain("T-Cross");
      expect(messageA).not.toMatch(/cpf|@|\d{5,}/i);

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 5 e 6 — A LOJA PROPÕE TRÊS HORÁRIOS   ← a captura 02
      // ══════════════════════════════════════════════════════════════════════
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      await expect(dealerA.getByTestId("dealer-handoff-accepted")).toBeVisible({
        timeout: 60_000,
      });
      await expect(dealerA.getByTestId("dealer-scheduling-form")).toBeVisible();

      // §4 — a loja agenda, e SÓ. Nada de ficha nem proposta final.
      await expectNoRetiredEvaluation(dealerA, "lojista — propor horários");
      await expectNoContactLeak(dealerA);
      await expectNoHorizontalOverflow(dealerA, "lojista — propor horários");

      await dealerA.screenshot({
        path: SHOTS + "02-dealer-propor-horarios.png",
        fullPage: true,
      });

      const slot1 = futureSlot(2, 10, 0);
      const slot2 = futureSlot(2, 14, 0);
      const slot3 = futureSlot(3, 9, 30);
      await offerSlots(dealerA, [slot1, slot2, slot3]);

      await expect(dealerA.getByTestId("dealer-scheduling-sent-slot")).toHaveCount(3);

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 7 e 8 — O PROPRIETÁRIO VÊ OS TRÊS   ← a captura 03
      // ══════════════════════════════════════════════════════════════════════
      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      const choose = page.getByTestId("owner-scheduling-choose");
      await expect(choose).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("owner-scheduling-slot")).toHaveCount(3);

      // Formatado em pt-BR, nunca o ISO cru (§11).
      await expect(choose).toContainText(slot1.label);
      await expect(choose).toContainText(slot2.label);
      await expect(choose).toContainText(slot3.label);

      // O WhatsApp continua ali durante a escolha.
      await expect(page.getByTestId("handoff-whatsapp")).toBeVisible();

      await expectNoHorizontalOverflow(page, "escolher horário");
      await page.screenshot({
        path: SHOTS + "03-owner-escolher-horario.png",
        fullPage: true,
      });

      // ══════════════════════════════════════════════════════════════════════
      // §35 — PEDIR NOVOS HORÁRIOS, e a loja responder   ← a captura 06
      // ══════════════════════════════════════════════════════════════════════
      await page.getByTestId("owner-scheduling-request-new").click();

      await expect(page.getByTestId("owner-scheduling-waiting-text")).toContainText(
        "Aguardando novos horários da loja",
        { timeout: 30_000 }
      );

      // A captura vem DEPOIS do clique, de propósito: o estado que distingue esta
      // tela da 03 é "Aguardando novos horários da loja". Capturada antes, ela
      // seria pixel a pixel a mesma imagem da 03 e não provaria nada.
      await page.screenshot({
        path: SHOTS + "06-owner-pedir-novos-horarios.png",
        fullPage: true,
      });

      // A loja vê o pedido e publica a RODADA 2.
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      await expect(dealerA.getByTestId("dealer-scheduling-new-requested")).toBeVisible({
        timeout: 60_000,
      });

      const slot4 = futureSlot(4, 11, 0);
      const slot5 = futureSlot(4, 16, 0);
      await offerSlots(dealerA, [slot4, slot5]);
      await expect(dealerA.getByTestId("dealer-scheduling-sent-slot")).toHaveCount(2);

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 9 a 11 — CONFIRMA UM HORÁRIO   ← a captura 04
      // ══════════════════════════════════════════════════════════════════════
      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-scheduling-choose")).toBeVisible({
        timeout: 60_000,
      });
      // A rodada 1 foi substituída: só os dois horários novos estão na mesa.
      await expect(page.getByTestId("owner-scheduling-slot")).toHaveCount(2);

      await page.getByTestId("owner-scheduling-slot").nth(1).click();
      await page.getByTestId("owner-scheduling-confirm").click();

      const confirmed = page.getByTestId("owner-scheduling-confirmed");
      await expect(confirmed).toBeVisible({ timeout: 30_000 });
      await expect(confirmed).toContainText("Avaliação agendada");
      await expect(page.getByTestId("owner-scheduling-when")).toContainText(slot5.label);

      // §10 do §32 — o status mudou de verdade, no banco.
      await expect(page.getByTestId("sale-request-detail-status")).toContainText(
        "Avaliação agendada"
      );

      // §13 — endereço E WhatsApp continuam na tela DEPOIS do agendamento.
      await expect(page.getByTestId("handoff-address")).toBeVisible();
      await expect(page.getByTestId("handoff-whatsapp")).toBeVisible();
      // §36 — e a saída continua disponível.
      await expect(page.getByTestId("handoff-no-agreement-cta")).toBeVisible();

      await expectNoRetiredEvaluation(page, "proprietário — avaliação agendada");
      await expectNoHorizontalOverflow(page, "avaliação agendada");

      await page.screenshot({
        path: SHOTS + "04-owner-avaliacao-agendada-whatsapp.png",
        fullPage: true,
      });

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 12 e 13 — A LOJA VÊ O CONFIRMADO, SEM AVALIAÇÃO   ← a captura 05
      // ══════════════════════════════════════════════════════════════════════
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      const dealerConfirmed = dealerA.getByTestId("dealer-scheduling-confirmed");
      await expect(dealerConfirmed).toBeVisible({ timeout: 60_000 });
      await expect(dealerConfirmed).toContainText("Avaliação agendada");
      await expect(dealerA.getByTestId("dealer-scheduling-when")).toContainText(
        slot5.label
      );
      await expect(dealerConfirmed).toContainText("O proprietário confirmou este horário");

      // §14 — read-only: o formulário de horários sai de cena e NADA o substitui.
      await expect(dealerA.getByTestId("dealer-scheduling-form")).toHaveCount(0);
      await expectNoRetiredEvaluation(dealerA, "lojista — horário confirmado");
      await expectNoContactLeak(dealerA);
      await expectNoHorizontalOverflow(dealerA, "lojista — horário confirmado");

      await dealerA.screenshot({
        path: SHOTS + "05-dealer-horario-confirmado.png",
        fullPage: true,
      });

      // A agenda A1, como o SERVIDOR a gravou. Guardada para o §34.
      const scheduledA1 = await currentScheduledAt(page, saleRequestId);
      expect(scheduledA1, "o servidor não gravou o horário confirmado").toBeTruthy();

      // ══════════════════════════════════════════════════════════════════════
      // §32 · 14 a 17 — NÃO HOUVE ACORDO, COM AGENDA CONFIRMADA
      // ══════════════════════════════════════════════════════════════════════
      // §36 — este é o gate herdado da 4.9A: dá para sair mesmo depois de marcar.
      await page.getByTestId("handoff-no-agreement-cta").click();
      await expect(page.getByTestId("handoff-no-agreement-dialog")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("handoff-no-agreement-dialog-confirm").click();

      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({
        timeout: 30_000,
      });
      await page.reload();
      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({
        timeout: 60_000,
      });

      // ────────────────────────────────────────────────────────────────────
      // §15 — A ASSERÇÃO CENTRAL DESTA FASE
      // ────────────────────────────────────────────────────────────────────
      // A agenda continua no banco (a 4.9A não a apaga — §16), e o DTO continua
      // trazendo-a, porque o ponteiro da seleção encerrada é preservado. O que
      // NÃO pode acontecer é a tela anunciá-la como compromisso vigente.
      const failedDto = await page.request.get(
        `/api/account/sale-requests/${saleRequestId}`
      );
      const failedBody = (await failedDto.json()) as {
        sale_request?: { status?: string };
        inspection?: { scheduled_at?: string | null } | null;
      };
      expect(failedBody.sale_request?.status).toBe("handoff_failed");
      // A prova de que o cenário é REAL, e não um caminho vazio: o dado perigoso
      // ESTÁ na resposta. Sem esta linha, as asserções seguintes passariam
      // trivialmente se o backend simplesmente omitisse a inspeção.
      expect(
        failedBody.inspection?.scheduled_at,
        "o cenário do §15 não foi exercitado: o DTO não trouxe a agenda histórica"
      ).toBeTruthy();

      await expect(page.getByTestId("owner-scheduling-confirmed")).toHaveCount(0);
      await expect(page.getByTestId("owner-scheduling-choose")).toHaveCount(0);
      await expect(page.getByTestId("owner-scheduling-waiting")).toHaveCount(0);

      const failedText = ((await page.locator("body").innerText()) || "").toLowerCase();
      expect(
        failedText,
        "a agenda histórica foi anunciada como agenda ativa"
      ).not.toContain("avaliação agendada");

      await expectNoHorizontalOverflow(page, "handoff_failed");
      await page.screenshot({
        path: SHOTS + "07-owner-handoff-failed-sem-agenda-ativa.png",
        fullPage: true,
      });

      // §19 — VER OUTRAS OFERTAS
      await expect(page.getByTestId("sale-request-proposals")).toContainText(
        "Outras ofertas recebidas"
      );
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(2);

      // Captura do BLOCO, e não da página: em `handoff_failed` a página inteira é
      // a mesma da captura 07, e uma segunda imagem idêntica não provaria nada.
      // O que o §19 pede é que as outras ofertas estejam aceitáveis, e é isso que
      // este recorte mostra — duas lojas, dois valores, dois "Aceitar oferta".
      await page
        .getByTestId("sale-request-proposals")
        .screenshot({ path: SHOTS + "08-owner-outras-ofertas.png" });

      // §20 — REPUBLICAR ANÚNCIO (nova rodada) está disponível.
      await expect(page.getByTestId("handoff-new-round-cta")).toBeVisible();
      await page.getByTestId("handoff-new-round-cta").click();
      await expect(page.getByTestId("handoff-new-round-dialog")).toBeVisible({
        timeout: 15_000,
      });
      await page.screenshot({ path: SHOTS + "09-owner-republicar.png", fullPage: true });
      await page.getByTestId("handoff-new-round-dialog-cancel").click();

      // ══════════════════════════════════════════════════════════════════════
      // §33 — RESSELEÇÃO A → B, e a agenda de A não atravessa   ← a captura 10
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

      // §33 — o match novo NASCE SEM AGENDA. A migration 061 é o que garante
      // isto: a inspeção de A pertence à SELEÇÃO de A, e a leitura parte de
      // `selected_offer_id` → seleção vigente → agenda daquela seleção.
      await expect(page.getByTestId("owner-scheduling-waiting-text")).toContainText(
        "Aguardando a loja disponibilizar horários"
      );
      await expect(page.getByTestId("owner-scheduling-confirmed")).toHaveCount(0);
      expect(await currentScheduledAt(page, saleRequestId)).toBeNull();

      // §31 — o WhatsApp acompanha o match ATUAL: agora é o da Loja B.
      const whatsappB = await page.request.get(
        `/api/account/sale-requests/${saleRequestId}/handoff/whatsapp`
      );
      expect(whatsappB.ok()).toBeTruthy();
      const urlB = ((await whatsappB.json()) as { url: string }).url;
      expect(urlB).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/);
      expect(
        urlB.split("?")[0],
        "o WhatsApp continuou apontando para a loja anterior"
      ).not.toBe(urlA.split("?")[0]);

      // A Loja A perdeu o acesso; a Loja B ganhou o formulário de horários.
      const blockedA = await dealerA.request.get(
        `/api/account/opportunities/sale-requests/${saleRequestId}`
      );
      expect(blockedA.status(), "a loja anterior continuou vendo a oportunidade").toBe(404);

      await dealerB.goto(`${DEALER_FEED}/${saleRequestId}`);
      await expect(dealerB.getByTestId("dealer-scheduling-form")).toBeVisible({
        timeout: 60_000,
      });
      // A agenda de A não vaza para a tela de B.
      await expect(dealerB.getByTestId("dealer-scheduling-confirmed")).toHaveCount(0);

      const slotB = futureSlot(5, 15, 0);
      await offerSlots(dealerB, [slotB]);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-scheduling-choose")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId("owner-scheduling-slot")).toHaveCount(1);
      await page.getByTestId("owner-scheduling-slot").first().click();
      await page.getByTestId("owner-scheduling-confirm").click();

      await expect(page.getByTestId("owner-scheduling-when")).toContainText(slotB.label, {
        timeout: 30_000,
      });

      // A prova por DADO: a agenda de B é um instante diferente do de A.
      const scheduledB = await currentScheduledAt(page, saleRequestId);
      expect(scheduledB).toBeTruthy();
      expect(
        scheduledB,
        "a agenda da loja B repetiu o instante da agenda da loja A"
      ).not.toBe(scheduledA1);

      await expectNoHorizontalOverflow(page, "segunda loja — agenda");
      await page.screenshot({
        path: SHOTS + "10-owner-segunda-loja-agenda.png",
        fullPage: true,
      });

      await expectNoRetiredEvaluation(page, "proprietário — segunda loja agendada");
    } finally {
      await ownerCtx.close();
      await dealerACtx.close();
      await dealerBCtx.close();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // §34 — A MESMA LOJA, DUAS RODADAS, DUAS AGENDAS
  // ══════════════════════════════════════════════════════════════════════════
  /**
   * O cenário que `advertiser_id` NÃO distingue.
   *
   *   Rodada 1: Loja A aceita → agenda A1 → não houve acordo
   *   Rodada 2: Loja A aceita DE NOVO → agenda A2
   *
   * As duas inspeções têm o MESMO `sale_request_id` e o MESMO `advertiser_id`.
   * Antes da migration 061 a segunda sequer entraria (a UNIQUE por solicitação a
   * recusava); com a 061 ela entra, e o que impede a tela de ler a errada é o
   * `selection_id`.
   *
   * Teste PRÓPRIO e não uma continuação do anterior: ele precisa de uma
   * solicitação em rodada nova, e encadeá-lo no primeiro tornaria o diagnóstico
   * de uma falha aqui dependente de tudo o que veio antes.
   *
   * Reusa os MESMOS contextos? Não — `browser.newContext()` custa quase nada, e
   * o que não pode se repetir é o LOGIN (§38). Este teste faz 2, o anterior 3:
   * cinco no arquivo, contra o limite de 10 por janela.
   */
  test("§34 — rodada 2 com a mesma loja mostra A2, nunca A1", async ({ browser }) => {
    test.setTimeout(300_000);

    const ownerCtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerACtx = await browser.newContext({ baseURL: BASE_URL });

    const page = await ownerCtx.newPage();
    const dealerA = await dealerACtx.newPage();

    try {
      await login(page, OWNER);
      await login(dealerA, DEALER_A);

      const saleRequestId = await findSeededSaleRequest(dealerA);

      // ── RODADA 1 — Loja A aceita e agenda A1 ────────────────────────────
      await submitOffer(dealerA, saleRequestId, OFFER_A);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({
        timeout: 60_000,
      });
      await page
        .getByTestId("sale-request-proposal")
        .filter({ hasText: "R$ 65.000,00" })
        .getByTestId("sale-request-proposal-select")
        .click();
      await page.getByTestId("sale-request-select-confirm").click();
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 30_000 });

      const a1 = futureSlot(2, 8, 0);
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      await offerSlots(dealerA, [a1]);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-scheduling-choose")).toBeVisible({
        timeout: 60_000,
      });
      await page.getByTestId("owner-scheduling-slot").first().click();
      await page.getByTestId("owner-scheduling-confirm").click();
      await expect(page.getByTestId("owner-scheduling-when")).toContainText(a1.label, {
        timeout: 30_000,
      });

      const scheduledA1 = await currentScheduledAt(page, saleRequestId);
      expect(scheduledA1).toBeTruthy();

      // ── NÃO HOUVE ACORDO + NOVA RODADA ──────────────────────────────────
      await page.getByTestId("handoff-no-agreement-cta").click();
      await page.getByTestId("handoff-no-agreement-dialog-confirm").click();
      await expect(page.getByTestId("owner-handoff-failed")).toBeVisible({
        timeout: 30_000,
      });

      await page.getByTestId("handoff-new-round-cta").click();
      await expect(page.getByTestId("handoff-new-round-dialog")).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("handoff-new-round-minimum").fill("58000");
      await page.getByTestId("handoff-new-round-dialog-confirm").click();

      // ── RODADA 2 — a MESMA Loja A oferta, é aceita, e agenda A2 ─────────
      await expect(page.getByTestId("sale-request-detail-status")).toContainText(
        "Recebendo ofertas",
        { timeout: 30_000 }
      );

      await submitOffer(dealerA, saleRequestId, OFFER_A);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("sale-request-proposals")).toBeVisible({
        timeout: 60_000,
      });
      await page
        .getByTestId("sale-request-proposal")
        .filter({ hasText: "R$ 65.000,00" })
        .getByTestId("sale-request-proposal-select")
        .click();
      await page.getByTestId("sale-request-select-confirm").click();
      await expect(page.getByTestId("owner-handoff")).toBeVisible({ timeout: 30_000 });
      await page.reload();

      // A agenda A1 NÃO atravessou a rodada, embora seja da mesma loja.
      await expect(page.getByTestId("owner-scheduling-waiting-text")).toContainText(
        "Aguardando a loja disponibilizar horários",
        { timeout: 60_000 }
      );
      await expect(page.getByTestId("owner-scheduling-confirmed")).toHaveCount(0);
      expect(await currentScheduledAt(page, saleRequestId)).toBeNull();

      // A2 — outro instante, de propósito: é o que permite distinguir.
      const a2 = futureSlot(6, 17, 30);
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      await offerSlots(dealerA, [a2]);

      await page.goto(`${OWNER_LIST}/${saleRequestId}`);
      await expect(page.getByTestId("owner-scheduling-choose")).toBeVisible({
        timeout: 60_000,
      });
      await page.getByTestId("owner-scheduling-slot").first().click();
      await page.getByTestId("owner-scheduling-confirm").click();

      await expect(page.getByTestId("owner-scheduling-when")).toContainText(a2.label, {
        timeout: 30_000,
      });

      // A prova, nos dois sentidos: A2 aparece, A1 não.
      const scheduledA2 = await currentScheduledAt(page, saleRequestId);
      expect(scheduledA2).toBeTruthy();
      expect(scheduledA2, "a rodada 2 leu a agenda da rodada 1").not.toBe(scheduledA1);

      const text = (await page.locator("body").innerText()) || "";
      expect(text, "a agenda A1 reapareceu na rodada 2").not.toContain(a1.label);
      expect(text).toContain(a2.label);

      // A loja também vê A2, e só A2.
      await dealerA.goto(`${DEALER_FEED}/${saleRequestId}`);
      await expect(dealerA.getByTestId("dealer-scheduling-when")).toContainText(a2.label, {
        timeout: 60_000,
      });
      const dealerText = (await dealerA.locator("body").innerText()) || "";
      expect(dealerText).not.toContain(a1.label);

      await expectNoRetiredEvaluation(dealerA, "lojista — rodada 2 agendada");
    } finally {
      await ownerCtx.close();
      await dealerACtx.close();
    }
  });
});
