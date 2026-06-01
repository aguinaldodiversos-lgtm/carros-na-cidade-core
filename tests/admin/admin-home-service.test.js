import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/home/admin-home.repository.js", () => ({
  findByKey: vi.fn(),
  updateByKey: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  uploadSiteImage: vi.fn(),
}));

import { findByKey, updateByKey } from "../../src/modules/admin/home/admin-home.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { uploadSiteImage } from "../../src/infrastructure/storage/r2.service.js";
import {
  getHero,
  getPublicHero,
  updateHero,
  uploadHeroImage,
} from "../../src/modules/admin/home/admin-home.service.js";

const baseRow = {
  id: 1,
  key: "home_hero",
  title: "Carros usados no Brasil",
  subtitle: "Ofertas selecionadas",
  cta_label: "Ver ofertas",
  cta_url: "/comprar",
  image_desktop_url: "https://cdn.example.com/site/home-hero/desktop/old.webp",
  image_mobile_url: null,
  image_alt: "Carros usados Carros na Cidade",
  is_active: true,
  version: 3,
  created_at: "2026-05-31T00:00:00Z",
  updated_at: "2026-05-31T01:00:00Z",
  updated_by_admin_id: "admin-prev",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin-home.service · getHero", () => {
  it("retorna o DTO do hero atual (admin enxerga mesmo inativo)", async () => {
    findByKey.mockResolvedValue({ ...baseRow, is_active: false });
    const data = await getHero();
    expect(data).toMatchObject({ key: "home_hero", is_active: false, version: 3 });
  });

  it("retorna null se não existir", async () => {
    findByKey.mockResolvedValue(null);
    expect(await getHero()).toBeNull();
  });
});

describe("admin-home.service · getPublicHero", () => {
  it("retorna apenas quando is_active=true", async () => {
    findByKey.mockResolvedValueOnce({ ...baseRow, is_active: false });
    expect(await getPublicHero()).toBeNull();

    findByKey.mockResolvedValueOnce({ ...baseRow, is_active: true });
    const data = await getPublicHero();
    expect(data?.title).toBe(baseRow.title);
  });
});

describe("admin-home.service · updateHero validações", () => {
  it("exige reason", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({ adminUserId: "admin-1", payload: { title: "X" }, reason: "" })
    ).rejects.toThrow(/Motivo/);
  });

  it("rejeita cta_url javascript:", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({
        adminUserId: "admin-1",
        payload: { cta_url: "javascript:alert(1)" },
        reason: "teste",
      })
    ).rejects.toThrow(/cta_url/);
  });

  it("aceita cta_url interno '/'", async () => {
    findByKey.mockResolvedValue(baseRow);
    updateByKey.mockResolvedValue({ ...baseRow, cta_url: "/outra-rota", version: 4 });
    const data = await updateHero({
      adminUserId: "admin-1",
      payload: { cta_url: "/outra-rota" },
      reason: "teste",
    });
    expect(data.cta_url).toBe("/outra-rota");
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update_home_hero",
        targetType: "home_content",
        targetId: "home_hero",
      })
    );
  });

  it("aceita cta_url https externo", async () => {
    findByKey.mockResolvedValue(baseRow);
    updateByKey.mockResolvedValue({
      ...baseRow,
      cta_url: "https://exemplo.com/campanha",
      version: 4,
    });
    const data = await updateHero({
      adminUserId: "admin-1",
      payload: { cta_url: "https://exemplo.com/campanha" },
      reason: "campanha",
    });
    expect(data.cta_url).toBe("https://exemplo.com/campanha");
  });

  it("rejeita image_desktop_url file://", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({
        adminUserId: "admin-1",
        payload: { image_desktop_url: "file:///etc/passwd" },
        reason: "x",
      })
    ).rejects.toThrow(/image_desktop_url/);
  });

  it("exige image_alt quando há imagem desktop e alt foi limpo", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({
        adminUserId: "admin-1",
        payload: { image_alt: "" },
        reason: "limpando alt",
      })
    ).rejects.toThrow(/image_alt/);
  });

  it("rejeita payload sem campos válidos", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({ adminUserId: "admin-1", payload: { foo: "bar" }, reason: "x" })
    ).rejects.toThrow(/Nenhum campo/);
  });

  it("is_active deve ser boolean", async () => {
    findByKey.mockResolvedValue(baseRow);
    await expect(
      updateHero({ adminUserId: "admin-1", payload: { is_active: "true" }, reason: "x" })
    ).rejects.toThrow(/is_active/);
  });

  it("audit recebe diff antes/depois com reason", async () => {
    findByKey.mockResolvedValue(baseRow);
    updateByKey.mockResolvedValue({ ...baseRow, title: "Novo", version: 4 });
    await updateHero({
      adminUserId: "admin-2",
      payload: { title: "Novo" },
      reason: "campanha-de-junho",
    });
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    const call = recordAdminAction.mock.calls[0][0];
    expect(call.adminUserId).toBe("admin-2");
    expect(call.reason).toBe("campanha-de-junho");
    expect(call.oldValue.title).toBe(baseRow.title);
    expect(call.newValue.title).toBe("Novo");
  });
});

describe("admin-home.service · uploadHeroImage", () => {
  it("rejeita quando file ausente", async () => {
    await expect(
      uploadHeroImage({ adminUserId: "admin-1", file: null, variant: "desktop" })
    ).rejects.toThrow(/Arquivo/);
  });

  it("retorna URL pública do R2 ao subir desktop", async () => {
    uploadSiteImage.mockResolvedValue({
      key: "site/home-hero/desktop/2026/05/uuid-x.webp",
      publicUrl: "https://cdn.example.com/site/home-hero/desktop/2026/05/uuid-x.webp",
      sizeBytes: 100000,
      mimeType: "image/webp",
    });
    const res = await uploadHeroImage({
      adminUserId: "admin-1",
      file: { buffer: Buffer.alloc(1), mimetype: "image/jpeg", originalname: "x.jpg", size: 1 },
      variant: "desktop",
    });
    expect(res.url).toContain("/site/home-hero/desktop/");
    expect(res.variant).toBe("desktop");
  });

  it("variant inválida cai para desktop", async () => {
    uploadSiteImage.mockResolvedValue({
      key: "site/home-hero/desktop/2026/05/uuid-x.webp",
      publicUrl: "https://cdn.example.com/site/home-hero/desktop/2026/05/uuid-x.webp",
      sizeBytes: 1,
      mimeType: "image/webp",
    });
    const res = await uploadHeroImage({
      adminUserId: "admin-1",
      file: { buffer: Buffer.alloc(1), mimetype: "image/jpeg", originalname: "x.jpg", size: 1 },
      variant: "weird",
    });
    expect(res.variant).toBe("desktop");
  });

  it("erro do r2 vira 400 quando começa com [r2]", async () => {
    uploadSiteImage.mockRejectedValue(new Error("[r2] Tipo de arquivo não permitido: image/gif."));
    await expect(
      uploadHeroImage({
        adminUserId: "admin-1",
        file: { buffer: Buffer.alloc(1), mimetype: "image/gif", originalname: "x.gif", size: 1 },
        variant: "desktop",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
