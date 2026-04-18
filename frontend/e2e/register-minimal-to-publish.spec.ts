import { test, expect } from "@playwright/test";
import { ensureDevServerUp, getBackendApiBaseUrl, waitForVehicleGalleryReady } from "./helpers";
import {
  createPublishPhotoFixtures,
  publishAdWithPhotosAndOpenDetail,
} from "./publish-gallery-helpers";

/**
 * Fluxo completo: cadastro só e-mail+senha → painel → Novo anúncio (gate CPF) → wizard → POST publicação.
 *
 * Pré-requisitos: Next (3000) + backend (4000) com **Postgres** (`DATABASE_URL`) + FIPE.
 * Preparar base: `npm run e2e:prepare` (raiz). Ver docs/testing/e2e.md
 */

let backendRegisterProbeOk = false;

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
  const apiBase = getBackendApiBaseUrl();
  const probe = await request.post(`${apiBase}/api/auth/register`, {
    data: {
      email: `e2e.probe.${Date.now()}@e2e.carrosnacidade.test`,
      password: "Probe123456xx",
    },
    headers: { "Content-Type": "application/json" },
    timeout: 30_000,
  });
  backendRegisterProbeOk = probe.ok();
  if (!backendRegisterProbeOk) {
    const body = await probe.text();
    console.warn(
      `[e2e] POST ${apiBase}/api/auth/register (probe) → HTTP ${probe.status()}`,
      body.slice(0, 400)
    );
  }
});

test.describe.serial("Cadastro mínimo → completar perfil → publicar", () => {
  test("publica com uma foto .png e valida a galeria pública", async ({
    page,
    context,
    request,
  }) => {
    test.skip(
      !backendRegisterProbeOk,
      "Backend POST /api/auth/register falhou (subir Postgres, definir DATABASE_URL no processo da API e rodar npm run e2e:prepare na raiz). Ver docs/testing/e2e.md"
    );
    const fixtures = createPublishPhotoFixtures();
    await publishAdWithPhotosAndOpenDetail({
      page,
      context,
      request,
      photos: [fixtures.png],
    });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vehicle-gallery-empty")).toHaveCount(0);
    await expect(page.locator('[data-testid^="vehicle-gallery-thumb-"]')).toHaveCount(0);
    await expect(page.getByTestId("vehicle-gallery-main-image")).toHaveAttribute(
      "src",
      /vehicle-images/
    );
  });

  test("publica com uma foto .jpg e valida a galeria pública", async ({
    page,
    context,
    request,
  }) => {
    test.skip(!backendRegisterProbeOk);
    const fixtures = createPublishPhotoFixtures();
    await publishAdWithPhotosAndOpenDetail({
      page,
      context,
      request,
      photos: [fixtures.jpg],
    });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vehicle-gallery-empty")).toHaveCount(0);
    await expect(page.locator('[data-testid^="vehicle-gallery-thumb-"]')).toHaveCount(0);
  });

  test("publica com uma foto .jpeg e valida a galeria pública", async ({
    page,
    context,
    request,
  }) => {
    test.skip(!backendRegisterProbeOk);
    const fixtures = createPublishPhotoFixtures();
    await publishAdWithPhotosAndOpenDetail({
      page,
      context,
      request,
      photos: [fixtures.jpeg],
    });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("vehicle-gallery-empty")).toHaveCount(0);
    await expect(page.locator('[data-testid^="vehicle-gallery-thumb-"]')).toHaveCount(0);
  });

  test("publica com várias fotos e valida miniaturas + lightbox + navegação", async ({
    page,
    context,
    request,
  }) => {
    test.skip(!backendRegisterProbeOk);
    const fixtures = createPublishPhotoFixtures();
    await publishAdWithPhotosAndOpenDetail({
      page,
      context,
      request,
      photos: [fixtures.png, fixtures.jpg, fixtures.jpeg],
    });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible({ timeout: 30_000 });
    const thumbs = page.locator('[data-testid^="vehicle-gallery-thumb-"]');
    await expect(thumbs).toHaveCount(3, { timeout: 10_000 });

    const mainImage = page.getByTestId("vehicle-gallery-main-image");
    const initialSrc = await mainImage.getAttribute("src");
    await expect(initialSrc, "Imagem principal inicial deve estar presente").toBeTruthy();

    await page.getByTestId("vehicle-gallery-thumb-1").click();
    await expect(page.getByTestId("vehicle-gallery-thumb-1")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("vehicle-gallery-counter")).toHaveText("2 de 3");
    await expect
      .poll(async () => mainImage.getAttribute("src"), {
        message: "A miniatura deve trocar a imagem principal.",
      })
      .not.toBe(initialSrc);

    await page.getByTestId("vehicle-gallery-main-trigger").click();
    await expect(page.getByTestId("vehicle-gallery-lightbox")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-lightbox-image")).toBeVisible();

    const lightboxImage = page.getByTestId("vehicle-gallery-lightbox-image");
    const lightboxInitialSrc = await lightboxImage.getAttribute("src");

    await page.getByRole("button", { name: /próxima foto no modal/i }).click();
    await expect(page.getByTestId("vehicle-gallery-lightbox-counter")).toContainText("3/3");
    await expect
      .poll(async () => lightboxImage.getAttribute("src"), {
        message: "O lightbox deve navegar entre as fotos.",
      })
      .not.toBe(lightboxInitialSrc);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("vehicle-gallery-lightbox")).toHaveCount(0);
  });
});
