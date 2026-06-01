import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/home/admin-home.repository.js", () => ({
  listBySectionType: vi.fn(),
  findByPosition: vi.fn(),
  updateByPosition: vi.fn(),
}));

import { listBySectionType } from "../../src/modules/admin/home/admin-home.repository.js";
import { listPublicHeroBanners } from "../../src/modules/admin/home/admin-home.service.js";

function makeBanner(position, overrides = {}) {
  return {
    id: position,
    key: `home_hero_${position}`,
    section_type: "home_hero",
    position,
    title: `B${position}`,
    subtitle: null,
    cta_label: "Ver",
    cta_url: "/comprar",
    image_desktop_url: null,
    image_mobile_url: null,
    image_alt: null,
    is_active: true,
    version: 1,
    created_at: "2026-05-31T00:00:00Z",
    updated_at: "2026-05-31T00:00:00Z",
    updated_by_admin_id: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPublicHeroBanners — contrato público", () => {
  it("delega ao repo com includeInactive=false", async () => {
    listBySectionType.mockResolvedValue([]);
    await listPublicHeroBanners();
    expect(listBySectionType).toHaveBeenCalledWith("home_hero", { includeInactive: false });
  });

  it("retorna lista vazia quando nenhum ativo (frontend → fallback)", async () => {
    listBySectionType.mockResolvedValue([]);
    expect(await listPublicHeroBanners()).toEqual([]);
  });

  it("retorna banners ordenados por position", async () => {
    // Repo já ordena, mas conferimos que o service preserva.
    listBySectionType.mockResolvedValue([makeBanner(1), makeBanner(2), makeBanner(3)]);
    const banners = await listPublicHeroBanners();
    expect(banners.map((b) => b.position)).toEqual([1, 2, 3]);
  });

  it("repassa apenas campos públicos relevantes", async () => {
    listBySectionType.mockResolvedValue([makeBanner(1, { title: "Promo Junho" })]);
    const [banner] = await listPublicHeroBanners();
    expect(banner.title).toBe("Promo Junho");
    expect(banner.position).toBe(1);
    expect(banner.section_type).toBe("home_hero");
  });
});
