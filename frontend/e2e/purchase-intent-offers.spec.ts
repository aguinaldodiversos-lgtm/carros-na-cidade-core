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
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE SÃO SÓ DOIS TESTES, COM MUITA ASSERÇÃO CADA
 * ────────────────────────────────────────────────────────────────────────────
 * `loginRateLimit` permite 10 logins por IP a cada 15 minutos, e todo o E2E sai
 * do mesmo 127.0.0.1. Uma versão anterior deste arquivo tinha quatro testes
 * independentes, cada um refazendo o login de comprador e lojista: 15 logins no
 * total, e os dois últimos testes falhavam com 401 — não por defeito do
 * produto, mas por terem gastado o balde.
 *
 * Dividir mais não deixaria o teste "mais isolado"; deixaria vermelho por um
 * motivo que não é o que se quer medir. Os dois testes daqui somam 7 logins.
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
  return res;
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

  if (created.status() === 429) {
    test.skip(true, "RATE_LIMIT_PURCHASE_INTENT_CREATE esgotado. Aguarde um minuto.");
  }
  expect(created.status()).toBe(201);

  const body = (await created.json()) as {
    purchase_intent: { id: number | string; brand: string; model: string };
  };
  expect(body.purchase_intent.model).toBe("HR-V");
  return String(body.purchase_intent.id);
}

/**
 * Espera a seção de estoque SAIR do esqueleto antes de qualquer asserção sobre
 * cards.
 *
 * Existe por causa de uma falha real: no `npm run dev`, a primeira navegação a
 * `/dashboard-loja/oportunidades/compradores/[id]` compila a rota sob demanda.
 * O cabeçalho da seção aparece assim que o componente monta, então
 * `toBeVisible()` nela passa enquanto a lista ainda está em skeleton — e a
 * asserção seguinte estourava com "element(s) not found", que aponta para o
 * lugar errado (o mesmo teste passa sozinho e o de mobile passava logo depois,
 * com tudo já compilado).
 *
 * Não é `waitForTimeout`: espera uma CONDIÇÃO (o esqueleto sumir). E quando o
 * resultado é vazio ou erro de verdade, a mensagem diz qual dos dois, em vez de
 * "não achei o card".
 */
async function waitForStockSettled(page: Page) {
  await expect(page.getByTestId("dealer-matching-stock")).toBeVisible();
  await expect(page.getByTestId("dealer-matching-stock-loading")).toHaveCount(0, {
    timeout: 60_000,
  });
  await expect(
    page.getByTestId("dealer-matching-stock-error"),
    "a lista de estoque falhou ao carregar"
  ).toHaveCount(0);
  await expect(
    page.getByTestId("dealer-matching-stock-empty"),
    "o estoque compatível veio vazio — o seed rodou? (npm run e2e:prepare)"
  ).toHaveCount(0);
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
  test("lojista envia carro do próprio estoque; rival não consegue; comprador recebe", async ({
    page,
  }) => {
    // --- infra disponível? -------------------------------------------------
    const buyerLogin = await login(page, BUYER); // login 1
    test.skip(
      buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    const intentId = await publishIntent(page);

    // --- lojista da MESMA cidade: o que ele VÊ -----------------------------
    await login(page, DEALER_ATIBAIA); // login 2

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

    const atibaiaAdId = matching.matching_ads[0].ad_id;

    // --- lojista envia PELA TELA -------------------------------------------
    await page.goto(`/dashboard-loja/oportunidades/compradores/${intentId}`, {
      waitUntil: "domcontentloaded",
    });

    await waitForStockSettled(page);

    const firstCard = page.getByTestId("matching-ad-card").first();
    await expect(firstCard.getByTestId("matching-ad-name")).toHaveText("Honda HR-V");

    await firstCard.getByTestId("matching-ad-send").click();
    await expect(firstCard.getByTestId("matching-ad-sent")).toHaveText(/Enviado/);

    // O segundo card continua enviável — o limite é 3.
    await expect(page.getByTestId("matching-ad-send")).toHaveCount(1);

    // --- retry é idempotente, não 500 --------------------------------------
    const retry = await page.request.post(
      `/api/account/opportunities/purchase-intents/${intentId}/offers`,
      { headers: { "Content-Type": "application/json" }, data: { ad_id: atibaiaAdId } }
    );
    expect(retry.status()).toBe(200);
    expect(await retry.json()).toMatchObject({ created: false, already_sent: true });

    // --- o RIVAL não envia o carro alheio ----------------------------------
    // Cenário realista: o id de um anúncio é público, então o lojista de
    // Bragança "conhece" o id de Atibaia. A posse é reconstruída no servidor.
    await login(page, DEALER_BRAGANCA); // login 3

    const attack = await page.request.post(
      `/api/account/opportunities/purchase-intents/${intentId}/offers`,
      { headers: { "Content-Type": "application/json" }, data: { ad_id: atibaiaAdId } }
    );
    // 404 sem revelar se a procura ou o anúncio existem.
    expect(attack.status()).toBe(404);
    expect(await attack.text()).not.toMatch(/Atibaia|outra loja|advertiser/i);

    // --- o comprador recebe -------------------------------------------------
    await login(page, BUYER); // login 4

    await page.goto(`/dashboard/minhas-procuras/${intentId}`, { waitUntil: "domcontentloaded" });

    // UMA opção: o ataque do rival não criou nada.
    await expect(page.getByTestId("received-vehicle-card")).toHaveCount(1);

    const received = page.getByTestId("received-vehicle-card").first();
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

  test("o fluxo crítico funciona no mobile, sem overflow horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const buyerLogin = await login(page, BUYER); // login 5
    test.skip(
      buyerLogin.status() >= 500,
      "Backend indisponível ou seed não aplicado. Rode: npm run e2e:prepare"
    );

    const intentId = await publishIntent(page);

    // --- PJ envia no mobile -------------------------------------------------
    await login(page, DEALER_ATIBAIA); // login 6
    await page.goto(`/dashboard-loja/oportunidades/compradores/${intentId}`, {
      waitUntil: "domcontentloaded",
    });

    await waitForStockSettled(page);

    const card = page.getByTestId("matching-ad-card").first();
    await expect(card).toBeVisible();
    await card.getByTestId("matching-ad-send").click();
    await expect(card.getByTestId("matching-ad-sent")).toHaveText(/Enviado/);

    await expectNoHorizontalOverflow(page);

    // --- PF vê no mobile ----------------------------------------------------
    await login(page, BUYER); // login 7
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
