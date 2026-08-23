import { expect, test } from "@playwright/test";

/**
 * Fase 4.4 — a ESCOLHA do proprietário, ponta a ponta.
 *
 * É o E2E principal da fase, e o único lugar onde as três pontas se encontram:
 * backend real, PostgreSQL real, a pessoa física e DUAS lojas diferentes
 * disputando o mesmo carro.
 *
 *   duas lojas propõem (A = 65.000, B = 67.000)
 *        -> a PF abre a solicitação e vê DUAS propostas atuais
 *        -> escolhe DELIBERADAMENTE a MENOR (A)
 *        -> confirma no diálogo
 *        -> a tela passa a "Proposta selecionada", e as perdedoras somem
 *        -> a loja A vê "Sua proposta foi selecionada", em leitura
 *        -> a loja B perde o acesso e não consegue mais propor
 *        -> nenhum contato entre PF e lojista aparece em lugar nenhum
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A MENOR PROPOSTA É O CENTRO DESTE ARQUIVO (§28)
 * ────────────────────────────────────────────────────────────────────────────
 * A escolha da menor não está aqui por completude. Ela é a diferença entre um
 * leilão assistido e um leilão automático, e é invisível em qualquer outro
 * teste: um sistema que silenciosamente aceitasse só o maior lance passaria em
 * tudo o mais e falharia só aqui — na tela, com dinheiro real na frente da
 * pessoa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM TESTE SÓ, COM MUITA ASSERÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Mesma razão do E2E da 4.3: `loginRateLimit` permite 10 logins por IP a cada 15
 * minutos, e todo o E2E sai do mesmo 127.0.0.1. Quebrar isto em seis testes
 * independentes gastaria o balde e deixaria os últimos vermelhos por 401 — não
 * por defeito do produto, mas por terem gastado a cota. Este arquivo faz 5
 * logins no total.
 *
 * Pelo mesmo motivo, rodar este arquivo LOGO DEPOIS de `dealer-sale-offers.spec`
 * (que faz 4) tende a estourar a janela. Rode um por vez, ou espere os 15
 * minutos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O ESTADO É TERMINAL — E O SEED É O RESET
 * ────────────────────────────────────────────────────────────────────────────
 * A seleção é irreversível (§8): depois de rodar, a solicitação semeada fica em
 * `offer_selected` para sempre. Rodar de novo SEM re-semear encontra uma
 * solicitação já decidida e falha logo no primeiro passo — corretamente.
 *
 * Por isso o spec exige `npm run e2e:prepare` antes de cada execução, e diz isso
 * na mensagem quando a pré-condição não bate, em vez de falhar num `expect`
 * distante da causa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PRÉ-REQUISITOS (fora do CI padrão)
 * ────────────────────────────────────────────────────────────────────────────
 *   npm run e2e:prepare      # migrations (inclui a 057) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/sale-request-offer-selection.spec.ts
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito. A
// disputa precisa de duas lojas ATIVAS na MESMA cidade da solicitação.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };

const DEALER_FEED = "/dashboard-loja/oportunidades/veiculos";
const OWNER_LIST = "/dashboard/vender-para-lojas";

/** Loja A propõe menos que a B — e é a que a PF vai escolher. */
const OFFER_A = 65000;
const OFFER_B = 67000;

type Page = import("@playwright/test").Page;

/**
 * Login com diagnóstico honesto.
 *
 * Um 429 aqui NÃO é falha do produto — é o balde de `loginRateLimit` esgotado,
 * quase sempre por uma rodada anterior do próprio E2E nos últimos 15 minutos.
 * Sem esta distinção o sintoma vira um 401 alguns passos adiante, e a pessoa
 * procura o bug no lugar errado.
 */
async function login(page: Page, user: { email: string; password: string }) {
  await page.context().clearCookies();
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

/**
 * O id da solicitação semeada, descoberto pelo FEED do lojista.
 *
 * Lê em vez de fixar um número: o seed roda de novo e a linha muda de id. Se ela
 * não aparecer no feed, a causa quase sempre é uma das duas pré-condições — o
 * seed não rodou, ou a solicitação já foi decidida por uma rodada anterior (e
 * por isso saiu do feed, que é o comportamento correto da fase).
 */
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
      "selecionou uma proposta (a seleção é irreversível). Rode: npm run e2e:prepare"
  ).toBeTruthy();

  return String(target!.id);
}

/** Preenche o campo de proposta e envia. `amount` em reais inteiros. */
async function submitOffer(page: Page, saleRequestId: string, amount: number) {
  await page.goto(`${DEALER_FEED}/${saleRequestId}`);
  await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible({
    timeout: 60_000,
  });

  const field = page.getByTestId("dealer-offer-amount");
  await field.fill("");
  await field.type(String(amount * 100));
  await page.getByTestId("dealer-offer-submit").click();
  await expect(page.getByTestId("dealer-offer-success")).toBeVisible({ timeout: 30_000 });
}

/** Termos que NUNCA podem aparecer em nenhuma das duas telas. */
const FORBIDDEN_CONTACT = [
  "whatsapp",
  "telefone",
  "e-mail",
  "email",
  "cpf@carrosnacidade.com",
  "cnpj@carrosnacidade.com",
];

async function expectNoContactLeak(page: Page) {
  const text = ((await page.locator("body").innerText()) || "").toLowerCase();
  for (const term of FORBIDDEN_CONTACT) {
    expect(text, `a tela vazou "${term}"`).not.toContain(term);
  }
}

test.describe("@sale-request-selection a escolha preliminar do proprietário", () => {
  test("o ciclo completo: duas propostas, a MENOR escolhida, e a disputa encerrada", async ({
    page,
  }) => {
    // ── 1. As duas lojas propõem ────────────────────────────────────────────
    await login(page, DEALER_A);
    const saleRequestId = await findSeededSaleRequest(page);
    await submitOffer(page, saleRequestId, OFFER_A);

    await login(page, DEALER_B);
    await submitOffer(page, saleRequestId, OFFER_B);

    // ── 2. A PF abre a solicitação e vê DUAS propostas atuais ───────────────
    await login(page, OWNER);
    await page.goto(`${OWNER_LIST}/${saleRequestId}`);
    await expect(page.getByTestId("sale-request-detail")).toBeVisible({ timeout: 60_000 });

    const proposals = page.getByTestId("sale-request-proposal");
    await expect(proposals).toHaveCount(2);

    // Uma linha por LOJA. As duas lojas propuseram uma vez cada, mas a asserção
    // que importa é a contagem: se o histórico bruto vazasse para a tela, ela
    // cresceria a cada lance.
    const section = page.getByTestId("sale-request-proposals");
    await expect(section).toContainText("67.000,00");
    await expect(section).toContainText("65.000,00");

    // A maior primeiro, e marcada — mas sem privilégio nenhum.
    await expect(page.getByTestId("sale-request-proposal-highest")).toHaveCount(1);
    await expect(proposals.first()).toContainText("67.000,00");

    // Nenhuma observação de proposta, nenhum identificador interno.
    await expectNoContactLeak(page);

    // ── 3. A PF escolhe DELIBERADAMENTE a MENOR ─────────────────────────────
    const smaller = proposals.filter({ hasText: "65.000,00" }).first();
    await expect(smaller).toBeVisible();
    await smaller.getByTestId("sale-request-proposal-select").click();

    // ── 4. O diálogo: preliminar, e sem promessa de conclusão ───────────────
    const dialog = page.getByTestId("sale-request-select-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Selecionar esta proposta?");
    await expect(dialog).toContainText("novas propostas serão encerradas");
    await expect(dialog).toContainText("Esta seleção é preliminar");
    await expect(dialog).toContainText("65.000,00");

    const dialogText = ((await dialog.innerText()) || "").toLowerCase();
    for (const forbidden of ["venda concluída", "oferta aceita", "pagamento"]) {
      expect(dialogText, `o diálogo prometeu "${forbidden}"`).not.toContain(forbidden);
    }

    await page.getByTestId("sale-request-select-confirm").click();

    // ── 5. O estado novo: escolhida, sem perdedoras e sem cancelar ──────────
    const selected = page.getByTestId("sale-request-selected-offer");
    await expect(selected).toBeVisible({ timeout: 30_000 });
    await expect(selected).toContainText("65.000,00");
    await expect(selected).toContainText("Aguardando próxima etapa");

    await expect(page.getByTestId("sale-request-detail-status")).toHaveText(
      "Proposta selecionada"
    );
    // As perdedoras somem: comparar depois da decisão só serviria para
    // questionar uma escolha que já não pode ser mudada.
    await expect(page.getByTestId("sale-request-proposal")).toHaveCount(0);
    await expect(page.getByTestId("sale-request-cancel-button")).toHaveCount(0);
    await expectNoContactLeak(page);

    // A recarga confirma que o estado é do BANCO, e não da tela: sem isso o
    // teste passaria mesmo com um `setState` otimista sobre um POST que falhou.
    await page.reload();
    await expect(page.getByTestId("sale-request-selected-offer")).toBeVisible({
      timeout: 60_000,
    });

    // ── 6. Responsivo: seis larguras, sem overflow horizontal ───────────────
    for (const width of [360, 390, 412, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("sale-request-selected-offer")).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      // Tolerância de 1px: navegadores arredondam larguras fracionárias, e um
      // limite de zero transformaria arredondamento em falha.
      expect(overflow, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(1);
    }
    await page.setViewportSize({ width: 1280, height: 900 });

    // ── 7. A loja ESCOLHIDA vê que ganhou ───────────────────────────────────
    //
    // ATUALIZADO PELA FASE 4.7, e a mudança é de PRODUTO, não de teste.
    //
    // Até a 4.4 este estado era um painel de espera ("Sua proposta foi
    // selecionada / Aguarde as próximas etapas"), com `data-testid`
    // `dealer-detail-selected`. A 4.5 criou as próximas etapas — então aquele
    // painel foi REMOVIDO e substituído pelo `DealerInspectionPanel`
    // (`dealer-inspection-slot-form`), que cobria o mesmo momento com a AÇÃO
    // correspondente: enviar horários para a avaliação presencial.
    //
    // A 4.7 removeu TAMBÉM esse formulário: a avaliação pertence ao lojista e
    // acontece fora da plataforma. No lugar ficou o `DealerHandoffPanel`
    // (`dealer-handoff-accepted`), read-only e sem ação nenhuma.
    //
    // Manter qualquer das asserções antigas aqui exigiria manter uma tela morta
    // que ninguém alcança. O que a 4.4 precisa continuar provando é o que este
    // bloco prova: a loja escolhida SABE que ganhou, e a disputa acabou de
    // verdade.
    await login(page, DEALER_A);
    await page.goto(`${DEALER_FEED}/${saleRequestId}`);

    const selectedPanel = page.getByTestId("dealer-handoff-accepted");
    await expect(selectedPanel).toBeVisible({ timeout: 60_000 });
    await expect(selectedPanel).toContainText("Sua oferta foi aceita");

    // O formulário de PROPOSTA não existe — não está desabilitado. A disputa
    // acabou, e é isto que a 4.4 garantiu.
    await expect(page.getByTestId("dealer-offer-panel")).toHaveCount(0);
    await expect(page.getByTestId("dealer-offer-amount")).toHaveCount(0);
    await expectNoContactLeak(page);

    // E a oportunidade saiu do feed ativo.
    await page.goto(DEALER_FEED);
    await expect(page.getByTestId("dealer-sale-opportunities-list")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByTestId("dealer-sale-opportunity-card").filter({ hasText: "T-Cross" })
    ).toHaveCount(0);

    // ── 8. A loja PERDEDORA perde o acesso, e não consegue propor ───────────
    await login(page, DEALER_B);
    await page.goto(`${DEALER_FEED}/${saleRequestId}`);
    await expect(page.getByTestId("dealer-detail-error")).toBeVisible({ timeout: 60_000 });

    // A API é a autoridade, e ela responde o MESMO 404 de sempre: nada no corpo
    // conta a B que outra loja foi escolhida.
    const blocked = await page.request.get(
      `/api/account/opportunities/sale-requests/${saleRequestId}`
    );
    expect(blocked.status()).toBe(404);

    const rejected = await page.request.post(
      `/api/account/opportunities/sale-requests/${saleRequestId}/offers`,
      { data: { amount: "90000.00" }, headers: { "Content-Type": "application/json" } }
    );
    // 404 (não vê a solicitação) ou 409 (a disputa acabou) — as duas são
    // recusas legítimas; o que não pode é 201.
    expect([404, 409]).toContain(rejected.status());
  });
});
