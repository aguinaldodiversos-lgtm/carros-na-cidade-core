import { expect, test } from "@playwright/test";
import { ensureDevServerUp } from "./helpers";

// Regressões da auditoria SEO PR #93: URL canônica própria e uma única marca.
const INSTITUTIONAL_PAGES = [
  "/ajuda",
  "/sobre",
  "/contato",
  "/como-funciona",
  "/seguranca",
  "/termos-de-uso",
  "/politica-de-privacidade",
] as const;

test.beforeAll(async ({ request, baseURL }) => {
  await ensureDevServerUp(request, baseURL);
});

test.describe("SEO institucional — PR93", () => {
  for (const path of INSTITUTIONAL_PAGES) {
    test(`${path}: canonical própria e sem marca duplicada`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok(), `Status HTTP de ${path}`).toBe(true);

      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, `canonical de ${path}`).toBeTruthy();
      const canonicalUrl = new URL(canonical!);
      expect(canonicalUrl.pathname).toBe(path);
      expect(canonicalUrl.search).toBe("");
      expect(canonicalUrl.hash).toBe("");

      const title = await page.title();
      expect(title.match(/Carros na Cidade/g)?.length ?? 0, title).toBe(1);
    });
  }

  test("LGPD legada redireciona permanentemente para Política de Privacidade", async ({
    request,
  }) => {
    const response = await request.get("/lgpd", { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const location = response.headers().location;
    expect(location).toBeTruthy();
    expect(new URL(location!, "http://127.0.0.1:3000").pathname).toBe(
      "/politica-de-privacidade"
    );
  });

  test("blog não promete veículos verificados ou vendedores confiáveis", async ({ page }) => {
    const response = await page.goto("/blog", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBe(true);

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/veículos verificados|vendedores confiáveis/i);
  });
});
