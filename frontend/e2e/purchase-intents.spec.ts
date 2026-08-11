import { expect, test } from "@playwright/test";

/**
 * Fase 2 — Compradores ativos, ponta a ponta.
 *
 * Cobre o ciclo inteiro do produto num único spec enxuto:
 *
 *   PF publica em Atibaia → lojista de Atibaia VÊ e é notificado
 *                        → lojista de Bragança NÃO vê (nem pelo id direto)
 *                        → PF encerra → o lojista perde o acesso na hora.
 *
 * O caso NEGATIVO (Bragança) é o que justifica o spec existir. Um bug que
 * ignorasse a cidade passaria em todos os testes positivos — e vazaria as
 * procuras de uma cidade para os lojistas de todas as outras.
 *
 * Pré-requisitos (fora do CI padrão, que só roda full-flow.spec.ts):
 *   npm run e2e:prepare          # migrations + seed (CPF + 2 lojistas CNPJ)
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/purchase-intents.spec.ts
 */

const BUYER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_SAME_CITY = { email: "cnpj@carrosnacidade.com", password: "123456" };
const DEALER_OTHER_CITY = { email: "cnpj2@carrosnacidade.com", password: "123456" };
/** Mesma cidade do comprador, mas fora do ar por moderação (Fase 2.1). */
const DEALER_SUSPENDED = { email: "cnpj3@carrosnacidade.com", password: "123456" };
const DEALER_BLOCKED = { email: "cnpj4@carrosnacidade.com", password: "123456" };

async function login(
  page: import("@playwright/test").Page,
  user: { email: string; password: string }
) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/auth/login", {
    data: user,
    headers: { "Content-Type": "application/json" },
  });
  return res;
}

test.describe("@e2e Fase 2 — compradores ativos", () => {
  test("procura publicada chega ao lojista da cidade e some ao ser encerrada", async ({ page }) => {
    // --- infra disponível? -------------------------------------------------
    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );
    expect(buyerLogin.ok()).toBeTruthy();

    // --- cidade explícita: resolvida pelo catálogo, nunca adivinhada -------
    const cityRes = await page.request.get("/api/painel/cidades/search?q=Atibaia&uf=SP");
    expect(cityRes.ok()).toBeTruthy();
    const cityBody = (await cityRes.json()) as { data?: Array<{ id: number; name: string }> };
    const atibaia = (cityBody.data || []).find((row) => /^Atibaia$/i.test(row.name));
    expect(atibaia, "Atibaia precisa existir no catálogo (npm run e2e:prepare)").toBeTruthy();

    // --- PF publica --------------------------------------------------------
    const created = await page.request.post("/api/account/purchase-intents", {
      headers: { "Content-Type": "application/json" },
      data: {
        intent_type: "specific_model",
        brand: "VW - VolksWagen",
        model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
        transmission: "Automático",
        max_price: 95000,
        purchase_timeframe: "within_30_days",
        city_id: atibaia!.id,
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = (await created.json()) as {
      purchase_intent: { id: number | string; brand: string; model: string; transmission: string };
    };
    const intentId = String(createdBody.purchase_intent.id);

    // A descrição FIPE virou marca canônica + modelo comercial.
    expect(createdBody.purchase_intent.brand).toBe("Volkswagen");
    expect(createdBody.purchase_intent.model).toBe("T-Cross");
    expect(createdBody.purchase_intent.transmission).toBe("automatico");

    // A procura aparece em "Minhas procuras".
    await page.goto("/dashboard/minhas-procuras", { waitUntil: "domcontentloaded" });
    const buyerCard = page.getByTestId("purchase-intent-card").first();
    await expect(buyerCard).toContainText("Volkswagen T-Cross");
    await expect(buyerCard).toContainText("Atibaia - SP");

    // --- lojista da MESMA cidade ------------------------------------------
    expect((await login(page, DEALER_SAME_CITY)).ok()).toBeTruthy();

    await page.goto("/dashboard-loja/oportunidades/compradores", { waitUntil: "domcontentloaded" });
    const dealerCard = page.getByTestId("dealer-opportunity-card").first();
    await expect(dealerCard).toContainText("Volkswagen T-Cross");

    // Nada que identifique o comprador — nem na tela, nem no JSON.
    await expect(dealerCard).not.toContainText(/nome|e-?mail|telefone|whatsapp|cpf/i);
    const dealerApi = await page.request.get("/api/account/opportunities/purchase-intents");
    const dealerRaw = await dealerApi.text();
    expect(dealerRaw).not.toMatch(/buyer|email|phone|whatsapp|cpf|document/i);

    // Foi notificado, e a notificação aponta para o detalhe certo.
    const notifications = await page.request.get("/api/account/notifications");
    const notifBody = (await notifications.json()) as {
      notifications: Array<{ event_type: string; action_path: string; body: string }>;
    };
    const notice = notifBody.notifications.find(
      (row) => row.event_type === "purchase_intent.created"
    );
    expect(notice, "lojista da cidade precisa receber a notificação").toBeTruthy();
    expect(notice!.action_path).toBe(`/dashboard-loja/oportunidades/compradores/${intentId}`);
    expect(notice!.body).not.toMatch(/@|cpf/i);

    // --- lojista de OUTRA cidade ------------------------------------------
    expect((await login(page, DEALER_OTHER_CITY)).ok()).toBeTruthy();

    const otherList = await page.request.get("/api/account/opportunities/purchase-intents");
    const otherBody = (await otherList.json()) as { purchase_intents: unknown[] };
    expect(otherBody.purchase_intents).toHaveLength(0);

    // Acesso direto ao id: 404, sem dizer que existe em outra cidade.
    const otherDirect = await page.request.get(
      `/api/account/opportunities/purchase-intents/${intentId}`
    );
    expect(otherDirect.status()).toBe(404);
    expect(await otherDirect.text()).not.toMatch(/cidade|Atibaia/i);

    // --- lojistas fora do ar, na MESMA cidade (Fase 2.1) -------------------
    // Passam pelo requireDealerAccount (são CNPJ) e ainda assim não veem nada:
    // a guarda que os barra é o status da LOJA, não o tipo da conta.
    for (const dealer of [DEALER_SUSPENDED, DEALER_BLOCKED]) {
      expect((await login(page, dealer)).ok()).toBeTruthy();

      const list = await page.request.get("/api/account/opportunities/purchase-intents");
      expect(list.status()).toBe(200);
      expect(
        ((await list.json()) as { purchase_intents: unknown[] }).purchase_intents
      ).toHaveLength(0);

      const direct = await page.request.get(
        `/api/account/opportunities/purchase-intents/${intentId}`
      );
      expect(direct.status()).toBe(404);

      // E não foram avisados da procura.
      const notifications = await page.request.get("/api/account/notifications");
      const body = (await notifications.json()) as {
        notifications: Array<{ event_type: string }>;
      };
      expect(
        body.notifications.filter((row) => row.event_type === "purchase_intent.created")
      ).toHaveLength(0);
    }

    // --- PF encerra --------------------------------------------------------
    expect((await login(page, BUYER)).ok()).toBeTruthy();
    await page.goto(`/dashboard/minhas-procuras/${intentId}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("purchase-intent-close").click();
    await page.getByTestId("purchase-intent-close-confirm").click();
    await expect(page.getByTestId("purchase-intent-status")).toHaveText("Encerrada");

    // --- o lojista perde o acesso imediatamente ----------------------------
    expect((await login(page, DEALER_SAME_CITY)).ok()).toBeTruthy();
    const afterClose = await page.request.get("/api/account/opportunities/purchase-intents");
    const afterBody = (await afterClose.json()) as { purchase_intents: unknown[] };
    expect(afterBody.purchase_intents).toHaveLength(0);

    const afterDirect = await page.request.get(
      `/api/account/opportunities/purchase-intents/${intentId}`
    );
    expect(afterDirect.status()).toBe(404);

    // ...mas o comprador continua vendo no histórico.
    expect((await login(page, BUYER)).ok()).toBeTruthy();
    await page.goto("/dashboard/minhas-procuras", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("purchase-intent-card").first()).toContainText("Encerrada");
  });

  test("conta CPF não acessa a área do lojista e conta CNPJ não publica procura", async ({
    page,
  }) => {
    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    // CPF na API do lojista → 403 do requireDealerAccount.
    const asBuyer = await page.request.get("/api/account/opportunities/purchase-intents");
    expect(asBuyer.status()).toBe(403);

    // CNPJ publicando procura pelo fluxo PF → 403.
    expect((await login(page, DEALER_SAME_CITY)).ok()).toBeTruthy();
    const asDealer = await page.request.post("/api/account/purchase-intents", {
      headers: { "Content-Type": "application/json" },
      data: {
        intent_type: "open_category",
        body_type: "suv",
        transmission: "automatico",
        max_price: 100000,
        purchase_timeframe: "within_7_days",
        city_id: 1,
      },
    });
    expect(asDealer.status()).toBe(403);
  });
});
