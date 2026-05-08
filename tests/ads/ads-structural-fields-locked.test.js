import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/ads/ads.repository.js", () => ({
  findOwnerContextById: vi.fn(),
  findById: vi.fn(),
  softDeleteAd: vi.fn(),
}));

vi.mock("../../src/modules/ads/ads.persistence.service.js", () => ({
  prepareAdUpdatePayload: vi.fn((p) => p),
  executeAdUpdate: vi.fn(async () => ({ id: "ad-1" })),
}));

vi.mock("../../src/modules/ads/risk/ad-risk.repository.js", () => ({
  recordModerationEvent: vi.fn(),
  persistAdRiskSnapshot: vi.fn(),
  persistAdRiskSignals: vi.fn(),
  countDistinctOwnersForPhone: vi.fn(async () => 0),
  fetchModerationDetail: vi.fn(),
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
const riskRepo = await import(
  "../../src/modules/ads/risk/ad-risk.repository.js"
);
const { updateAd } = await import("../../src/modules/ads/ads.panel.service.js");

beforeEach(() => {
  adsRepository.findOwnerContextById.mockReset();
  riskRepo.recordModerationEvent.mockReset();
});

describe("Tarefa 11 — campos estruturais bloqueados após publicação", () => {
  it("PUT que tenta alterar `brand` em ad ACTIVE retorna 400 e registra evento", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      status: "active",
      advertiser_user_id: "owner-id",
    });

    let err;
    await updateAd("ad-1", { brand: "Toyota" }, { id: "owner-id" }).catch(
      (e) => (err = e)
    );

    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(String(err.message)).toMatch(/marca|modelo|ano|cidade/i);

    // Auditoria gravada antes do throw
    expect(riskRepo.recordModerationEvent).toHaveBeenCalledTimes(1);
    const eventArg = riskRepo.recordModerationEvent.mock.calls[0][0];
    expect(eventArg.eventType).toBe("structural_field_change_detected");
    expect(eventArg.metadata.fields).toContain("brand");
  });

  it("PUT que tenta alterar `city_id` em ad PENDING_REVIEW retorna 400", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      status: "pending_review",
      advertiser_user_id: "owner-id",
    });

    let err;
    await updateAd("ad-1", { city_id: 99 }, { id: "owner-id" }).catch(
      (e) => (err = e)
    );

    expect(err.statusCode).toBe(400);
  });

  it("PUT alterando apenas `price` (campo editável) NÃO é bloqueado", async () => {
    adsRepository.findOwnerContextById.mockResolvedValue({
      id: "ad-1",
      status: "active",
      advertiser_user_id: "owner-id",
    });

    // Não deve lançar erro de campos estruturais — chega ao update real.
    const result = await updateAd("ad-1", { price: 50000 }, { id: "owner-id" });
    expect(result).toBeTruthy();
    expect(riskRepo.recordModerationEvent).not.toHaveBeenCalled();
  });
});
