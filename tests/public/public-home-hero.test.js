import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/home/admin-home.repository.js", () => ({
  findByKey: vi.fn(),
  updateByKey: vi.fn(),
}));

import { findByKey } from "../../src/modules/admin/home/admin-home.repository.js";
import { getPublicHero } from "../../src/modules/admin/home/admin-home.service.js";

const row = {
  id: 1,
  key: "home_hero",
  title: "Carros usados",
  subtitle: "Ofertas selecionadas",
  cta_label: "Ver ofertas",
  cta_url: "/comprar",
  image_desktop_url: "https://cdn.example.com/x.webp",
  image_mobile_url: null,
  image_alt: "Alt",
  is_active: true,
  version: 1,
  created_at: "2026-05-31T00:00:00Z",
  updated_at: "2026-05-31T00:00:00Z",
  updated_by_admin_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicHero — leitura pública", () => {
  it("retorna DTO quando is_active=true", async () => {
    findByKey.mockResolvedValue(row);
    const data = await getPublicHero();
    expect(data?.key).toBe("home_hero");
    expect(data?.title).toBe(row.title);
  });

  it("retorna null quando is_active=false (fallback do frontend)", async () => {
    findByKey.mockResolvedValue({ ...row, is_active: false });
    expect(await getPublicHero()).toBeNull();
  });

  it("retorna null se a row não existir", async () => {
    findByKey.mockResolvedValue(null);
    expect(await getPublicHero()).toBeNull();
  });
});
