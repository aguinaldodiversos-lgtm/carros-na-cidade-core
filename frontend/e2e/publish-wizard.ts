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

function waitForResponseSafe(
  page: Page,
  predicate: Parameters<Page["waitForResponse"]>[0],
  timeout = 90_000
) {
  return page.waitForResponse(predicate, { timeout }).catch(() => null);
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

async function safeApiJson(response: Awaited<ReturnType<Page["waitForResponse"]>>) {
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractPublishedSlug(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const root = payload as Record<string, unknown>;
  const result =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root;
  const nested =
    result.ad && typeof result.ad === "object"
      ? (result.ad as Record<string, unknown>)
      : result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : result;

  const slug = nested.slug;
  return typeof slug === "string" && slug.trim() ? slug.trim() : null;
}

export type PublishWizardResult = {
  brandLabel: string;
  modelLabel: string;
  publishedSlug: string | null;
};

export type PublishWizardPhoto = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

export type RunPublishWizardOptions = {
  /** Se true, não navega de novo — use após `completePendingProfileIfNeeded` na mesma URL. */
  skipInitialNavigation?: boolean;
  photos?: PublishWizardPhoto[];
};

/**
 * Executa o assistente `/anunciar/novo` até Publicar (alinhado a `10-login-ad-publish.spec.ts`).
 */
export async function runPublishWizardFlow(
  page: Page,
  options?: RunPublishWizardOptions
): Promise<PublishWizardResult> {
  await page.addInitScript(
    ({ storageKey }) => {
      try {
        window.localStorage.removeItem(storageKey);
        window.sessionStorage.clear();
      } catch {
        // noop
      }
    },
    { storageKey: WIZARD_STORAGE_KEY }
  );

  await page
    .evaluate(
      ({ storageKey }) => {
        try {
          window.localStorage.removeItem(storageKey);
          window.sessionStorage.clear();
        } catch {
          // noop
        }
      },
      { storageKey: WIZARD_STORAGE_KEY }
    )
    .catch(() => null);

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

  const brandsResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/brands") && r.ok()
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
    const modelsResponsePromise = waitForResponseSafe(
      page,
      (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/models") && r.ok()
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

  const yearsResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/years") && r.ok()
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

  const quoteResponsePromise = waitForResponseSafe(
    page,
    (r) => r.request().method() === "GET" && r.url().includes("/api/fipe/quote") && r.ok()
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
  const photos =
    options?.photos && options.photos.length > 0
      ? options.photos
      : [
          {
            name: "e2e.png",
            mimeType: "image/png",
            buffer: Buffer.from(MIN_PNG_BASE64, "base64"),
          },
        ];

  await page.locator('input[type="file"]').setInputFiles(
    photos.map((photo) => ({
      name: photo.name,
      mimeType: photo.mimeType,
      buffer: photo.buffer,
    }))
  );
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
    const citySearchResponsePromise = waitForResponseSafe(
      page,
      (r) => r.request().method() === "GET" && r.url().includes("/api/painel/cidades/search")
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

  const publishResponsePromise = waitForResponseSafe(
    page,
    (r) => r.url().includes("/api/painel/anuncios") && r.request().method() === "POST",
    120_000
  );

  await page.getByRole("button", { name: /Publicar anúncio/i }).click();

  const publishRes = await publishResponsePromise;
  if (!publishRes) {
    throw new Error("POST /api/painel/anuncios não foi observado pelo Playwright.");
  }
  if (!publishRes.ok()) {
    const errText = await publishRes.text();
    throw new Error(
      `POST /api/painel/anuncios falhou: HTTP ${publishRes.status()} — ${errText.slice(0, 900)}`
    );
  }

  const publishPayload = await safeApiJson(publishRes);
  const publishedSlug = extractPublishedSlug(publishPayload);

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
    publishedSlug,
  };
}
