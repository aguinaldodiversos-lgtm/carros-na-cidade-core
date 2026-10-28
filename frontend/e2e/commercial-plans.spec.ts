import { expect, test } from "@playwright/test";
import { ensureDevServerUp, prepareCleanBrowserState } from "./helpers";

type Plan = {
  id: string;
  price: number;
  ad_limit: number;
  max_photos: number;
  weight: number;
  public_visible: boolean;
  is_active: boolean;
};

const dealer = { email: "cnpj@carrosnacidade.com", password: "123456" };
const individual = { email: "cpf@carrosnacidade.com", password: "123456" };

function priceText(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(value)
    .replace(/\u00a0/g, " ");
}
function normalized(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

async function catalog(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get("/api/plans?verified=1");
  expect(response.ok(), "O catálogo deve ser confirmado no backend").toBeTruthy();
  const json = (await response.json()) as { plans: Plan[] };
  return json.plans;
}

async function login(page: import("@playwright/test").Page, who: typeof dealer) {
  const result = await page.request.post("/api/auth/login", {
    data: who,
    headers: { "Content-Type": "application/json" },
  });
  expect(result.ok(), "O login do fixture deve funcionar, sem pular o teste").toBeTruthy();
}

test("vitrine /planos usa preços e hierarquia do catálogo real sem divulgar limites de fotos", async ({
  page,
  request,
}) => {
  const plans = await catalog(request);
  const find = (id: string) => {
    const plan = plans.find((p) => p.id === id);
    expect(plan, `Fixture obrigatório: ${id}`).toBeDefined();
    return plan!;
  };
  const pro = find("cnpj-store-pro");
  const start = find("cnpj-store-start");
  const cpf = find("cpf-free-essential");
  const cnpj = find("cnpj-free-store");

  const boostResponse = await request.get("/api/public/commercial/boost?verified=1");
  expect(boostResponse.ok(), "Preço do Destaque deve estar confirmado").toBeTruthy();
  const { boost } = (await boostResponse.json()) as {
    boost: { price_cents: number; duration_days: number; active: boolean };
  };
  expect(boost.active).toBe(true);
  expect(boost.duration_days).toBe(7);

  await page.goto("/planos", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", {
      name: "Escolha o plano ideal para anunciar seu veículo",
    })
  ).toBeVisible();

  const ids = await page
    .locator("[data-plan-id]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-plan-id")));
  expect(ids).toEqual(["destaque-7-dias", "lojista-pro", "lojista-start", "gratis"]);

  const check = (id: string, price: string, weight?: number) => {
    const card = page.locator(`[data-plan-id="${id}"]`);
    return (async () => {
      await expect(card).toContainText(price);
      await expect(card).not.toContainText(/\d+ fotos? por anúncio/i);
      if (weight != null) await expect(card).toContainText(`peso ${weight}`);
    })();
  };
  await check("destaque-7-dias", priceText(boost.price_cents / 100), 4);
  await check("lojista-pro", priceText(Number(pro.price)), Number(pro.weight));
  await check("lojista-start", priceText(Number(start.price)), Number(start.weight));
  const free = page.locator('[data-plan-id="gratis"]');
  await expect(free).toContainText(`${cpf.ad_limit} anúncios`);
  await expect(free).toContainText(`${cnpj.ad_limit} anúncios`);
  await expect(free).not.toContainText(/\d+ fotos? por anúncio/i);
  const cardCopy = (await page.locator("[data-plan-id]").allTextContents()).join(" ");
  expect(normalized(cardCopy)).not.toMatch(/v[ií]deo 360|cr[eé]ditos mensais de destaque/i);
});

test("a etapa final CNPJ apresenta os mesmos valores e preserva o anúncio", async ({
  page,
  context,
  request,
}) => {
  const plans = await catalog(request);
  const pro = plans.find((p) => p.id === "cnpj-store-pro")!;
  const start = plans.find((p) => p.id === "cnpj-store-start")!;
  await prepareCleanBrowserState(page, context);
  await login(page, dealer);
  await page.goto("/anunciar/novo?tipo=lojista&step=5", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("review-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-plan-key="lojista-pro"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-plan-key="lojista-start"]')).toBeVisible();
  await expect(page.locator('[data-plan-key="boost-7d"]')).toBeVisible();
  await expect(page.locator('[data-plan-key="free"]')).toBeVisible();
  await expect(page.locator('[data-plan-key="lojista-pro"]')).toContainText(
    priceText(Number(pro.price))
  );
  await expect(page.locator('[data-plan-key="lojista-start"]')).toContainText(
    priceText(Number(start.price))
  );
  await expect(page.locator('[data-plan-key="lojista-pro"]')).not.toContainText(
    /\d+ fotos? por anúncio/i
  );
  await expect(page.locator('[data-plan-key="lojista-start"]')).not.toContainText(
    /\d+ fotos? por anúncio/i
  );

  const details = page.getByRole("link", { name: /Ver detalhes de todos os planos/i });
  await expect(details).toHaveAttribute("href", "/planos");
  await expect(details).toHaveAttribute("target", "_blank");

  await page.locator('[data-plan-key="lojista-pro"]').click();
  await expect(page.locator('[data-plan-key="lojista-pro"]')).toHaveAttribute(
    "data-selected",
    "true"
  );
  await expect(
    page.getByText(/A assinatura não publica este anúncio automaticamente/)
  ).toBeVisible();
});

test("conta CPF não recebe oferta de assinatura CNPJ na última etapa", async ({
  page,
  context,
}) => {
  await prepareCleanBrowserState(page, context);
  await login(page, individual);
  await page.goto("/anunciar/novo?tipo=particular&step=5", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("review-title")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-plan-key="free"]')).toBeVisible();
  await expect(page.locator('[data-plan-key="boost-7d"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-plan-key="lojista-pro"]')).toHaveCount(0);
  await expect(page.locator('[data-plan-key="lojista-start"]')).toHaveCount(0);
});

test("vitrine de planos mantém os quatro cards acessíveis no celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/planos", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-plan-id]")).toHaveCount(4, { timeout: 30_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, "A página não pode gerar rolagem horizontal no celular").toBeLessThanOrEqual(2);
});
