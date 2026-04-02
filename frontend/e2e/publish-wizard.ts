import { expect, type Page } from "@playwright/test";

/** PNG 1×1 válido para upload no passo Fotos. */
const MIN_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v1";

const E2E_DEBUG_FIPE = process.env.E2E_DEBUG_FIPE === "1";

function debugFipe(message: string) {
  if (E2E_DEBUG_FIPE) {
    console.log(`[e2e:fipe] ${message}`);
  }
}

function isFipeResponse(url: string, fragment: string) {
  return url.includes(fragment);
}

async function selectHasOptions(page: Page, index: number, minimum = 2) {
  return page.evaluate(
    ({ index: selectIndex, minimumOptions }) => {
      const select = document.querySelectorAll("main select")[selectIndex];
      return Boolean(select && select.querySelectorAll("option").length >= minimumOptions);
    },
    { index, minimumOptions: minimum }
  );
}

async function waitForSelectOptions(page: Page, index: number, minimum = 2, timeout = 90_000) {
  await page.waitForFunction(
    ({ index: selectIndex, minimumOptions }) => {
      const select = document.querySelectorAll("main select")[selectIndex];
      return Boolean(select && select.querySelectorAll("option").length >= minimumOptions);
    },
    { index, minimumOptions: minimum },
    { timeout }
  );
}

export type PublishWizardResult = {
  brandLabel: string;
  modelLabel: string;
};

export type RunPublishWizardOptions = {
  /** Se true, não navega de novo — use após `completePendingProfileIfNeeded` na mesma URL. */
  skipInitialNavigation?: boolean;
};

/**
 * Executa o assistente `/anunciar/novo` até Publicar (alinhado a `10-login-ad-publish.spec.ts`).
 */
export async function runPublishWizardFlow(
  page: Page,
  options?: RunPublishWizardOptions
): Promise<PublishWizardResult> {
  await page.addInitScript(({ storageKey }) => {
    try {
      window.localStorage.removeItem(storageKey);
      window.sessionStorage.clear();
    } catch {
      // noop
    }
  }, { storageKey: WIZARD_STORAGE_KEY });

  page.on("response", (response) => {
    const url = response.url();
    if (
      isFipeResponse(url, "/api/fipe/brands") ||
      isFipeResponse(url, "/api/fipe/models") ||
      isFipeResponse(url, "/api/fipe/years") ||
      isFipeResponse(url, "/api/fipe/quote")
    ) {
      debugFipe(`${response.request().method()} ${url} -> ${response.status()}`);
    }
  });

  const brandsResponsePromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/brands") && r.ok(),
    { timeout: 90_000 }
  );

  if (!options?.skipInitialNavigation) {
    await page.goto("/anunciar/novo?tipo=particular&step=1", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  }
  await expect(page.getByRole("heading", { level: 1, name: /Dados do veículo/i })).toBeVisible();

  const selects = page.locator("main select");
  await selects.nth(0).waitFor({ state: "visible", timeout: 60_000 });
  if (!(await selectHasOptions(page, 0))) {
    debugFipe("aguardando brands após mount do wizard");
    await brandsResponsePromise.catch(() => null);
    await waitForSelectOptions(page, 0);
  }

  let brandPicked = false;
  const brandCount = await selects.nth(0).locator("option").count();
  for (let bi = 1; bi < Math.min(brandCount, 12); bi += 1) {
    const modelsResponsePromise = page.waitForResponse(
      (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/models") && r.ok(),
      { timeout: 90_000 }
    );
    await selects.nth(0).selectOption({ index: bi });
    if (!(await selectHasOptions(page, 1))) {
      await modelsResponsePromise.catch(() => null);
      await waitForSelectOptions(page, 1, 2, 30_000);
    }
    const modelOpts = await selects.nth(1).locator("option").count();
    if (modelOpts > 1) {
      brandPicked = true;
      break;
    }
  }
  expect(
    brandPicked,
    "Nenhuma marca retornou modelos da FIPE (configure API ou ambiente)."
  ).toBeTruthy();

  const brandLabel = (await selects.nth(0).locator("option:checked").textContent())?.trim() || "";

  const yearsResponsePromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/years") && r.ok(),
    { timeout: 90_000 }
  );
  await selects.nth(1).selectOption({ index: 1 });

  if (!(await selectHasOptions(page, 2))) {
    await yearsResponsePromise.catch(() => null);
    await waitForSelectOptions(page, 2);
  }

  await page.waitForTimeout(400);

  const modelLabel = (await selects.nth(1).locator("option:checked").textContent())?.trim() || "";

  const allSelects = page.locator("main select");
  expect(await allSelects.count()).toBeGreaterThanOrEqual(6);

  await allSelects.nth(2).selectOption({ index: 1 });
  await allSelects.nth(3).selectOption({ index: 1 });

  const quoteResponsePromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/quote") && r.ok(),
    { timeout: 90_000 }
  );
  await allSelects.nth(4).selectOption({ index: 1 });
  await quoteResponsePromise.catch(() => null);

  await allSelects.nth(5).selectOption({ index: 1 });

  await page.getByRole("button", { name: /Continuar/i }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: /Informações do anúncio/i })
  ).toBeVisible();
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

  await page
    .locator("label")
    .filter({ hasText: /Estado \(UF\)/i })
    .locator("select")
    .selectOption("SP");

  const selectedCityBanner = page.locator("text=(selecionada na base)").first();
  if (await selectedCityBanner.isVisible().catch(() => false)) {
    debugFipe("cidade já resolvida no wizard; reutilizando seleção existente");
  } else {
    const citySearchResponsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" && r.url().includes("/api/painel/cidades/search"),
      { timeout: 90_000 }
    );
    const cityInput = page.getByPlaceholder("Digite ao menos 2 letras e escolha na lista");
    await cityInput.fill("Atibaia");
    const citySearchResponse = await citySearchResponsePromise.catch(() => null);
    if (citySearchResponse && !citySearchResponse.ok()) {
      const errText = await citySearchResponse.text();
      throw new Error(
        `GET /api/painel/cidades/search falhou: HTTP ${citySearchResponse.status()} — ${errText.slice(0, 500)}`
      );
    }
    await page
      .getByRole("button", { name: /^Atibaia$/i })
      .first()
      .waitFor({ state: "visible", timeout: 90_000 });
    await page
      .getByRole("button", { name: /^Atibaia$/i })
      .first()
      .click();
  }

  await page.getByPlaceholder("(11) 99999-9999").first().fill("11999999999");
  await page.getByPlaceholder("(11) 3333-3333").fill("1133333333");
  await page
    .getByRole("checkbox", { name: /informações são verdadeiras|autorizo a publicação/i })
    .check();

  const publishResponsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/painel/anuncios") && r.request().method() === "POST",
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
