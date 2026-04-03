import { expect, test, type Locator } from "@playwright/test";
import { waitForVehicleGalleryReady } from "./helpers";

const multiPhotoSlug = "fiat-pulse-audace-1-0-turbo-200-flex-aut-2024-1775233738284";
const singlePhotoSlug = "gm-chevrolet-onix-sedan-plus-ltz-1-0-12v-tb-flex-aut-2025-1775185123098";
const noPhotoSlug = "vw-volkswagen-t-cross-200-tsi-1-0-flex-12v-5p-aut-2024-1775008912992";

async function readImageSrc(locator: Locator) {
  return locator.evaluate((element: HTMLImageElement) => element.currentSrc || element.src || "");
}

test.describe("Vehicle detail premium page", () => {
  test("multiple photos: thumbnails, lightbox, persistence and whatsapp fallback", async ({ page }) => {
    await page.goto(`/veiculo/${multiPhotoSlug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    await expect(page.getByRole("heading", { name: /simule o financiamento/i })).toBeVisible();

    const mainImage = page.getByTestId("vehicle-gallery-main-image");
    await expect(mainImage).toBeVisible();

    const initialSrc = await readImageSrc(mainImage);
    await page.getByTestId("vehicle-gallery-thumb-1").click();
    await expect(page.getByTestId("vehicle-gallery-thumb-1")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("vehicle-gallery-counter")).toHaveText("2 de 5");
    await expect
      .poll(async () => readImageSrc(mainImage), {
        message: "A imagem principal deve mudar ao clicar na miniatura",
      })
      .not.toBe(initialSrc);

    await page.getByTestId("vehicle-gallery-main-trigger").click();
    await expect(page.getByTestId("vehicle-gallery-lightbox")).toBeVisible();

    const lightboxImage = page.getByTestId("vehicle-gallery-lightbox-image");
    const modalInitialSrc = await readImageSrc(lightboxImage);
    await page.getByRole("button", { name: /próxima foto no modal/i }).click();
    await expect(page.getByTestId("vehicle-gallery-lightbox-counter")).toContainText("3/5");
    await expect
      .poll(async () => readImageSrc(lightboxImage), {
        message: "O modal deve navegar entre as imagens",
      })
      .not.toBe(modalInitialSrc);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("vehicle-gallery-lightbox")).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible();

    await expect(page.getByTestId("vehicle-whatsapp-unavailable")).toBeVisible();
    await expect(page.getByTestId("vehicle-whatsapp-cta")).toHaveCount(0);
  });

  test("single photo: gallery stays stable without broken empty states", async ({ page }) => {
    await page.goto(`/veiculo/${singlePhotoSlug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-main-image")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-thumb-0")).toHaveCount(0);
    await expect(page.getByTestId("vehicle-gallery-thumb-1")).toHaveCount(0);
    await expect(page.getByTestId("vehicle-gallery-empty")).toHaveCount(0);
  });

  test("no photo: elegant fallback renders without broken frame", async ({ page }) => {
    await page.goto(`/veiculo/${noPhotoSlug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-empty")).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery-main-image")).toHaveCount(0);
    await expect(page.locator('[data-testid^="vehicle-gallery-thumb-"]')).toHaveCount(0);
    await expect(page.getByText(/fotos em atualização/i)).toBeVisible();
  });

  test("mobile layout remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/veiculo/${multiPhotoSlug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });

    await waitForVehicleGalleryReady(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("vehicle-gallery")).toBeVisible();
    await expect(page.getByRole("link", { name: /simular/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /contato/i }).first()).toBeVisible();
  });
});
