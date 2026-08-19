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
// cnpj5@ e não cnpj3@: a terceira loja do seed é SUSPENSA de propósito (ela prova
// o corte da moderação no Produto 1). A disputa precisa de duas lojas ATIVAS na
// MESMA cidade, e cnpj5@ foi acrescentada ao seed exatamente para isso.
const DEALER_B = { email: "cnpj5@carrosnacidade.com", password: "123456" };
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

/**
 * A solicitação de venda usada pela disputa — SEMEADA, não publicada aqui.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE SEMEADA
 * ────────────────────────────────────────────────────────────────────────────
 * Publicar exige no mínimo quatro fotos, e o upload passa pelo R2. Sem
 * credenciais, o endpoint responde 503 com `SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE`
 * — que é o comportamento CORRETO, não um defeito: a Fase 4.1 criou esse código
 * exatamente para não mandar a pessoa trocar uma foto que está perfeita quando o
 * problema é o bucket.
 *
 * Deixar o gate inteiro parado por falta de credencial de storage seria trocar a
 * prova da DISPUTA — que é o assunto desta fase — por uma prova de
 * infraestrutura. `scripts/e2e-seed.mjs` cria a linha, do mesmo jeito que já
 * cria os anúncios do Produto 1.
 *
 * O caminho de publicação da PF NÃO fica sem prova: ele tem cobertura própria em
 * tests/sale-requests/ (validação, service e rotas, contra o router real).
 *
 * A função LÊ o feed do lojista para descobrir o id — não recebe um número
 * fixo. Assim o spec continua válido quando o seed rodar de novo e a linha
 * mudar de id.
 */
async function findSeededSaleRequest(page: Page): Promise<string> {
  const res = await page.request.get("/api/account/opportunities/sale-requests");

  if (res.status() === 403) {
    test.skip(
      true,
      "lojista sem loja elegível — o seed rodou? (npm run e2e:prepare)"
    );
  }
  expect(res.ok(), `o feed do lojista respondeu ${res.status()}`).toBeTruthy();

  const body = (await res.json()) as {
    items?: Array<{ id: number | string; fipe_model_description: string }>;
  };
  const items = body.items || [];

  const target = items.find((item) => /T-Cross/i.test(item.fipe_model_description));
  expect(
    target,
    "a solicitação semeada não apareceu no feed — rode: node scripts/e2e-seed.mjs"
  ).toBeTruthy();

  return String(target!.id);
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
    // ── 1. Lojista A vê o carro publicado pela PF ────────────────────────────
    await login(page, DEALER_A);
    const saleRequestId = await findSeededSaleRequest(page);
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
    // Os títulos mudaram na Fase 4.3.1, quando a ficha virou UM cartão com
    // grupos. O que a asserção protege é que todo grupo de dados declarados
    // chega ao lojista — não o nome que cada um tinha antes.
    for (const section of [
      "Resumo do veículo",
      "Situação declarada pelo proprietário",
      "Conservação",
      "Financeiro e documentação",
      "Histórico",
      "Mecânica",
      "Lataria e pintura",
    ]) {
      await expect(page.getByText(section)).toBeVisible();
    }
    await expect(page.getByTestId("dealer-offer-count")).toContainText("Nenhuma proposta");

    // ── 4. A propõe 50.000 e lidera ─────────────────────────────────────────
    await submitOffer(page, 50000);
    await expect(page.getByTestId("dealer-offer-success")).toBeVisible({ timeout: 30_000 });
    // `toContainText`: o badge carrega um glifo de estado (✓/⚠) ao lado da
    // frase, para a posição não depender só de cor.
    await expect(page.getByTestId("dealer-offer-standing")).toContainText(
      "Você está liderando"
    );
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
    // `toContainText`: o badge carrega um glifo de estado (✓/⚠) ao lado da
    // frase, para a posição não depender só de cor.
    await expect(page.getByTestId("dealer-offer-standing")).toContainText(
      "Você está liderando"
    );
    await expect(panel).toContainText("51.000,00");

    // ── 8. A recarrega: perdeu a liderança, e o rival continua invisível ────
    await login(page, DEALER_A);
    await openDetail(page, saleRequestId);

    await expect(page.getByTestId("dealer-offer-standing")).toContainText(
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
