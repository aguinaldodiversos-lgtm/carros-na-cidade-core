import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guard de STATUS na edição de conteúdo (PUT /api/ads/:id →
 * adsPanelService.updateAd → ad-ownership.assertCanEditAd).
 *
 * Complementa ad-panel-status-guard.test.js (ownership + payload) e
 * ads-structural-fields-locked.test.js (campos estruturais). Aqui o foco é:
 * o dono PODE editar campos simples (preço) em active/paused, e NÃO pode em
 * sold/archived/blocked/expired.
 */
vi.mock("../../src/modules/ads/ads.repository.js", () => ({
  findOwnerContextById: vi.fn(),
  findById: vi.fn(),
  softDeleteAd: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdUpdatePayload: vi.fn((p) => p),
  executeAdUpdate: vi.fn(async () => ({ id: "ad-1", price: 50000 })),
}));

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  pool: { query: vi.fn() },
  default: { query: vi.fn() },
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  removeVehicleImages: vi.fn(),
}));

const adsRepository = await import("../../src/modules/ads/ads.repository.js");
const persistence = await import("../../src/modules/ads/ads.persistence.service.js");
const { updateAd } = await import("../../src/modules/ads/ads.panel.service.js");

const OWNER = { id: "owner-id", role: "user" };

beforeEach(() => {
  adsRepository.findOwnerContextById.mockReset();
  persistence.executeAdUpdate.mockClear();
});

describe("updateAd — guard de status editável", () => {
  it.each(["active", "paused", "pending_review", "rejected", "draft"])(
    "dono edita preço em status editável '%s' → executa update",
    async (status) => {
      adsRepository.findOwnerContextById.mockResolvedValue({
        id: "ad-1",
        advertiser_user_id: "owner-id",
        status,
      });

      const result = await updateAd("ad-1", { price: 50000 }, OWNER);
      expect(result).toBeTruthy();
      expect(persistence.executeAdUpdate).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["sold", "archived", "blocked", "expired"])(
    "dono NÃO pode editar em status '%s' → 409 e não executa update",
    async (status) => {
      adsRepository.findOwnerContextById.mockResolvedValue({
        id: "ad-1",
        advertiser_user_id: "owner-id",
        status,
      });

      let err;
      await updateAd("ad-1", { price: 50000 }, OWNER).catch((e) => (err = e));

      expect(err).toBeTruthy();
      expect(err.statusCode).toBe(409);
      expect(err.details?.code).toBe("AD_STATUS_NOT_EDITABLE");
      expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
    }
  );

  it("admin edita anúncio de terceiro em qualquer status (bypass)", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "outro-user",
      status: "blocked",
    });

    const result = await updateAd("ad-1", { price: 50000 }, { id: "admin-1", role: "admin" });
    expect(result).toBeTruthy();
    expect(persistence.executeAdUpdate).toHaveBeenCalledTimes(1);
  });

  it("lojista/CNPJ dono edita preço em active → executa update", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "loja-1",
      status: "active",
    });

    const result = await updateAd(
      "ad-1",
      { price: 79900 },
      { id: "loja-1", role: "user", account_type: "CNPJ" }
    );
    expect(result).toBeTruthy();
    expect(persistence.executeAdUpdate).toHaveBeenCalledTimes(1);
  });

  it("vehicle_options é editável em active (não é campo estrutural)", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "owner-id",
      status: "active",
    });

    const result = await updateAd(
      "ad-1",
      { vehicle_options: { comfort: ["ar_condicionado"] } },
      OWNER
    );
    expect(result).toBeTruthy();
    expect(persistence.executeAdUpdate).toHaveBeenCalledTimes(1);
  });

  it("dono em sold NÃO pode editar vehicle_options → 409", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "owner-id",
      status: "sold",
    });

    let err;
    await updateAd("ad-1", { vehicle_options: { safety: ["freios_abs"] } }, OWNER).catch(
      (e) => (err = e)
    );
    expect(err?.statusCode).toBe(409);
    expect(persistence.executeAdUpdate).not.toHaveBeenCalled();
  });
});
