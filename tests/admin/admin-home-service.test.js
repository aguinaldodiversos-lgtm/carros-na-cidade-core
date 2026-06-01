import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/home/admin-home.repository.js", () => ({
  listBySectionType: vi.fn(),
  findByPosition: vi.fn(),
  updateByPosition: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  uploadSiteImage: vi.fn(),
}));

import {
  listBySectionType,
  findByPosition,
  updateByPosition,
} from "../../src/modules/admin/home/admin-home.repository.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { uploadSiteImage } from "../../src/infrastructure/storage/r2.service.js";
import {
  listHeroBanners,
  listPublicHeroBanners,
  getHeroBanner,
  updateHeroBanner,
  uploadHeroImage,
} from "../../src/modules/admin/home/admin-home.service.js";

function makeBanner(position, overrides = {}) {
  return {
    id: position,
    key: `home_hero_${position}`,
    section_type: "home_hero",
    position,
    title: `Banner ${position}`,
    subtitle: null,
    cta_label: "Ver",
    cta_url: "/comprar",
    image_desktop_url: `https://cdn.example.com/site/home-hero/${position}/desktop/old.webp`,
    image_mobile_url: null,
    image_alt: "Alt",
    is_active: position === 1,
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

describe("admin-home.service · listHeroBanners (admin)", () => {
  it("retorna os 3 banners inclusive inativos", async () => {
    listBySectionType.mockResolvedValue([
      makeBanner(1),
      makeBanner(2, { is_active: false }),
      makeBanner(3, { is_active: false }),
    ]);
    const banners = await listHeroBanners();
    expect(banners).toHaveLength(3);
    expect(banners.map((b) => b.position)).toEqual([1, 2, 3]);
    expect(banners.map((b) => b.is_active)).toEqual([true, false, false]);
    expect(listBySectionType).toHaveBeenCalledWith("home_hero", { includeInactive: true });
  });
});

describe("admin-home.service · listPublicHeroBanners (público)", () => {
  it("inclui apenas ativos (delegação ao repo)", async () => {
    listBySectionType.mockResolvedValue([makeBanner(1), makeBanner(2, { is_active: true })]);
    const banners = await listPublicHeroBanners();
    expect(listBySectionType).toHaveBeenCalledWith("home_hero", { includeInactive: false });
    expect(banners.map((b) => b.position)).toEqual([1, 2]);
  });

  it("retorna [] quando nada ativo", async () => {
    listBySectionType.mockResolvedValue([]);
    expect(await listPublicHeroBanners()).toEqual([]);
  });
});

describe("admin-home.service · getHeroBanner(position)", () => {
  it("position fora de 1..3 → 400", async () => {
    await expect(getHeroBanner(4)).rejects.toMatchObject({ statusCode: 400 });
    await expect(getHeroBanner(0)).rejects.toMatchObject({ statusCode: 400 });
    await expect(getHeroBanner("foo")).rejects.toMatchObject({ statusCode: 400 });
  });

  it("retorna o banner solicitado", async () => {
    findByPosition.mockResolvedValue(makeBanner(2));
    const data = await getHeroBanner(2);
    expect(data.position).toBe(2);
    expect(findByPosition).toHaveBeenCalledWith("home_hero", 2);
  });
});

describe("admin-home.service · updateHeroBanner — validações", () => {
  it("exige reason", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { title: "Novo" },
        reason: "",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Motivo/) });
  });

  it("position inválido → 400", async () => {
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 9,
        payload: { title: "X" },
        reason: "r",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,",
    "file:///etc/passwd",
    "//example.com",
  ])("rejeita cta_url=%s", async (badUrl) => {
    findByPosition.mockResolvedValue(makeBanner(1));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { cta_url: badUrl },
        reason: "x",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/cta_url/) });
  });

  it("aceita cta_url interno e externo https", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    updateByPosition.mockResolvedValueOnce(makeBanner(1, { cta_url: "/outro" }));
    await updateHeroBanner({
      adminUserId: "admin-1",
      position: 1,
      payload: { cta_url: "/outro" },
      reason: "r",
    });
    updateByPosition.mockResolvedValueOnce(
      makeBanner(1, { cta_url: "https://exemplo.com/campanha" })
    );
    await updateHeroBanner({
      adminUserId: "admin-1",
      position: 1,
      payload: { cta_url: "https://exemplo.com/campanha" },
      reason: "r",
    });
  });

  it("rejeita image_*_url com scheme proibido", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { image_desktop_url: "file:///x" },
        reason: "r",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("exige image_alt quando há imagem desktop", async () => {
    findByPosition.mockResolvedValue(makeBanner(1, { image_alt: "ok", image_desktop_url: "https://x" }));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { image_alt: "" },
        reason: "r",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/image_alt/) });
  });

  it("bloqueia ativar banner sem qualquer conteúdo", async () => {
    findByPosition.mockResolvedValue(
      makeBanner(2, {
        is_active: false,
        title: null,
        image_desktop_url: null,
        image_mobile_url: null,
      })
    );
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 2,
        payload: { is_active: true },
        reason: "r",
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/título ou uma imagem/i),
    });
  });

  it("rejeita payload sem campos válidos", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { foo: "bar" },
        reason: "r",
      })
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/Nenhum campo/) });
  });

  it("is_active deve ser boolean", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    await expect(
      updateHeroBanner({
        adminUserId: "admin-1",
        position: 1,
        payload: { is_active: "true" },
        reason: "r",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("admin-home.service · updateHeroBanner — isolamento + audit", () => {
  it("audit recebe target_id correto (home_hero_<position>)", async () => {
    findByPosition.mockResolvedValue(makeBanner(2, { title: "antigo" }));
    updateByPosition.mockResolvedValue(makeBanner(2, { title: "novo", version: 2 }));
    await updateHeroBanner({
      adminUserId: "admin-9",
      position: 2,
      payload: { title: "novo" },
      reason: "campanha-junho",
    });
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    const call = recordAdminAction.mock.calls[0][0];
    expect(call.action).toBe("update_home_hero_banner");
    expect(call.targetType).toBe("home_content");
    expect(call.targetId).toBe("home_hero_2");
    expect(call.adminUserId).toBe("admin-9");
    expect(call.reason).toBe("campanha-junho");
    expect(call.oldValue.title).toBe("antigo");
    expect(call.newValue.title).toBe("novo");
  });

  it("repository.updateByPosition é chamado com a position correta e com apenas os campos do patch", async () => {
    findByPosition.mockResolvedValue(makeBanner(1));
    updateByPosition.mockResolvedValue(makeBanner(1, { title: "novo" }));
    await updateHeroBanner({
      adminUserId: "admin-1",
      position: 1,
      payload: { title: "novo" },
      reason: "r",
    });
    expect(updateByPosition).toHaveBeenCalledWith(
      "home_hero",
      1,
      expect.objectContaining({ title: "novo" }),
      "admin-1"
    );
    // Não deve ter mandado outros campos pro repo (apenas o do patch).
    const fields = updateByPosition.mock.calls[0][2];
    expect(Object.keys(fields).sort()).toEqual(["title"]);
  });

  it("PATCH em banner X não toca repo do banner Y (chamadas distintas)", async () => {
    findByPosition.mockImplementation((_, pos) => Promise.resolve(makeBanner(pos)));
    updateByPosition.mockImplementation((_, pos, fields) =>
      Promise.resolve(makeBanner(pos, fields))
    );
    await updateHeroBanner({
      adminUserId: "admin-1",
      position: 1,
      payload: { title: "B1-novo" },
      reason: "r1",
    });
    await updateHeroBanner({
      adminUserId: "admin-1",
      position: 3,
      payload: { title: "B3-novo", image_desktop_url: "https://x", image_alt: "alt" },
      reason: "r3",
    });
    const positionsTouched = updateByPosition.mock.calls.map((c) => c[1]);
    expect(positionsTouched).toEqual([1, 3]);
    const targets = recordAdminAction.mock.calls.map((c) => c[0].targetId);
    expect(targets).toEqual(["home_hero_1", "home_hero_3"]);
  });
});

describe("admin-home.service · uploadHeroImage", () => {
  it("file ausente → 400", async () => {
    await expect(
      uploadHeroImage({ adminUserId: "admin-1", position: 1, file: null, variant: "desktop" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("position inválido → 400", async () => {
    await expect(
      uploadHeroImage({ adminUserId: "admin-1", position: 9, file: {}, variant: "desktop" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("section incorpora a position", async () => {
    uploadSiteImage.mockResolvedValue({
      key: "site/home-hero/2/desktop/2026/05/uuid-x.webp",
      publicUrl: "https://cdn.example.com/site/home-hero/2/desktop/2026/05/uuid-x.webp",
      sizeBytes: 1,
      mimeType: "image/webp",
    });
    const res = await uploadHeroImage({
      adminUserId: "admin-1",
      position: 2,
      file: { buffer: Buffer.alloc(1), mimetype: "image/jpeg", originalname: "x.jpg", size: 1 },
      variant: "mobile",
    });
    expect(uploadSiteImage).toHaveBeenCalledWith(
      expect.objectContaining({ section: "home-hero/2", variant: "mobile" })
    );
    expect(res.url).toContain("/site/home-hero/2/");
    expect(res.position).toBe(2);
    expect(res.variant).toBe("mobile");
  });

  it("erro do r2 vira 400 quando começa com [r2]", async () => {
    uploadSiteImage.mockRejectedValue(new Error("[r2] Tipo de arquivo não permitido: image/gif."));
    await expect(
      uploadHeroImage({
        adminUserId: "admin-1",
        position: 1,
        file: { buffer: Buffer.alloc(1), mimetype: "image/gif", originalname: "x.gif", size: 1 },
        variant: "desktop",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
