import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Saneamento do PUT /api/ads/:id (`adsPanelService.updateAd`):
 *   1. dono diferente → AppError 403/404
 *   2. payload com `status` → 400 (status é gerenciado por
 *      account.service.updateOwnedAdStatus, não por este endpoint).
 *   3. payload com `advertiser_id` → 400 (não é editável pelo dono).
 */

vi.mock("../../src/modules/ads/ads.repository.js", () => ({
  findOwnerContextById: vi.fn(),
  findById: vi.fn(),
  softDeleteAd: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdUpdatePayload: vi.fn((p) => p),
  executeAdUpdate: vi.fn(async () => ({ id: "ad-1" })),
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
const { updateAd } = await import("../../src/modules/ads/ads.panel.service.js");

beforeEach(() => {
  adsRepository.findOwnerContextById.mockReset();
});

describe("adsPanelService.updateAd — guard de owner + status", () => {
  it("rejeita usuário diferente do dono (403)", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_id: "adv-1",
      city_id: 1,
      status: "active",
      advertiser_user_id: "owner-id",
    });

    let err;
    await updateAd("ad-1", { title: "Foo" }, { id: "outro-user" }).catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(403);
  });

  it("rejeita payload com `status` (precisa usar PATCH /api/account/ads/:id/status)", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "owner-id",
    });

    let err;
    await updateAd("ad-1", { status: "paused" }, { id: "owner-id" }).catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(String(err.message)).toMatch(/status/i);
  });

  it("rejeita payload com `advertiser_id` (proíbe troca de dono)", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      advertiser_user_id: "owner-id",
    });

    let err;
    await updateAd("ad-1", { advertiser_id: "adv-X" }, { id: "owner-id" }).catch(
      (e) => (err = e)
    );
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
  });
});
