import { expect, test } from "@playwright/test";

/**
 * Fase 4.6 — a DECISÃO DO PROPRIETÁRIO sobre a proposta final, ponta a ponta.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O SETUP É POR API; O QUE ESTA FASE ADICIONA É PELA TELA
 * ════════════════════════════════════════════════════════════════════════════
 * Levar a solicitação de `receiving_offers` até `final_offer_submitted` custa,
 * pela interface, seis logins e ~30 interações — e esse caminho já é coberto,
 * clique a clique, pelo E2E da 4.5.
 *
 * Aqui ele é percorrido pelos MESMOS endpoints reais, via `page.request`: banco
 * real, transações reais, FKs reais, relações reais. O que muda é só o modo de
 * chamar. Repetir a UI inteira não provaria nada de novo sobre a 4.6 e tornaria
 * cada asserção desta fase refém de um defeito de qualquer uma das anteriores.
 *
 * O que a 4.6 acrescenta — o painel, o diálogo, a persistência e o desfecho nas
 * duas telas — é exercitado pela INTERFACE, que é onde ele existe.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS CENÁRIOS, DOIS VEÍCULOS
 * ════════════════════════════════════════════════════════════════════════════
 * Aceitar e recusar são TERMINAIS e mutuamente exclusivos: a mesma solicitação
 * não pode fazer os dois. O segundo cenário publica um veículo PRÓPRIO (uma
 * Fiat Toro, para não colidir com a T-Cross do seed) e o leva ao mesmo estado.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UM CONTEXTO POR CONTA — TRÊS LOGINS NO TOTAL
 * ════════════════════════════════════════════════════════════════════════════
 * `loginRateLimit` permite 10 logins por IP a cada 15 minutos, e todo o E2E sai
 * do mesmo 127.0.0.1.
 *
 * A primeira versão deste arquivo alternava sessões numa página só, com
 * `clearCookies()` + login a cada troca — o padrão que os specs anteriores usam.
 * Com dois veículos e três contas isso deu ONZE logins, e o teste passou a ser
 * PULADO por cota antes de chegar à primeira asserção: um vermelho que não é
 * defeito, e um verde que nunca acontece.
 *
 * Aqui cada conta tem o próprio `BrowserContext`, com o próprio cofre de
 * cookies. As três sessões vivem em paralelo e ninguém precisa se reautenticar
 * para "voltar a ser" quem já era. São 3 logins, e o orçamento deixa de ser um
 * fator de desenho do teste.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO É TERMINAL — E O SEED É O RESET
 * ════════════════════════════════════════════════════════════════════════════
 * Ao final, as duas solicitações ficam decididas para sempre. Rodar de novo SEM
 * re-semear encontra a T-Cross já decidida e falha no primeiro passo —
 * corretamente. O spec diz isso na mensagem, em vez de falhar num `expect`
 * distante da causa.
 *
 * PRÉ-REQUISITOS (fora do CI padrão)
 *   npm run e2e:prepare      # migrations (inclui a 059) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/sale-request-owner-final-decision.spec.ts
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };

const DEALER_FEED = "/dashboard-loja/oportunidades/veiculos";
const OWNER_LIST = "/dashboard/vender-para-lojas";

/**
 * Os contextos são criados à mão (um por conta), e `newContext()` NÃO herda o
 * `baseURL` do config — só a fixture `page` herda. Sem isto, todo
 * `page.goto("/dashboard/...")` falharia com "Invalid URL".
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

/** As capturas do §42. Caminho relativo ao `frontend/`, que é o cwd do runner. */
const SHOTS = "../reports/screenshots/fase-4-6/";

const OFFER_A = 65000; // a selecionada — a MENOR, como manda a 4.4
const OFFER_B = 67000; // a maior da disputa
const FINAL_AMOUNT = 60000; // a proposta final, abaixo de tudo

const OBSERVED_KM = 64230;

type Page = import("@playwright/test").Page;

/** As larguras do §37. 360 é o menor telefone que ainda importa. */
const VIEWPORTS = [360, 390, 412, 768, 1024, 1440];

const FORBIDDEN_CONTACT = [
  "whatsapp",
  "telefone",
  "e-mail",
  "email",
  "cpf@carrosnacidade.com",
  "cnpj@carrosnacidade.com",
];

/**
 * As frases que NENHUMA tela desta fase pode AFIRMAR (§41).
 *
 * A varredura ignora a RESSALVA, que contém "venda concluída" de propósito —
 * para negá-la ("ainda não representa pagamento, transferência ou venda
 * concluída"). Sem esse recorte, o teste acusaria justamente o texto que existe
 * para impedir a leitura errada, e a "correção" óbvia seria apagar a ressalva.
 */
const DISCLAIMER_FRAGMENT =
  "ainda não representa pagamento, transferência ou venda concluída";
const DIALOG_DISCLAIMER_FRAGMENT =
  "pagamento e transferência do veículo não fazem parte desta confirmação";

const FORBIDDEN_COPY = [
  "venda concluída",
  "veículo vendido",
  "negócio fechado",
  "negócio concluído",
  "pagamento realizado",
  "pagamento confirmado",
  "compra concluída",
];

function withoutDisclaimers(text: string): string {
  return text
    .split(DISCLAIMER_FRAGMENT)
    .join(" ")
    .split(DIALOG_DISCLAIMER_FRAGMENT)
    .join(" ");
}

/**
 * Autentica ESTE contexto. Devolve o `id` da conta — a segunda solicitação
 * precisa dele para montar as chaves de foto (ver `publishSecondRequest`).
 *
 * NÃO limpa cookies: cada conta tem o próprio contexto, e limpar aqui
 * destruiria a sessão que acabou de ser criada em outro ponto do teste.
 */
async function login(
  page: Page,
  user: { email: string; password: string }
): Promise<string> {
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

  const body = (await res.json()) as { user?: { id?: string | number } };
  return String(body.user?.id ?? "");
}

async function expectNoContactLeak(page: Page) {
  const text = ((await page.locator("body").innerText()) || "").toLowerCase();
  for (const term of FORBIDDEN_CONTACT) {
    expect(text, `a tela vazou "${term}"`).not.toContain(term);
  }
}

/** §41 — a varredura da tela inteira, com a ressalva recortada. */
async function expectNoSaleCompletedCopy(page: Page) {
  const raw = ((await page.locator("body").innerText()) || "").toLowerCase();
  const text = withoutDisclaimers(raw);
  for (const phrase of FORBIDDEN_COPY) {
    expect(text, `a tela afirmou "${phrase}"`).not.toContain(phrase);
  }
}

/** Nenhuma barra horizontal, em nenhuma largura (§37). */
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

// ────────────────────────────────────────────────────────────────────────────
// O SETUP, PELOS ENDPOINTS REAIS
// ────────────────────────────────────────────────────────────────────────────

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
      "decidiu a proposta final (o estado é terminal). Rode: npm run e2e:prepare"
  ).toBeTruthy();

  return String(target!.id);
}

/**
 * Publica uma solicitação NOVA para o segundo cenário.
 *
 * Aceitar e recusar são terminais e mutuamente exclusivos — a mesma solicitação
 * não pode fazer os dois. Um veículo diferente (Fiat Toro) evita qualquer
 * colisão com o seletor por texto que localiza a T-Cross do seed.
 */
async function publishSecondRequest(page: Page, ownerId: string): Promise<string> {
  // A busca de cidades EXIGE `uf` e devolve `data` (não `items`) — é a rota
  // pública, e não a do painel.
  const cities = await page.request.get("/api/painel/cidades/search?uf=SP&q=Atibaia");
  expect(cities.ok(), `busca de cidade respondeu ${cities.status()}`).toBeTruthy();
  const cityBody = (await cities.json()) as { data?: Array<{ id: number; name: string }> };
  const city = (cityBody.data || []).find((item) => /Atibaia/i.test(item.name));
  expect(city, "Atibaia não encontrada na busca de cidades").toBeTruthy();

  /**
   * As fotos são obrigatórias (mínimo 4) e a chave precisa ter o prefixo do
   * DONO — `sale-requests/{ownerId}/`. É a validação de posse que impede alguém
   * de reivindicar a foto de outra pessoa, e ela vale aqui como vale em
   * produção.
   *
   * O nome do arquivo difere do que o seed usa: `storage_key` tem UNIQUE
   * GLOBAL, e reaproveitar as chaves da T-Cross faria o INSERT falhar por
   * constraint em vez de publicar.
   *
   * O arquivo não existe no storage, e não precisa existir: a validação é sobre
   * a CHAVE. As imagens simplesmente não carregam na tela — o esperado num
   * ambiente sem bucket, exatamente como já acontece com o seed.
   */
  const images = [0, 1, 2, 3].map(
    (index) => `sale-requests/${ownerId}/e2e/2026/08/toro-${index}.webp`
  );

  const res = await page.request.post("/api/account/sale-requests", {
    data: {
      city_id: city!.id,
      brand: "Fiat",
      // A descrição FIPE completa, e não o rótulo comercial: é o que o backend
      // grava em `sale_requests.model`, e mandar "Toro" seco faria a taxonomia
      // do domínio divergir.
      fipe_model_description: "Toro Freedom 1.8 16V Flex Aut.",
      year: "2021",
      mileage: "58000",
      transmission: "automatico",
      fuel_type: "flex",
      declared_condition: "bom",
      minimum_accepted_price: "62500",
      images,
      tire_condition: "good",
      financing_status: "no",
      fines_status: "no",
      ipva_status: "paid",
      licensing_status: "ok",
      caution_report_status: "not_available",
      auction_history: "no",
      collision_history: "no",
      engine_condition: "ok",
      gearbox_condition: "ok",
      suspension_condition: "ok",
      body_paint_status: "none",
      body_paint_issues: [],
    },
    headers: { "Content-Type": "application/json" },
  });

  expect(
    res.status(),
    `a publicação da segunda solicitação respondeu ${res.status()}: ${await res.text()}`
  ).toBe(201);

  const body = (await res.json()) as { sale_request: { id: number | string } };
  return String(body.sale_request.id);
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
    `a proposta de ${amount} respondeu ${res.status()}: ${await res.text()}`
  ).toBeTruthy();
}

async function selectOffer(page: Page, saleRequestId: string, amount: number) {
  const detail = await page.request.get(`/api/account/sale-requests/${saleRequestId}`);
  expect(detail.ok(), `o detalhe respondeu ${detail.status()}`).toBeTruthy();

  const body = (await detail.json()) as {
    proposals?: Array<{ id: number | string; amount: string }>;
  };
  const target = (body.proposals || []).find(
    (proposal) => Math.round(Number(proposal.amount)) === amount
  );
  expect(target, `nenhuma proposta de ${amount} para selecionar`).toBeTruthy();

  const res = await page.request.post(
    `/api/account/sale-requests/${saleRequestId}/select-offer`,
    {
      data: { offer_id: String(target!.id) },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(res.ok(), `a seleção respondeu ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/** ISO 8601 COM offset — o formato que o servidor exige. */
function futureIso(daysAhead: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 30, 0, 0);

  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const offset = `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`;

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:00${offset}`;
}

async function offerSlots(page: Page, saleRequestId: string) {
  const res = await page.request.post(
    `/api/account/opportunities/sale-requests/${saleRequestId}/inspection/slots`,
    {
      data: { slots: [futureIso(2, 9), futureIso(3, 10)] },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(res.ok(), `os horários responderam ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function confirmSlot(page: Page, saleRequestId: string) {
  const detail = await page.request.get(`/api/account/sale-requests/${saleRequestId}`);
  expect(detail.ok()).toBeTruthy();

  const body = (await detail.json()) as {
    inspection?: { slots?: Array<{ id: number | string }> };
  };
  const slot = (body.inspection?.slots || [])[0];
  expect(slot, "nenhum horário disponível para confirmar").toBeTruthy();

  const res = await page.request.post(
    `/api/account/sale-requests/${saleRequestId}/inspection/confirm`,
    {
      data: { slot_id: String(slot!.id) },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(res.ok(), `a confirmação respondeu ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function completeInspection(page: Page, saleRequestId: string) {
  const res = await page.request.post(
    `/api/account/opportunities/sale-requests/${saleRequestId}/inspection/complete`,
    {
      data: {
        observed_mileage: String(OBSERVED_KM),
        observed_condition: "regular",
        observed_tire_condition: "replace_now",
        observed_engine_condition: "ok",
        observed_gearbox_condition: "ok",
        observed_suspension_condition: "issue",
        observed_body_paint_status: "issues",
        observed_body_paint_issues: ["scratches"],
        inspection_notes: "Pneus no limite e ruído na suspensão dianteira.",
      },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(res.ok(), `a avaliação respondeu ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function submitFinalOffer(page: Page, saleRequestId: string) {
  const res = await page.request.post(
    `/api/account/opportunities/sale-requests/${saleRequestId}/decision`,
    {
      data: {
        decision_type: "final_offer",
        final_amount: String(FINAL_AMOUNT),
        adjustment_reason: "mileage_difference",
        adjustment_note: "Odômetro acima do informado e pneus para troca.",
        internal_note: "Margem apertada — avisar o gerente antes de fechar.",
      },
      headers: { "Content-Type": "application/json" },
    }
  );
  expect(
    res.ok(),
    `a proposta final respondeu ${res.status()}: ${await res.text()}`
  ).toBeTruthy();
}

// ────────────────────────────────────────────────────────────────────────────

test.describe("@sale-request-final-decision a decisão do proprietário", () => {
  test("aceita uma proposta final, recusa outra, e nenhuma diz venda concluída", async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    // Um contexto por conta: três cofres de cookies independentes, três logins,
    // e nenhuma reautenticação para "voltar a ser" quem já era.
    const ownerCtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerACtx = await browser.newContext({ baseURL: BASE_URL });
    const dealerBCtx = await browser.newContext({ baseURL: BASE_URL });

    const page = await ownerCtx.newPage(); // a tela do PROPRIETÁRIO
    const dealerA = await dealerACtx.newPage();
    const dealerB = await dealerBCtx.newPage();

    try {
      // ══════════════════════════════════════════════════════════════════════
      // SETUP — as duas solicitações até `final_offer_submitted`
      // ══════════════════════════════════════════════════════════════════════

      const ownerId = await login(page, OWNER);
      expect(ownerId, "o login não devolveu o id da conta").not.toBe("");
      await login(dealerA, DEALER_A);
      await login(dealerB, DEALER_B);

      // A loja A encontra a solicitação semeada; a PF publica a segunda.
      const acceptId = await findSeededSaleRequest(dealerA);
      const rejectId = await publishSecondRequest(page, ownerId);

      // As duas lojas propõem no primeiro; só a A no segundo — basta uma
      // perdedora para provar o 404, e ela já existe.
      await submitOffer(dealerA, acceptId, OFFER_A);
      await submitOffer(dealerA, rejectId, OFFER_A);
      await submitOffer(dealerB, acceptId, OFFER_B);

      // A PF escolhe a MENOR proposta — a regra da 4.4, revalidada de passagem.
      await selectOffer(page, acceptId, OFFER_A);
      await selectOffer(page, rejectId, OFFER_A);

      await offerSlots(dealerA, acceptId);
      await offerSlots(dealerA, rejectId);

      await confirmSlot(page, acceptId);
      await confirmSlot(page, rejectId);

      await completeInspection(dealerA, acceptId);
      await submitFinalOffer(dealerA, acceptId);
      await completeInspection(dealerA, rejectId);
      await submitFinalOffer(dealerA, rejectId);

      // ══════════════════════════════════════════════════════════════════════
      // CENÁRIO 1 — O ACEITE (§37)
      // ══════════════════════════════════════════════════════════════════════

      await page.goto(`${OWNER_LIST}/${acceptId}`);

      // ── 2 a 5. A PF vê preliminar, final, diferença e justificativa ──────
      const panel = page.getByTestId("owner-final-decision");
      await expect(panel).toBeVisible({ timeout: 60_000 });

      await expect(panel).toContainText("65.000"); // a preliminar
      await expect(page.getByTestId("owner-final-amount")).toContainText("60.000");
      await expect(page.getByTestId("owner-final-difference")).toContainText("5.000");
      await expect(page.getByTestId("owner-final-reason")).toContainText("Quilometragem");

      // A nota INTERNA da loja não está em lugar nenhum da página.
      await expect(page.locator("body")).not.toContainText("Margem apertada");

      await expectNoContactLeak(page);
      await expectNoHorizontalOverflow(page, "aceite — antes da decisão");

      await page.screenshot({
        path: SHOTS + "01-owner-proposta-final-com-acoes.png",
        fullPage: true,
      });

      // ── 6 a 8. O diálogo mostra o valor e NÃO diz venda concluída ────────
      await page.getByTestId("owner-final-decision-accept-cta").click();

      const dialog = page.getByTestId("owner-final-decision-dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("owner-final-decision-dialog-amount")).toContainText(
        "60.000"
      );
      await expect(dialog).toContainText("aceitando a proposta final");
      // A ressalva — o texto mais importante desta fase.
      await expect(dialog).toContainText("não fazem parte desta confirmação");
      await expectNoSaleCompletedCopy(page);

      await page.screenshot({
        path: SHOTS + "02-owner-modal-aceite.png",
        fullPage: true,
      });

      // ── 9 e 10. Confirma, e o estado PERSISTE ────────────────────────────
      await page.getByTestId("owner-final-decision-confirm").click();
      await expect(page.getByTestId("owner-final-decision-accepted")).toBeVisible({
        timeout: 30_000,
      });

      // ── 11. Recarrega: o SERVIDOR confirma o que a tela disse ────────────
      await page.reload();
      await expect(page.getByTestId("owner-final-decision-accepted")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId("sale-request-detail-status")).toContainText(
        "Proposta final aceita"
      );
      await expect(page.getByTestId("owner-decided-amount")).toContainText("60.000");

      // ── 12. Os botões SUMIRAM — não ficaram desabilitados ────────────────
      await expect(page.getByTestId("owner-final-decision-actions")).toHaveCount(0);
      await expect(page.getByTestId("owner-final-decision-accept-cta")).toHaveCount(0);
      await expect(page.getByTestId("owner-final-decision-reject-cta")).toHaveCount(0);

      // A ressalva ESTÁ na tela, e nenhuma frase afirma conclusão de venda.
      await expect(page.getByTestId("owner-final-decision-accepted")).toContainText(
        "não representa pagamento"
      );
      await expectNoSaleCompletedCopy(page);
      await expectNoContactLeak(page);

      await page.screenshot({
        path: SHOTS + "03-owner-aceita-desktop.png",
        fullPage: true,
      });

      await expectNoHorizontalOverflow(page, "aceite — depois da decisão");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      await page.screenshot({
        path: SHOTS + "04-owner-aceita-mobile-390.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });

      // ══════════════════════════════════════════════════════════════════════
      // CENÁRIO 2 — A RECUSA (§38)
      // ══════════════════════════════════════════════════════════════════════

      await page.goto(`${OWNER_LIST}/${rejectId}`);
      await expect(page.getByTestId("owner-final-decision")).toBeVisible({ timeout: 60_000 });

      await page.getByTestId("owner-final-decision-reject-cta").click();

      const rejectDialog = page.getByTestId("owner-final-decision-dialog");
      await expect(rejectDialog).toBeVisible({ timeout: 15_000 });
      // §22 — o aviso de que a disputa NÃO recomeça sozinha.
      await expect(rejectDialog).toContainText(
        "não voltará automaticamente a receber propostas"
      );
      // §15 — recusar não pede motivo: nenhum campo no diálogo.
      await expect(rejectDialog.locator("input, textarea, select")).toHaveCount(0);

      await page.screenshot({
        path: SHOTS + "06-owner-modal-recusa.png",
        fullPage: true,
      });

      await page.getByTestId("owner-final-decision-confirm").click();
      await expect(page.getByTestId("owner-final-decision-rejected")).toBeVisible({
        timeout: 30_000,
      });

      await page.reload();
      await expect(page.getByTestId("owner-final-decision-rejected")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByTestId("sale-request-detail-status")).toContainText(
        "Proposta final recusada"
      );
      await expect(page.getByTestId("owner-final-decision-actions")).toHaveCount(0);

      // §38 — a disputa NÃO reaparece. Nenhuma proposta antiga volta à tela
      // como se ainda valesse.
      await expect(page.getByTestId("sale-request-proposal")).toHaveCount(0);
      await expect(page.getByTestId("sale-request-proposal-select")).toHaveCount(0);

      await expectNoSaleCompletedCopy(page);
      await expectNoContactLeak(page);
      await expectNoHorizontalOverflow(page, "recusa — depois da decisão");

      await page.screenshot({
        path: SHOTS + "07-owner-proposta-recusada.png",
        fullPage: true,
      });

      // ══════════════════════════════════════════════════════════════════════
      // AS DUAS TELAS DA LOJA (§25, §26)
      // ══════════════════════════════════════════════════════════════════════

      // ── 13 e 14. O ACEITE, sem contato da PF ─────────────────────────────
      await dealerA.goto(`${DEALER_FEED}/${acceptId}`);
      const dealerAccepted = dealerA.getByTestId("dealer-decision-sent");
      await expect(dealerAccepted).toBeVisible({ timeout: 60_000 });

      await expect(dealerAccepted).toContainText("aceitou sua proposta final");
      await expect(dealerA.getByTestId("dealer-decision-sent-amount")).toContainText("60.000");
      await expect(dealerA.getByTestId("dealer-owner-decision-accepted")).toContainText(
        "decisão comercial foi registrada"
      );

      // Read-only: nenhum formulário de nova proposta, edição ou avaliação.
      await expect(dealerA.getByTestId("dealer-decision-form")).toHaveCount(0);
      await expect(dealerA.getByTestId("dealer-offer-amount")).toHaveCount(0);
      await expect(dealerA.getByTestId("dealer-inspection-form")).toHaveCount(0);

      await expectNoContactLeak(dealerA);
      await expectNoSaleCompletedCopy(dealerA);
      await expectNoHorizontalOverflow(dealerA, "lojista — proposta aceita");

      await dealerA.screenshot({
        path: SHOTS + "05-dealer-proposta-aceita.png",
        fullPage: true,
      });

      // ── A RECUSA, em texto neutro ────────────────────────────────────────
      await dealerA.goto(`${DEALER_FEED}/${rejectId}`);
      const dealerRejected = dealerA.getByTestId("dealer-decision-sent");
      await expect(dealerRejected).toBeVisible({ timeout: 60_000 });

      await expect(dealerRejected).toContainText("não aceita");
      await expect(dealerA.getByTestId("dealer-owner-decision-rejected")).toBeVisible();
      await expect(dealerA.getByTestId("dealer-decision-form")).toHaveCount(0);
      await expect(dealerA.getByTestId("dealer-offer-amount")).toHaveCount(0);

      await expectNoContactLeak(dealerA);
      await expectNoHorizontalOverflow(dealerA, "lojista — proposta não aceita");

      await dealerA.screenshot({
        path: SHOTS + "08-dealer-proposta-nao-aceita.png",
        fullPage: true,
      });

      // ── 15. A loja PERDEDORA continua com 404 nos DOIS estados novos ─────
      for (const [label, id] of [
        ["aceita", acceptId],
        ["recusada", rejectId],
      ] as const) {
        const blocked = await dealerB.request.get(
          `/api/account/opportunities/sale-requests/${id}`
        );
        expect(
          blocked.status(),
          `a loja perdedora acessou a oportunidade ${label}`
        ).toBe(404);
      }
    } finally {
      await ownerCtx.close().catch(() => {});
      await dealerACtx.close().catch(() => {});
      await dealerBCtx.close().catch(() => {});
    }
  });
});
