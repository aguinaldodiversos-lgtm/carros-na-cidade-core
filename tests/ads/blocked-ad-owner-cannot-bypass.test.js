/**
 * Fase 4.10A — nenhuma ação do anunciante remove o bloqueio administrativo.
 *
 * A invariante é: EDIÇÃO NÃO REATIVA. E, por extensão, nada que o dono possa
 * fazer sozinho — editar, salvar, pausar, ativar, publicar, renovar,
 * impulsionar — pode tirar um anúncio de `blocked`.
 *
 * Cada teste aqui exercita um caminho REAL que o dono tem à disposição. Não
 * basta que os caminhos estejam protegidos hoje: eles precisam continuar
 * protegidos quando alguém mexer no fluxo de publicação amanhã.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/ads/ads.repository.js", () => ({
  findOwnerContextById: vi.fn(),
  findById: vi.fn(),
  softDeleteAd: vi.fn(),
  updateAd: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdUpdatePayload: vi.fn((p) => p),
  executeAdUpdate: vi.fn(async () => ({ id: "ad-1" })),
}));

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  withUserTransaction: vi.fn(async (_u, cb) =>
    cb({ query: async () => ({ rows: [{ id: "ad-1" }] }) })
  ),
  withTransaction: vi.fn(async (cb) => cb({ query: async () => ({ rows: [] }) })),
  default: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  removeVehicleImages: vi.fn(),
}));

const adsRepository = await import("../../src/modules/ads/ads.repository.js");
const persistence = await import("../../src/modules/ads/ads.persistence.service.js");
const { updateAd } = await import("../../src/modules/ads/ads.panel.service.js");
const { updateOwnedAdStatus } = await import("../../src/modules/account/account.service.js");

const OWNER = { id: "user-1", role: "user" };

/** Anúncio bloqueado, pertencente a OWNER. */
function blockedAd() {
  return {
    id: "ad-1",
    advertiser_id: "adv-1",
    city_id: 1,
    status: "blocked",
    advertiser_user_id: "user-1",
  };
}

beforeEach(() => {
  vi.mocked(adsRepository.findOwnerContextById).mockReset();
  vi.mocked(persistence.executeAdUpdate).mockClear();
});

describe("edição não reativa", () => {
  it("editar preço de anúncio bloqueado → 409, e nada é gravado", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateAd("ad-1", { price: 49900 }, OWNER)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });

  it("editar descrição de anúncio bloqueado → 409", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateAd("ad-1", { description: "carro impecável" }, OWNER)).rejects.toMatchObject(
      { statusCode: 409 }
    );
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });

  it("trocar as fotos de anúncio bloqueado → 409", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateAd("ad-1", { images: ["https://cdn/x.jpg"] }, OWNER)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });

  it("mandar status='active' no corpo da edição → 400 antes de qualquer leitura", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateAd("ad-1", { status: "active" }, OWNER)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });

  it("mandar status junto de campos legítimos também é recusado", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateAd("ad-1", { price: 1000, status: "active" }, OWNER)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });
});

describe("publicar / pausar / ativar não reativam", () => {
  it("activate em anúncio bloqueado → 410", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateOwnedAdStatus("user-1", "ad-1", "activate")).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("pause em anúncio bloqueado → 410 (nem sequer muda de estado)", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    await expect(updateOwnedAdStatus("user-1", "ad-1", "pause")).rejects.toMatchObject({
      statusCode: 410,
    });
  });

  it("o guard é do STATUS, não da propriedade — o dono legítimo também é barrado", async () => {
    vi.mocked(adsRepository.findOwnerContextById).mockResolvedValue(blockedAd());

    // Mesmo usuário que consta como dono: a recusa vem do bloqueio, não de
    // ownership. Se um dia o guard virasse 404 por ownership, este teste
    // continuaria passando por engano — por isso a asserção é no 410.
    const err = await updateOwnedAdStatus("user-1", "ad-1", "activate").catch((e) => e);
    expect(err.statusCode).toBe(410);
    expect(String(err.message)).toMatch(/blocked/);
  });
});

describe("opções de publicação e impulsionamento", () => {
  it("anúncio bloqueado não admite ações de publicação (410)", async () => {
    vi.doMock("../../src/modules/account/account.service.js", () => ({
      getOwnedAd: vi.fn().mockResolvedValue({ id: "ad-1", status: "blocked" }),
      getAccountUser: vi.fn(),
    }));

    const { getPublicationOptions } = await import(
      "../../src/modules/ads/ads.publication-options.service.js"
    );

    await expect(getPublicationOptions({ userId: "user-1", adId: "ad-1" })).rejects.toMatchObject({
      statusCode: 410,
    });

    vi.doUnmock("../../src/modules/account/account.service.js");
  });
});

describe("a allowlist de status editáveis exclui blocked", () => {
  it("blocked não está entre os status que o dono pode editar", async () => {
    const { AD_STATUS_OWNER_EDITABLE } = await import("../../src/modules/ads/ad-ownership.js");
    expect(AD_STATUS_OWNER_EDITABLE).not.toContain("blocked");
  });

  it("blocked não está entre os status publicamente visíveis", async () => {
    const { AD_STATUS_PUBLIC } = await import("../../src/shared/constants/status.js");
    expect(AD_STATUS_PUBLIC).toEqual(["active"]);
  });

  it("blocked não está entre os status que aceitam destaque pago", async () => {
    const { AD_STATUS_CAN_RECEIVE_BOOST } = await import("../../src/shared/constants/status.js");
    expect(AD_STATUS_CAN_RECEIVE_BOOST).not.toContain("blocked");
  });

  it("blocked não está entre os status operáveis pelo dono", async () => {
    const { AD_STATUS_OWNER_OPERABLE } = await import("../../src/shared/constants/status.js");
    expect(AD_STATUS_OWNER_OPERABLE).not.toContain("blocked");
  });
});
