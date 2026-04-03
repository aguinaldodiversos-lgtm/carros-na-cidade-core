import { expect, type BrowserContext, type APIRequestContext, type Page } from "@playwright/test";

import {
  assertLatestAdPersistedForEmail,
  completePendingProfileIfNeeded,
  prepareCleanBrowserState,
  registerMinimalUserViaApi,
  waitForVehicleGalleryReady,
} from "./helpers";
import { runPublishWizardFlow, type PublishWizardPhoto } from "./publish-wizard";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const ONE_BY_ONE_JPEG_BASE64 =
  "/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgn/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCFADSgb//Z";

export type PublishedGalleryAdResult = {
  slug: string;
  brandWord: string;
  email: string;
};

export function createPublishPhotoFixtures(): Record<"png" | "jpg" | "jpeg", PublishWizardPhoto> {
  return {
    png: {
      name: "galeria-e2e.png",
      mimeType: "image/png",
      buffer: Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"),
    },
    jpg: {
      name: "galeria-e2e.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(ONE_BY_ONE_JPEG_BASE64, "base64"),
    },
    jpeg: {
      name: "galeria-e2e.jpeg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(ONE_BY_ONE_JPEG_BASE64, "base64"),
    },
  };
}

export async function publishAdWithPhotosAndOpenDetail({
  page,
  context,
  request,
  photos,
}: {
  page: Page;
  context: BrowserContext;
  request: APIRequestContext;
  photos: PublishWizardPhoto[];
}): Promise<PublishedGalleryAdResult> {
  await prepareCleanBrowserState(page, context);

  const run = Date.now();
  const email = `e2e.gallery.${run}@e2e.carrosnacidade.test`;
  const password = `E2Egal_${run}_Aa1!`;

  await registerMinimalUserViaApi(page, { email, password });

  await page.waitForURL(/\/dashboard/, {
    timeout: 120_000,
    waitUntil: "domcontentloaded",
  });

  await page.goto("/anunciar/novo?tipo=particular&step=1", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });

  await completePendingProfileIfNeeded(page);

  const { brandLabel, publishedSlug } = await runPublishWizardFlow(page, {
    skipInitialNavigation: true,
    photos,
  });

  const brandWord = brandLabel.split(/\s+/)[0]?.trim() || brandLabel;
  await assertLatestAdPersistedForEmail(email, brandWord);

  const slug = publishedSlug;
  expect(slug, "Publicação deve retornar slug público do anúncio recém-publicado").toBeTruthy();
  if (!slug) {
    throw new Error("[E2E gallery publish] slug ausente na resposta de publicação");
  }

  await page.goto(`/veiculo/${slug}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await waitForVehicleGalleryReady(page);

  return {
    slug,
    brandWord,
    email,
  };
}
