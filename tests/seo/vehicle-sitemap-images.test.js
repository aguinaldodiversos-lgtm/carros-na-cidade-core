import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listActiveAdRows: vi.fn() }));

vi.mock("../../src/read-models/seo/sitemap-ads.repository.js", () => ({
  listActiveAdRows: mocks.listActiveAdRows,
}));

import { getPublicVehicleSitemap } from "../../src/read-models/seo/sitemap-public.service.js";

const R2 = "https://img.carrosnacidade.com/vehicles/publish-122-abc/original/2026/07";

function row(over = {}) {
  return {
    slug: "fiat-pulse-drive-2024-123",
    last_updated: "2026-07-26T15:33:24.458Z",
    images: [`${R2}/capa.webp`, `${R2}/2.webp`],
    ...over,
  };
}

beforeEach(() => {
  mocks.listActiveAdRows.mockReset();
  vi.restoreAllMocks();
});

describe("getPublicVehicleSitemap — imagens", () => {
  it("emite as imagens na ordem do banco (capa primeiro)", async () => {
    mocks.listActiveAdRows.mockResolvedValue([row()]);
    const [entry] = await getPublicVehicleSitemap();
    expect(entry.images).toEqual([`${R2}/capa.webp`, `${R2}/2.webp`]);
    expect(entry.loc).toBe("/veiculo/fiat-pulse-drive-2024-123");
    expect(entry.lastmod).toBe("2026-07-26T15:33:24.458Z");
  });

  it("anúncio sem imagem NÃO ganha a chave images (XML omite as tags)", async () => {
    mocks.listActiveAdRows.mockResolvedValue([row({ images: [] }), row({ images: null })]);
    const entries = await getPublicVehicleSitemap();
    for (const e of entries) {
      expect(e).not.toHaveProperty("images");
      expect(e.loc).toBeTruthy(); // a URL da página continua no sitemap
    }
  });

  /**
   * O GUARD. Quando `R2_PUBLIC_BASE_URL` está vazia, a resolução de imagem cai
   * para `/api/vehicle-images?key=` (ads.public-images.js) — prefixo que o
   * robots.txt bloqueia com `Disallow: /api/`. Publicar isso no sitemap seria
   * pedir ao Google que rastreie o que proibimos.
   */
  it("descarta URL relativa sob /api/ (Disallow no robots) e avisa no log", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listActiveAdRows.mockResolvedValue([
      row({
        images: [
          "/api/vehicle-images?key=vehicles/abc/foto.webp",
          `${R2}/boa.webp`,
          "/uploads/ads/legado.jpg",
        ],
      }),
    ]);

    const [entry] = await getPublicVehicleSitemap();

    expect(entry.images).toEqual([`${R2}/boa.webp`]);
    expect(err).toHaveBeenCalledOnce();
    expect(String(err.mock.calls[0][0])).toMatch(/2 imagem\(ns\) descartada/);
    expect(String(err.mock.calls[0][0])).toMatch(/R2_PUBLIC_BASE_URL/);
  });

  it("descarta /api/ ABSOLUTO também (mesmo Disallow)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listActiveAdRows.mockResolvedValue([
      row({ images: ["https://www.carrosnacidade.com/api/vehicle-images?key=x", `${R2}/ok.webp`] }),
    ]);
    const [entry] = await getPublicVehicleSitemap();
    expect(entry.images).toEqual([`${R2}/ok.webp`]);
  });

  it("todas descartadas → entrada fica SEM images, rota não falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listActiveAdRows.mockResolvedValue([
      row({ images: ["/api/vehicle-images?key=a", "/uploads/b.jpg"] }),
    ]);
    const [entry] = await getPublicVehicleSitemap();
    expect(entry).not.toHaveProperty("images");
    expect(entry.loc).toBe("/veiculo/fiat-pulse-drive-2024-123");
  });

  it("não loga nada quando não há descarte", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listActiveAdRows.mockResolvedValue([row()]);
    await getPublicVehicleSitemap();
    expect(err).not.toHaveBeenCalled();
  });

  it("descarta lixo não-string sem quebrar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.listActiveAdRows.mockResolvedValue([
      row({ images: [null, 42, { url: "x" }, `${R2}/ok.webp`, "não-é-url"] }),
    ]);
    const [entry] = await getPublicVehicleSitemap();
    expect(entry.images).toEqual([`${R2}/ok.webp`]);
  });

  it("satura em 1.000 imagens por URL (limite do protocolo)", async () => {
    mocks.listActiveAdRows.mockResolvedValue([
      row({ images: Array.from({ length: 1200 }, (_, i) => `${R2}/f${i}.webp`) }),
    ]);
    const [entry] = await getPublicVehicleSitemap();
    expect(entry.images).toHaveLength(1000);
    expect(entry.images[0]).toBe(`${R2}/f0.webp`); // capa preservada
  });
});
