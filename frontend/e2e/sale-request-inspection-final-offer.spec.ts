import { expect, test } from "@playwright/test";

/**
 * Fase 4.5 — a AVALIAÇÃO PRESENCIAL e a PROPOSTA FINAL, ponta a ponta.
 *
 * Continua exatamente onde a 4.4 parou, e percorre o ciclo inteiro:
 *
 *   duas lojas propõem (A = 65.000, B = 67.000)
 *        -> a PF escolhe a MENOR (A) — a regra da 4.4, revalidada aqui
 *        -> a loja A envia TRÊS horários
 *        -> a PF vê os três e escolhe um
 *        -> a avaliação fica agendada, com o endereço COMERCIAL da loja
 *        -> a loja registra a avaliação, com quilometragem MAIOR que a declarada
 *        -> a loja apresenta proposta final MENOR (60.000), com justificativa
 *        -> a PF vê preliminar x final x diferença x motivo
 *        -> NÃO existe botão Aceitar nem Recusar (isso é a Fase 4.6)
 *        -> a loja vê "Aguardando decisão do proprietário"
 *        -> a loja B continua com 404
 *        -> nenhum contato entre PF e lojista aparece em lugar nenhum
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS CENTROS DESTE ARQUIVO
 * ════════════════════════════════════════════════════════════════════════════
 * 1. A PROPOSTA FINAL DE 60.000 (§44). Ela é MENOR que o piso do proprietário
 *    (62.500), MENOR que a proposta selecionada (65.000) e MENOR que a maior
 *    proposta da disputa (67.000). Tem de passar — a avaliação presencial existe
 *    justamente para descobrir que o carro vale menos do que parecia na foto.
 *    Um sistema que reaplicasse aqui a regra da disputa passaria em tudo o mais
 *    e falharia só neste ponto, com dinheiro real na frente das duas partes.
 *
 * 2. A QUILOMETRAGEM (§45). A loja lê no odômetro um valor DIFERENTE do que a
 *    pessoa declarou (o declarado vem do seed e é lido da API). As duas
 *    versões convivem na tela, lado a lado. "Corrigir" a declaração destruiria a
 *    prova de que houve divergência — que é exatamente o que sustenta a redução.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE UM TESTE SÓ, COM MUITA ASSERÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 * `loginRateLimit` permite 10 logins por IP a cada 15 minutos, e todo o E2E sai
 * do mesmo 127.0.0.1. Quebrar isto em oito testes independentes gastaria o balde
 * e deixaria os últimos vermelhos por 401 — não por defeito, mas por cota. Este
 * arquivo faz 6 logins.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO É TERMINAL — E O SEED É O RESET
 * ════════════════════════════════════════════════════════════════════════════
 * Ao final, a solicitação fica em `final_offer_submitted` para sempre. Rodar de
 * novo SEM re-semear encontra uma solicitação já decidida e falha no primeiro
 * passo — corretamente. O spec diz isso na mensagem, em vez de falhar num
 * `expect` distante da causa.
 *
 * PRÉ-REQUISITOS (fora do CI padrão)
 *   npm run e2e:prepare      # migrations (inclui a 058) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/sale-request-inspection-final-offer.spec.ts
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };

const DEALER_FEED = "/dashboard-loja/oportunidades/veiculos";
const OWNER_LIST = "/dashboard/vender-para-lojas";

const OFFER_A = 65000; // a selecionada
const OFFER_B = 67000; // a maior da disputa
const FINAL_AMOUNT = 60000; // abaixo do piso (62.500), da selecionada e da maior

/**
 * A quilometragem que a loja vai LER no odômetro.
 *
 * O valor DECLARADO não é fixado aqui: ele vem do seed e é lido da API no
 * passo 1. Fixá-lo foi um erro real desta suíte — o spec comparava 62.000
 * (copiado do fixture de service) com os 45.000 que o seed grava, e falhava na
 * última asserção depois de o fluxo inteiro ter passado.
 *
 * Ler o valor real também torna o teste imune a uma mudança de seed: o que o
 * §45 exige provar é a RELAÇÃO — declarado e observado convivem, lado a lado,
 * e o declarado não foi sobrescrito — e não dois números específicos.
 */
const OBSERVED_KM = 64230;

type Page = import("@playwright/test").Page;

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

async function findSeededSaleRequest(
  page: Page
): Promise<{ id: string; declaredKm: number }> {
  const res = await page.request.get("/api/account/opportunities/sale-requests");

  if (res.status() === 403) {
    test.skip(true, "lojista sem loja elegível — o seed rodou? (npm run e2e:prepare)");
  }
  expect(res.ok(), `o feed do lojista respondeu ${res.status()}`).toBeTruthy();

  const body = (await res.json()) as {
    items?: Array<{
      id: number | string;
      fipe_model_description: string;
      mileage: number;
    }>;
  };
  const target = (body.items || []).find((item) =>
    /T-Cross/i.test(item.fipe_model_description)
  );

  expect(
    target,
    "a solicitação semeada não está no feed. Ou o seed não rodou, ou uma rodada anterior já " +
      "avançou a avaliação (o estado é terminal). Rode: npm run e2e:prepare"
  ).toBeTruthy();

  return { id: String(target!.id), declaredKm: Number(target!.mileage) };
}

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

/**
 * Um `datetime-local` no futuro, no formato que o input aceita.
 *
 * O campo NÃO tem fuso — a conversão para ISO com offset acontece no cliente,
 * usando o offset do próprio navegador. É exatamente o caminho que o usuário
 * real percorre.
 */
function futureLocalInput(daysAhead: number, hour: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 30, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

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

test.describe("@sale-request-inspection a avaliação presencial e a proposta final", () => {
  test("o ciclo completo: horários, avaliação, e proposta final MENOR que tudo", async ({
    page,
  }) => {
    test.setTimeout(240_000);

    // ── 1. As duas lojas propõem, e a PF escolhe a MENOR ───────────────────
    await login(page, DEALER_A);
    const { id: saleRequestId, declaredKm } = await findSeededSaleRequest(page);

    // O observado precisa DIVERGIR do declarado — é a divergência que o §45
    // existe para provar, e é ela que sustenta a redução de valor.
    expect(
      OBSERVED_KM,
      "o seed mudou e a quilometragem observada coincide com a declarada"
    ).not.toBe(declaredKm);

    await submitOffer(page, saleRequestId, OFFER_A);

    await login(page, DEALER_B);
    await submitOffer(page, saleRequestId, OFFER_B);

    await login(page, OWNER);
    await page.goto(`${OWNER_LIST}/${saleRequestId}`);
    await expect(page.getByTestId("sale-request-proposals")).toBeVisible({ timeout: 60_000 });

    // A MENOR proposta — a regra da 4.4, revalidada aqui.
    const smaller = page
      .getByTestId("sale-request-proposal")
      .filter({ hasText: "R$ 65.000,00" });
    await smaller.getByTestId("sale-request-proposal-select").click();
    await page.getByTestId("sale-request-select-confirm").click();
    await expect(page.getByTestId("sale-request-selected-offer")).toBeVisible({
      timeout: 30_000,
    });

    // ── 2. A loja escolhida envia TRÊS horários ────────────────────────────
    await login(page, DEALER_A);
    await page.goto(`${DEALER_FEED}/${saleRequestId}`);
    await expect(page.getByTestId("dealer-inspection-slot-form")).toBeVisible({
      timeout: 60_000,
    });

    await page.getByTestId("dealer-inspection-slot-0").fill(futureLocalInput(2, 9));
    await page.getByTestId("dealer-inspection-add-slot").click();
    await page.getByTestId("dealer-inspection-slot-1").fill(futureLocalInput(2, 14));
    await page.getByTestId("dealer-inspection-add-slot").click();
    await page.getByTestId("dealer-inspection-slot-2").fill(futureLocalInput(3, 10));

    await page.getByTestId("dealer-inspection-submit-slots").click();
    await expect(page.getByTestId("dealer-inspection-waiting")).toBeVisible({
      timeout: 30_000,
    });

    // ── 3. A PF vê os três e escolhe um ────────────────────────────────────
    await login(page, OWNER);
    await page.goto(`${OWNER_LIST}/${saleRequestId}`);

    const picker = page.getByTestId("owner-inspection-picker");
    await expect(picker).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("owner-inspection-slot")).toHaveCount(3);

    // O endereço COMERCIAL aparece — é o que a pessoa precisa para comparecer.
    // E é o ÚNICO dado da loja que atravessa a fronteira.
    await expect(picker).toContainText("Local");

    await page.getByTestId("owner-inspection-slot").first().click();
    await page.getByTestId("owner-inspection-submit").click();
    await page.getByTestId("owner-inspection-confirm-submit").click();

    await expect(page.getByTestId("owner-inspection-scheduled")).toBeVisible({
      timeout: 30_000,
    });

    // Recarrega: o horário confirmado PERSISTIU.
    await page.reload();
    await expect(page.getByTestId("owner-inspection-scheduled-at")).toBeVisible({
      timeout: 60_000,
    });
    await expectNoContactLeak(page);

    // ── 4. A loja registra a avaliação, com km MAIOR que a declarada ───────
    await login(page, DEALER_A);
    await page.goto(`${DEALER_FEED}/${saleRequestId}`);
    await expect(page.getByTestId("dealer-inspection-form")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("dealer-inspection-mileage").fill(String(OBSERVED_KM));
    await page.getByTestId("dealer-inspection-condition").selectOption("regular");
    await page.getByTestId("dealer-inspection-tires").selectOption("replace_now");
    await page.getByTestId("dealer-inspection-engine").selectOption("ok");
    await page.getByTestId("dealer-inspection-gearbox").selectOption("ok");
    await page.getByTestId("dealer-inspection-suspension").selectOption("issue");
    await page.getByTestId("dealer-inspection-body-paint").selectOption("issues");
    await page.getByTestId("dealer-inspection-issue-scratches").check();
    await page
      .getByTestId("dealer-inspection-notes")
      .fill("Pneus no limite e ruído na suspensão dianteira.");

    await page.getByTestId("dealer-inspection-submit").click();
    await expect(page.getByTestId("dealer-decision-form")).toBeVisible({ timeout: 30_000 });

    // ── 5. A proposta final MENOR que o piso, a selecionada e a maior ──────
    const amountField = page.getByTestId("dealer-decision-amount");
    await amountField.fill("");
    await amountField.type(String(FINAL_AMOUNT * 100));

    // A diferença aparece em tempo real — a loja vê o que a PF vai ver.
    await expect(page.getByTestId("dealer-decision-difference")).toContainText("5.000");

    // Redução EXIGE motivo (§25).
    await page.getByTestId("dealer-decision-reason").selectOption("mileage_difference");
    await page
      .getByTestId("dealer-decision-note")
      .fill("Odômetro 2.230 km acima do informado e pneus para troca.");

    await page.getByTestId("dealer-decision-submit").click();
    await page.getByTestId("dealer-decision-confirm-submit").click();

    await expect(page.getByTestId("dealer-decision-sent")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dealer-decision-sent-amount")).toContainText("60.000");

    // A loja vê o estado de espera — sem formulário, sem edição, sem contato.
    await expect(page.getByTestId("dealer-decision-sent")).toContainText(
      "Aguardando decisão do proprietário"
    );
    await expect(page.getByTestId("dealer-decision-form")).toHaveCount(0);
    await expectNoContactLeak(page);

    // ── 6. A PF vê preliminar x final x diferença x motivo ─────────────────
    await login(page, OWNER);
    await page.goto(`${OWNER_LIST}/${saleRequestId}`);

    const decision = page.getByTestId("owner-final-decision");
    await expect(decision).toBeVisible({ timeout: 60_000 });

    await expect(decision).toContainText("R$ 65.000,00"); // preliminar
    await expect(page.getByTestId("owner-final-amount")).toContainText("60.000");
    await expect(page.getByTestId("owner-final-difference")).toContainText("5.000");
    await expect(page.getByTestId("owner-final-reason")).toContainText("Quilometragem");

    // §45 — o DECLARADO e o OBSERVADO convivem, lado a lado.
    const observed = page.getByTestId("owner-inspection-observed");
    await expect(observed).toBeVisible();
    await expect(observed).toContainText(declaredKm.toLocaleString("pt-BR"));
    await expect(observed).toContainText(OBSERVED_KM.toLocaleString("pt-BR"));

    // ── 7. NÃO existe Aceitar nem Recusar — isso é a Fase 4.6 ──────────────
    const body = ((await page.locator("body").innerText()) || "").toLowerCase();
    expect(body, "a tela ofereceu ACEITAR, que é da Fase 4.6").not.toMatch(
      /\baceitar\b/
    );
    expect(body, "a tela ofereceu RECUSAR, que é da Fase 4.6").not.toMatch(
      /\brecusar\b/
    );
    // E nada sugere venda concluída.
    for (const forbidden of ["venda concluída", "negócio fechado", "vendido"]) {
      expect(body, `a tela disse "${forbidden}"`).not.toContain(forbidden);
    }

    await expectNoContactLeak(page);

    // ── 8. A loja PERDEDORA continua sem acesso ────────────────────────────
    await login(page, DEALER_B);
    const blocked = await page.request.get(
      `/api/account/opportunities/sale-requests/${saleRequestId}`
    );
    expect(blocked.status(), "a loja perdedora acessou a oportunidade").toBe(404);

    // ── 9. Responsivo: seis larguras, zero overflow horizontal ─────────────
    await login(page, OWNER);
    await page.goto(`${OWNER_LIST}/${saleRequestId}`);
    await expect(page.getByTestId("owner-final-decision")).toBeVisible({ timeout: 60_000 });

    for (const width of [360, 390, 412, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `overflow horizontal em ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
