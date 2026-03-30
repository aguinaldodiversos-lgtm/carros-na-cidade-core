import { expect, type Page } from "@playwright/test";

/** PNG 1×1 válido para upload no passo Fotos. */
const MIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export type PublishWizardResult = {
  brandLabel: string;
  modelLabel: string;
};

/**
 * Executa o assistente `/anunciar/novo` até Publicar (alinhado a `10-login-ad-publish.spec.ts`).
 */
export async function runPublishWizardFlow(page: Page): Promise<PublishWizardResult> {
  await page.goto("/anunciar/novo?tipo=particular&step=1", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await expect(page.getByRole("heading", { level: 1, name: /Dados do veículo/i })).toBeVisible();

  const selects = page.locator("main select");
  await selects.nth(0).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForResponse((r) => r.url().includes("/api/fipe/brands") && r.ok(), {
    timeout: 90_000,
  });
  await page.waitForFunction(
    () => {
      const el = document.querySelector("main select");
      return el && el.querySelectorAll("option").length > 1;
    },
    { timeout: 90_000 }
  );

  let brandPicked = false;
  const brandCount = await selects.nth(0).locator("option").count();
  for (let bi = 1; bi < Math.min(brandCount, 12); bi += 1) {
    await selects.nth(0).selectOption({ index: bi });
    await page
      .waitForResponse((r) => r.url().includes("/api/fipe/models") && r.ok(), { timeout: 90_000 })
      .catch(() => null);
    await page.waitForFunction(
      () => {
        const sel = document.querySelectorAll("main select")[1];
        return sel && sel.querySelectorAll("option").length > 1;
      },
      { timeout: 30_000 }
    );
    const modelOpts = await selects.nth(1).locator("option").count();
    if (modelOpts > 1) {
      brandPicked = true;
      break;
    }
  }
  expect(brandPicked, "Nenhuma marca retornou modelos da FIPE (configure API ou ambiente).").toBeTruthy();

  const brandLabel =
    (await selects.nth(0).locator("option:checked").textContent())?.trim() || "";

  await selects.nth(1).selectOption({ index: 1 });

  await page.waitForResponse((r) => r.url().includes("/api/fipe/years") && r.ok(), { timeout: 90_000 });

  await page.waitForTimeout(400);

  const modelLabel =
    (await selects.nth(1).locator("option:checked").textContent())?.trim() || "";

  const allSelects = page.locator("main select");
  expect(await allSelects.count()).toBeGreaterThanOrEqual(6);

  await allSelects.nth(2).selectOption({ index: 1 });
  await allSelects.nth(3).selectOption({ index: 1 });

  await page
    .waitForResponse((r) => r.url().includes("/api/fipe/quote") && r.ok(), { timeout: 90_000 })
    .catch(() => null);

  await allSelects.nth(4).selectOption({ index: 1 });
  await allSelects.nth(5).selectOption({ index: 1 });

  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Informações do anúncio/i })).toBeVisible();
  await page.getByLabel(/Quilometragem/i).fill("45000");
  await page.getByLabel(/^Preço/i).fill("8500000");
  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Fotos/i })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e.png",
    mimeType: "image/png",
    buffer: Buffer.from(MIN_PNG_BASE64, "base64"),
  });
  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Opcionais/i })).toBeVisible();
  await page.getByRole("button", { name: "Ar-condicionado" }).click();
  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Condições/i })).toBeVisible();
  await page.getByRole("button", { name: "IPVA pago" }).click();
  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Destaque/i })).toBeVisible();
  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(page.getByRole("heading", { level: 1, name: /Finalização/i })).toBeVisible();

  await page.locator("label").filter({ hasText: /Estado \(UF\)/i }).locator("select").selectOption("SP");
  const cityInput = page.getByPlaceholder("Digite ao menos 2 letras e escolha na lista");
  await cityInput.fill("Atibaia");
  await page.getByRole("button", { name: /^Atibaia$/i }).first().waitFor({ state: "visible", timeout: 90_000 });
  await page.getByRole("button", { name: /^Atibaia$/i }).first().click();

  await page.getByPlaceholder("(11) 99999-9999").first().fill("11999999999");
  await page.getByPlaceholder("(11) 3333-3333").fill("1133333333");
  await page
    .getByRole("checkbox", { name: /informações são verdadeiras|autorizo a publicação/i })
    .check();

  const publishResponsePromise = page.waitForResponse(
    (r) =>
      r.url().includes("/api/painel/anuncios") &&
      r.request().method() === "POST",
    { timeout: 120_000 }
  );

  await page.getByRole("button", { name: /Publicar anúncio/i }).click();

  const publishRes = await publishResponsePromise;
  if (!publishRes.ok()) {
    const errText = await publishRes.text();
    throw new Error(
      `POST /api/painel/anuncios falhou: HTTP ${publishRes.status()} — ${errText.slice(0, 900)}`
    );
  }

  await page.waitForTimeout(4000);

  const bodyText = (await page.textContent("body")) ?? "";
  const published =
    bodyText.includes("sucesso") ||
    bodyText.includes("enviado") ||
    bodyText.includes("Publicando") ||
    bodyText.includes("Anúncio enviado");
  expect(
    published,
    `Feedback de publicação ausente ou inesperado: ${bodyText.slice(0, 800)}`
  ).toBeTruthy();

  return {
    brandLabel: brandLabel.replace(/\s+/g, " ").trim(),
    modelLabel: modelLabel.replace(/\s+/g, " ").trim(),
  };
}
