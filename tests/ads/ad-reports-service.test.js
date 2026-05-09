import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AD_REPORTS_RATE_LIMIT,
  AD_REPORT_REASONS,
} from "../../src/modules/ads/reports/ad-reports.constants.js";

const insertReportMock = vi.fn();
const adExistsForReportMock = vi.fn();
const countRecentByIpHashMock = vi.fn();
const countRecentByIpHashAndAdMock = vi.fn();

vi.mock("../../src/modules/ads/reports/ad-reports.repository.js", () => ({
  insertReport: (...args) => insertReportMock(...args),
  adExistsForReport: (...args) => adExistsForReportMock(...args),
  countRecentByIpHash: (...args) => countRecentByIpHashMock(...args),
  countRecentByIpHashAndAd: (...args) => countRecentByIpHashAndAdMock(...args),
}));

beforeEach(async () => {
  insertReportMock.mockReset();
  adExistsForReportMock.mockReset();
  countRecentByIpHashMock.mockReset();
  countRecentByIpHashAndAdMock.mockReset();
  adExistsForReportMock.mockResolvedValue(true);
  countRecentByIpHashMock.mockResolvedValue(0);
  countRecentByIpHashAndAdMock.mockResolvedValue(0);
  insertReportMock.mockResolvedValue({
    id: 1,
    ad_id: 42,
    reason: "suspicious_price",
    status: "new",
    created_at: "2026-05-09T00:00:00Z",
  });
});

afterEach(() => {
  vi.resetModules();
});

async function importService() {
  return await import("../../src/modules/ads/reports/ad-reports.service.js");
}

describe("ad-reports.service.createReport — validação", () => {
  it("rejeita adId não numérico", async () => {
    const { createReport } = await importService();
    await expect(
      createReport({
        adId: "abc",
        reason: "suspicious_price",
        reporterIp: "1.2.3.4",
      })
    ).rejects.toThrow(/inv[áa]lido/i);
  });

  it("rejeita reason ausente", async () => {
    const { createReport } = await importService();
    await expect(
      createReport({ adId: 42, reason: "", reporterIp: "1.2.3.4" })
    ).rejects.toThrow(/Motivo/i);
  });

  it("rejeita reason fora da whitelist", async () => {
    const { createReport } = await importService();
    await expect(
      createReport({ adId: 42, reason: "invented_reason", reporterIp: "1.2.3.4" })
    ).rejects.toThrow(/Motivo/i);
  });

  it("aceita TODOS os 6 motivos canônicos", async () => {
    const { createReport } = await importService();
    for (const reason of AD_REPORT_REASONS) {
      await expect(
        createReport({ adId: 42, reason, reporterIp: "1.2.3.4" })
      ).resolves.toBeTruthy();
    }
    expect(insertReportMock).toHaveBeenCalledTimes(AD_REPORT_REASONS.length);
  });

  it("retorna 404 quando o anúncio não existe", async () => {
    adExistsForReportMock.mockResolvedValue(false);
    const { createReport } = await importService();
    await expect(
      createReport({ adId: 999, reason: "other", reporterIp: "1.2.3.4" })
    ).rejects.toThrow(/n[ãa]o encontrado/i);
  });
});

describe("ad-reports.service.createReport — rate limit", () => {
  it("bloqueia quando IP já fez MAX_PER_AD_PER_IP denúncias no mesmo anúncio", async () => {
    countRecentByIpHashAndAdMock.mockResolvedValue(
      AD_REPORTS_RATE_LIMIT.MAX_PER_AD_PER_IP
    );
    const { createReport } = await importService();
    await expect(
      createReport({ adId: 42, reason: "suspicious_price", reporterIp: "1.2.3.4" })
    ).rejects.toThrow(/j[áa] denunciou este an[úu]ncio/i);
  });

  it("bloqueia quando IP já atingiu MAX_PER_IP global", async () => {
    countRecentByIpHashAndAdMock.mockResolvedValue(0);
    countRecentByIpHashMock.mockResolvedValue(AD_REPORTS_RATE_LIMIT.MAX_PER_IP);
    const { createReport } = await importService();
    await expect(
      createReport({ adId: 42, reason: "suspicious_price", reporterIp: "1.2.3.4" })
    ).rejects.toThrow(/Limite de den[úu]ncias/i);
  });

  it("ignora rate limit se não conseguir hashear IP (ex.: testes internos)", async () => {
    const { createReport } = await importService();
    const result = await createReport({
      adId: 42,
      reason: "other",
      reporterIp: "",
    });
    expect(result).toBeTruthy();
    expect(countRecentByIpHashMock).not.toHaveBeenCalled();
  });
});

describe("ad-reports.service.createReport — persistência", () => {
  it("trunca descrição em 1000 chars", async () => {
    const longDesc = "a".repeat(2000);
    const { createReport } = await importService();
    await createReport({
      adId: 42,
      reason: "other",
      description: longDesc,
      reporterIp: "1.2.3.4",
    });
    const persisted = insertReportMock.mock.calls[0][0];
    expect(persisted.description?.length).toBeLessThanOrEqual(1000);
    expect(persisted.description?.length).toBe(1000);
  });

  it("trim na descrição vazia → null", async () => {
    const { createReport } = await importService();
    await createReport({
      adId: 42,
      reason: "other",
      description: "   ",
      reporterIp: "1.2.3.4",
    });
    expect(insertReportMock.mock.calls[0][0].description).toBeNull();
  });

  it("hasheia IP com sha256 (64 hex chars)", async () => {
    const { createReport, hashIp } = await importService();
    const hash = hashIp("203.0.113.5");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    await createReport({
      adId: 42,
      reason: "other",
      reporterIp: "203.0.113.5",
    });
    expect(insertReportMock.mock.calls[0][0].reporter_ip_hash).toBe(hash);
  });

  it("não persiste IP cru — só o hash", async () => {
    const { createReport } = await importService();
    await createReport({
      adId: 42,
      reason: "other",
      reporterIp: "203.0.113.5",
    });
    const persisted = insertReportMock.mock.calls[0][0];
    expect(JSON.stringify(persisted)).not.toContain("203.0.113.5");
  });

  it("aceita reporter_user_id quando logado", async () => {
    const { createReport } = await importService();
    await createReport({
      adId: 42,
      reason: "scam_or_advance_pay",
      reporterUserId: 99,
      reporterIp: "1.2.3.4",
    });
    expect(insertReportMock.mock.calls[0][0].reporter_user_id).toBe("99");
  });

  it("reporter_user_id null quando anônimo", async () => {
    const { createReport } = await importService();
    await createReport({
      adId: 42,
      reason: "other",
      reporterIp: "1.2.3.4",
    });
    expect(insertReportMock.mock.calls[0][0].reporter_user_id).toBeNull();
  });
});
