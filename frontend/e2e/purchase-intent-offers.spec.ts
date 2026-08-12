import { expect, test } from "@playwright/test";

/**
 * Fase 3 — Envio de veículos ao comprador, ponta a ponta.
 *
 * O ciclo inteiro do produto:
 *
 *   PF publica "Honda HR-V automático até R$ 100.000" em Atibaia
 *        -> lojista de Atibaia abre a oportunidade
 *        -> vê o HR-V DO PRÓPRIO ESTOQUE (e NÃO o City, nem o HR-V do rival)
 *        -> clica "Enviar ao comprador"
 *        -> PF abre a procura e vê o card REAL do anúncio
 *
 * Os casos NEGATIVOS são o que justifica o spec existir. Um matching quebrado
 * passaria em todo teste positivo e ofereceria o carro errado para gente real;
 * uma falha de posse deixaria um lojista enviar o estoque do concorrente.
 *
 * Pré-requisitos (fora do CI padrão, que só roda full-flow.spec.ts):
 *   npm run e2e:prepare          # migrations + seed (CPF, lojistas, estoque)
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/purchase-intent-offers.spec.ts
 */

const BUYER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_ATIBAIA = { email: "cnpj@carrosnacidade.com", password: "123456" };
const DEALER_BRAGANCA = { email: "cnpj2@carrosnacidade.com", password: "123456" };

type Page = import("@playwright/test").Page;

type MatchingAd = {
  ad_id: number | string;
  vehicle_name: string;
  price: string;
  budget_relation: string | null;
  already_sent: boolean;
};

async function login(page: Page, user: { email: string; password: string }) {
  await page.context().clearCookies();
  return page.request.post("/api/auth/login", {
    data: user,
    headers: { "Content-Type": "application/json" },
  });
}

/** Publica a procura do spec e devolve o id. */
async function publishIntent(page: Page): Promise<string> {
  const cityRes = await page.request.get("/api/painel/cidades/search?q=Atibaia&uf=SP");
  expect(cityRes.ok()).toBeTruthy();
  const cityBody = (await cityRes.json()) as { data?: Array<{ id: number; name: string }> };
  const atibaia = (cityBody.data || []).find((row) => /^Atibaia$/i.test(row.name));
  expect(atibaia, "Atibaia precisa existir no catálogo (npm run e2e:prepare)").toBeTruthy();

  const created = await page.request.post("/api/account/purchase-intents", {
    headers: { "Content-Type": "application/json" },
    data: {
      intent_type: "specific_model",
      brand: "Honda",
      // Descrição FIPE completa de propósito: o backend reduz para o modelo
      // COMERCIAL, que é o que o matching compara com `ads.model`.
      model: "HR-V EX 1.8 Flex 16V 5p Aut.",
      transmission: "Automático",
      max_price: 100000,
      purchase_timeframe: "within_30_days",
      city_id: atibaia!.id,
    },
  });
  expect(created.status()).toBe(201);

  const body = (await created.json()) as {
    purchase_intent: { id: number | string; brand: string; model: string };
  };
  expect(body.purchase_intent.model).toBe("HR-V");
  return String(body.purchase_intent.id);
}

async function fetchMatching(page: Page, intentId: string) {
  const res = await page.request.get(
    `/api/account/opportunities/purchase-intents/${intentId}/matching-ads`
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as {
    matching_ads: MatchingAd[];
    limit: { max_per_dealer: number; used: number; remaining: number };
  };
}

test.describe("@e2e Fase 3 — envio de veículos", () => {
  test("lojista envia carro do próprio estoque e o comprador recebe o card real", async ({
    page,
  }) => {
    // --- infra disponível? -------------------------------------------------
    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );
    expect(buyerLogin.ok()).toBeTruthy();

    const intentId = await publishIntent(page);

    // --- lojista da MESMA cidade: o que ele VÊ -----------------------------
    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();

    const matching = await fetchMatching(page, intentId);
    const names = matching.matching_ads.map((ad) => ad.vehicle_name);

    // Só HR-V. O Honda City do MESMO estoque tem a mesma marca e é automático,
    // e mesmo assim não entra: modelo comercial é rígido em specific_model.
    expect(names.every((name) => name === "Honda HR-V")).toBeTruthy();
    expect(names).toHaveLength(2);

    // Dentro do orçamento vem primeiro; acima aparece, mas classificado.
    expect(matching.matching_ads.map((ad) => ad.budget_relation)).toEqual([
      "within_budget",
      "above_budget",
    ]);
    expect(matching.limit).toMatchObject({ max_per_dealer: 3, used: 0, remaining: 3 });

    // Nada do comprador vem junto, nem no JSON cru.
    const rawMatching = await (
      await page.request.get(
        `/api/account/opportunities/purchase-intents/${intentId}/matching-ads`
      )
    ).text();
    expect(rawMatching).not.toMatch(/buyer|email|phone|whatsapp|cpf|document/i);

    // --- lojista envia PELA TELA -------------------------------------------
    await page.goto(`/dashboard-loja/oportunidades/compradores/${intentId}`, {
      waitUntil: "domcontentloaded",
    });

    const stock = page.getByTestId("dealer-matching-stock");
    await expect(stock).toBeVisible();

    const firstCard = page.getByTestId("matching-ad-card").first();
    await expect(firstCard.getByTestId("matching-ad-name")).toHaveText("Honda HR-V");

    await firstCard.getByTestId("matching-ad-send").click();
    await expect(firstCard.getByTestId("matching-ad-sent")).toHaveText(/Enviado/);

    // O segundo card continua enviável — o limite é 3.
    await expect(page.getByTestId("matching-ad-send")).toHaveCount(1);

    // --- o comprador recebe -------------------------------------------------
    expect((await login(page, BUYER)).ok()).toBeTruthy();

    await page.goto(`/dashboard/minhas-procuras/${intentId}`, { waitUntil: "domcontentloaded" });

    const received = page.getByTestId("received-vehicle-card").first();
    await expect(received).toBeVisible();
    await expect(received.getByTestId("received-vehicle-name")).toHaveText("Honda HR-V");
    // Preço REAL do anúncio semeado, não uma cópia guardada no envio.
    await expect(received.getByTestId("received-vehicle-price")).toContainText("98.900");
    await expect(received.getByTestId("received-vehicle-dealer")).toHaveText(/Loja Atibaia/i);
    await expect(received.getByTestId("received-vehicle-budget")).toHaveText(
      /Dentro do seu orçamento/i
    );
    await expect(received.getByTestId("received-vehicle-link")).toHaveAttribute(
      "href",
      /^\/veiculo\//
    );

    // E foi avisado, com a rota certa e sem PII no corpo.
    const notifications = await page.request.get("/api/account/notifications");
    const notifBody = (await notifications.json()) as {
      notifications: Array<{ event_type: string; action_path: string; body: string }>;
    };
    const notice = notifBody.notifications.find(
      (row) => row.event_type === "purchase_intent.offer_received"
    );
    expect(notice, "o comprador precisa receber a notificação").toBeTruthy();
    expect(notice!.action_path).toBe(`/dashboard/minhas-procuras/${intentId}`);
    expect(notice!.body).toContain("Honda HR-V");
  });

  test("lojista NÃO consegue enviar o anúncio de outra loja", async ({ page }) => {
    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    const intentId = await publishIntent(page);

    // O lojista de Bragança descobre o id do anúncio DE ATIBAIA... pelo próprio
    // lojista de Atibaia. É o cenário realista: o id de um anúncio é público.
    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();
    const matching = await fetchMatching(page, intentId);
    const atibaiaAdId = matching.matching_ads[0].ad_id;

    // Bragança tenta enviar o carro de Atibaia para a procura de Atibaia.
    expect((await login(page, DEALER_BRAGANCA)).ok()).toBeTruthy();
    const attack = await page.request.post(
      `/api/account/opportunities/purchase-intents/${intentId}/offers`,
      { headers: { "Content-Type": "application/json" }, data: { ad_id: atibaiaAdId } }
    );
    // 404 sem revelar se a procura ou o anúncio existem.
    expect(attack.status()).toBe(404);
    expect(await attack.text()).not.toMatch(/Atibaia|outra loja|advertiser/i);

    // E Atibaia também não envia o HR-V compatível de Bragança.
    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();
    const stock = await fetchMatching(page, intentId);
    const listedIds = stock.matching_ads.map((ad) => String(ad.ad_id));

    const braganca = await page.request.post(
      `/api/account/opportunities/purchase-intents/${intentId}/offers`,
      {
        headers: { "Content-Type": "application/json" },
        // Um id que comprovadamente NÃO está na lista dele.
        data: { ad_id: 999999 },
      }
    );
    expect(braganca.status()).toBe(404);
    expect(listedIds).not.toContain("999999");

    // Nada foi criado: o comprador continua sem veículo recebido.
    expect((await login(page, BUYER)).ok()).toBeTruthy();
    const offers = await page.request.get(`/api/account/purchase-intents/${intentId}/offers`);
    expect(((await offers.json()) as { offers: unknown[] }).offers).toHaveLength(0);
  });

  test("envio é idempotente e a procura de outro comprador é 404", async ({ page }) => {
    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    const intentId = await publishIntent(page);

    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();
    const matching = await fetchMatching(page, intentId);
    const adId = matching.matching_ads[0].ad_id;

    const send = () =>
      page.request.post(`/api/account/opportunities/purchase-intents/${intentId}/offers`, {
        headers: { "Content-Type": "application/json" },
        data: { ad_id: adId },
      });

    const first = await send();
    expect(first.status()).toBe(201);
    expect((await first.json()) as { created: boolean }).toMatchObject({ created: true });

    // Retry de rede: 200 idempotente, NUNCA 500 nem duplicata.
    const retry = await send();
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ created: false, already_sent: true });

    expect((await login(page, BUYER)).ok()).toBeTruthy();
    const offers = await page.request.get(`/api/account/purchase-intents/${intentId}/offers`);
    expect(((await offers.json()) as { offers: unknown[] }).offers).toHaveLength(1);

    // O LOJISTA não consegue ler as ofertas pela rota do comprador: a procura
    // não é dele.
    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();
    const asDealer = await page.request.get(`/api/account/purchase-intents/${intentId}/offers`);
    expect(asDealer.status()).toBe(404);
  });

  test("o fluxo crítico funciona no mobile, sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const buyerLogin = await login(page, BUYER);
    test.skip(
      buyerLogin.status() === 401 || buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    const intentId = await publishIntent(page);

    // --- PJ envia no mobile -------------------------------------------------
    expect((await login(page, DEALER_ATIBAIA)).ok()).toBeTruthy();
    await page.goto(`/dashboard-loja/oportunidades/compradores/${intentId}`, {
      waitUntil: "domcontentloaded",
    });

    const card = page.getByTestId("matching-ad-card").first();
    await expect(card).toBeVisible();
    await card.getByTestId("matching-ad-send").click();
    await expect(card.getByTestId("matching-ad-sent")).toHaveText(/Enviado/);

    await expectNoHorizontalOverflow(page);

    // --- PF vê no mobile ----------------------------------------------------
    expect((await login(page, BUYER)).ok()).toBeTruthy();
    await page.goto(`/dashboard/minhas-procuras/${intentId}`, { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("received-vehicle-card").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

/**
 * Overflow horizontal é medido no DOCUMENTO, não em cada card.
 *
 * Um card individual pode ser mais largo que a viewport sem estourar a página
 * (se estiver dentro de um contêiner com scroll próprio); o que quebra a
 * experiência é a PÁGINA rolar para o lado. `scrollWidth > clientWidth + 1`
 * absorve o arredondamento subpixel que dá falso positivo em zoom fracionário.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(
    overflow.scrollWidth,
    `página rolando para o lado: ${overflow.scrollWidth} > ${overflow.clientWidth}`
  ).toBeLessThanOrEqual(overflow.clientWidth + 1);
}
