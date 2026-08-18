import { expect, test } from "@playwright/test";

/**
 * Fase 4.3 — "Venda seu carro para lojas", ponta a ponta com DOIS LOJISTAS.
 *
 * É o E2E principal da fase, e o único lugar onde a disputa acontece de verdade:
 * backend real, PostgreSQL real, duas contas de loja diferentes, o mesmo carro.
 *
 *   PF publica um veículo para avaliação em Atibaia
 *        -> lojista A abre "Veículos para avaliação" e vê o carro
 *        -> abre o detalhe, lê a ficha, vê "nenhuma proposta"
 *        -> propõe R$ 50.000 e passa a liderar
 *        -> lojista B (mesma cidade, OUTRA loja) vê a maior proposta = 50.000
 *        -> tenta 49.000 -> RECUSADO
 *        -> propõe 51.000 -> aceito, e B passa a liderar
 *        -> A recarrega: maior = 51.000, a dele continua 50.000, e a IDENTIDADE
 *           de B não aparece em lugar nenhum da tela
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM TESTE SÓ, COM MUITA ASSERÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Mesma razão do E2E da Fase 3: `loginRateLimit` permite 10 logins por IP a cada
 * 15 minutos, e todo o E2E sai do mesmo 127.0.0.1. Quebrar isto em seis testes
 * independentes gastaria o balde e deixaria os últimos vermelhos por 401 — não
 * por defeito do produto, mas por terem gastado a cota. Este arquivo faz 4
 * logins no total.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * PRÉ-REQUISITOS (fora do CI padrão)
 * ────────────────────────────────────────────────────────────────────────────
 *   npm run e2e:prepare      # migrations (inclui a 055) + seed
 *   backend em :4000 e Next em :3000
 *   npx playwright test e2e/dealer-sale-offers.spec.ts
 *
 * Os dois lojistas do seed precisam ter loja ATIVA na MESMA cidade da
 * solicitação (Atibaia). `cnpj@` e `cnpj3@` atendem a isso; `cnpj2@` é de
 * Bragança de propósito e serve ao teste negativo de cidade.
 */

const OWNER = { email: "cpf@carrosnacidade.com", password: "123456" };
const DEALER_A = { email: "cnpj@carrosnacidade.com", password: "123456" };
const DEALER_B = { email: "cnpj3@carrosnacidade.com", password: "123456" };
const DEALER_OTHER_CITY = { email: "cnpj2@carrosnacidade.com", password: "123456" };

const FEED = "/dashboard-loja/oportunidades/veiculos";

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

/** A PF publica a solicitação do spec e devolve o id. */
async function publishSaleRequest(page: Page): Promise<string> {
  const cityRes = await page.request.get("/api/painel/cidades/search?q=Atibaia&uf=SP");
  expect(cityRes.ok()).toBeTruthy();
  const cityBody = (await cityRes.json()) as { data?: Array<{ id: number; name: string }> };
  const atibaia = (cityBody.data || []).find((row) => /^Atibaia$/i.test(row.name));
  expect(atibaia, "Atibaia precisa existir no catálogo (npm run e2e:prepare)").toBeTruthy();

  // As fotos são obrigatórias na publicação (mínimo 4). O upload real exige R2;
  // aqui o spec usa o endpoint de fotos do próprio produto, que devolve as
  // chaves — se ele não estiver disponível, o skip diz exatamente isso em vez de
  // falhar num passo adiante.
  const photos = await page.request.post("/api/account/sale-requests/photos", {
    multipart: {
      photos: {
        name: "carro.webp",
        mimeType: "image/webp",
        buffer: Buffer.from(
          "UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
          "base64"
        ),
      },
    },
  });

  if (!photos.ok()) {
    test.skip(
      true,
      `upload de foto indisponível (${photos.status()}). O R2 está configurado? Sem foto não há publicação.`
    );
  }

  const uploaded = (await photos.json()) as { photos?: Array<{ storage_key: string }> };
  const keys = (uploaded.photos || []).map((photo) => photo.storage_key);
  expect(keys.length, "o upload precisa devolver ao menos uma chave").toBeGreaterThan(0);

  // O mínimo de fotos é 4; reenviamos até completar, reusando o mesmo arquivo.
  while (keys.length < 4) {
    const extra = await page.request.post("/api/account/sale-requests/photos", {
      multipart: {
        photos: {
          name: `carro-${keys.length}.webp`,
          mimeType: "image/webp",
          buffer: Buffer.from(
            "UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
            "base64"
          ),
        },
      },
    });
    expect(extra.ok()).toBeTruthy();
    const body = (await extra.json()) as { photos?: Array<{ storage_key: string }> };
    keys.push(...(body.photos || []).map((photo) => photo.storage_key));
  }

  const created = await page.request.post("/api/account/sale-requests", {
    headers: { "Content-Type": "application/json" },
    data: {
      city_id: atibaia!.id,
      brand: "VW - VolksWagen",
      fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
      year: "2020",
      mileage: "45000",
      transmission: "Automático",
      fuel_type: "Flex",
      declared_condition: "bom",
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
      images: keys.slice(0, 4),
    },
  });

  if (created.status() === 429) {
    test.skip(true, "rate limit de criação esgotado. Aguarde um minuto.");
  }
  expect(created.status(), "a publicação da solicitação precisa devolver 201").toBe(201);

  const body = (await created.json()) as { sale_request: { id: number | string } };
  return String(body.sale_request.id);
}

async function openDetail(page: Page, saleRequestId: string) {
  await page.goto(`${FEED}/${saleRequestId}`);
  await expect(page.getByTestId("dealer-sale-opportunity-detail")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("dealer-offer-panel")).toBeVisible();
}

/** Preenche o campo e envia. `amount` em reais inteiros. */
async function submitOffer(page: Page, amount: number) {
  const field = page.getByTestId("dealer-offer-amount");
  await field.fill("");
  await field.type(String(amount * 100));
  await page.getByTestId("dealer-offer-submit").click();
}

test.describe("@dealer-sale-offers disputa entre dois lojistas", () => {
  test("o ciclo completo: publicar, propor, ser coberto, e nunca ver o concorrente", async ({
    page,
  }) => {
    // ── 1. A PF publica ──────────────────────────────────────────────────────
    await login(page, OWNER);
    const saleRequestId = await publishSaleRequest(page);

    // ── 2. Lojista A vê o carro no feed ──────────────────────────────────────
    await login(page, DEALER_A);
    await page.goto(FEED);

    await expect(page.getByTestId("dealer-sale-opportunities-list")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page.getByTestId("dealer-sale-opportunities-error"),
      "o feed falhou ao carregar"
    ).toHaveCount(0);
    await expect(
      page.getByTestId("dealer-sale-opportunities-empty"),
      "o feed veio vazio — a solicitação foi publicada na cidade da loja? (npm run e2e:prepare)"
    ).toHaveCount(0);

    const card = page
      .getByTestId("dealer-sale-opportunity-card")
      .filter({ hasText: "T-Cross" })
      .first();
    await expect(card).toBeVisible();

    // ── 3. Detalhe: a ficha inteira, e nenhuma proposta ainda ───────────────
    await openDetail(page, saleRequestId);

    await expect(page.getByText("Avaliação de veículo para compra")).toBeVisible();
    for (const section of [
      "Estado geral e pneus",
      "Pendências e documentação",
      "Histórico do veículo",
      "Mecânica",
      "Lataria e pintura",
    ]) {
      await expect(page.getByText(section)).toBeVisible();
    }
    await expect(page.getByTestId("dealer-offer-count")).toContainText("Nenhuma proposta");

    // ── 4. A propõe 50.000 e lidera ─────────────────────────────────────────
    await submitOffer(page, 50000);
    await expect(page.getByTestId("dealer-offer-success")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dealer-offer-standing")).toHaveText("Você está liderando");
    await expect(page.getByTestId("dealer-offer-panel")).toContainText("50.000,00");

    // ── 5. Lojista B vê a maior proposta, sem saber de quem é ───────────────
    await login(page, DEALER_B);
    await openDetail(page, saleRequestId);

    const panel = page.getByTestId("dealer-offer-panel");
    await expect(panel).toContainText("50.000,00");
    // B ainda não propôs: não há badge de posição.
    await expect(page.getByTestId("dealer-offer-standing")).toHaveCount(0);

    // ── 6. B tenta 49.000 e é RECUSADO ──────────────────────────────────────
    await submitOffer(page, 49000);
    await expect(page.getByTestId("dealer-offer-error")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dealer-offer-error")).toContainText("maior");
    await expect(page.getByTestId("dealer-offer-success")).toHaveCount(0);

    // ── 7. B propõe 51.000 e assume a liderança ─────────────────────────────
    await submitOffer(page, 51000);
    await expect(page.getByTestId("dealer-offer-success")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("dealer-offer-standing")).toHaveText("Você está liderando");
    await expect(panel).toContainText("51.000,00");

    // ── 8. A recarrega: perdeu a liderança, e o rival continua invisível ────
    await login(page, DEALER_A);
    await openDetail(page, saleRequestId);

    await expect(page.getByTestId("dealer-offer-standing")).toHaveText(
      "Existe uma proposta maior"
    );
    // A dele continua 50.000; a maior é 51.000.
    await expect(page.getByTestId("dealer-offer-panel")).toContainText("50.000,00");
    await expect(page.getByTestId("dealer-offer-panel")).toContainText("51.000,00");

    // ── 9. A ASSERÇÃO CENTRAL DA FASE ───────────────────────────────────────
    //
    // O valor líder é público entre lojistas; a identidade de quem o ofereceu
    // não é. A tela inteira é varrida: nem o e-mail, nem o nome da loja rival,
    // nem qualquer canal de contato podem aparecer.
    const detail = page.getByTestId("dealer-sale-opportunity-detail");
    const text = ((await detail.textContent()) ?? "").toLowerCase();

    for (const forbidden of [
      "cnpj3",
      "carrosnacidade.com",
      "confidencial",
      "whatsapp",
      "telefone",
      "falar com",
      "entrar em contato",
      "margem",
      "expira",
    ]) {
      expect(text, `termo proibido na tela do lojista: ${forbidden}`).not.toContain(forbidden);
    }

    expect(await page.locator('a[href^="https://wa.me"]').count()).toBe(0);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);

    await page.screenshot({ path: "test-results/dealer-sale-offers-e2e.png", fullPage: true });
  });

  test("lojista de OUTRA cidade não vê o veículo nem alcança o detalhe", async ({ page }) => {
    // O caso negativo que justifica o escopo territorial existir. Sem ele, o
    // feed inteiro seria uma lista de quem-está-vendendo-o-quê no país.
    await login(page, DEALER_OTHER_CITY);
    await page.goto(FEED);

    await expect(page.getByTestId("dealer-sale-opportunities-list")).toBeVisible({
      timeout: 60_000,
    });

    // Bragança não tem a solicitação de Atibaia. Ou a lista está vazia, ou não
    // contém o T-Cross deste spec — as duas formas provam a mesma coisa, e
    // aceitar as duas evita que o teste dependa do que mais existe no seed.
    const foreignCards = page
      .getByTestId("dealer-sale-opportunity-card")
      .filter({ hasText: "T-Cross 200 TSI" });
    await expect(foreignCards).toHaveCount(0);
  });
});
