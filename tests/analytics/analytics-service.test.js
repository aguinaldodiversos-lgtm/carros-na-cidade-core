import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocka o repositório → testa o serviço (validação/anonimização/composição)
// sem banco.
vi.mock("../../src/modules/analytics/analytics.repository.js", () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
  getTotals: vi.fn(),
  getTimeseries: vi.fn(),
  getTopCities: vi.fn(),
  getTopRegions: vi.fn(),
  getTopPages: vi.fn(),
  getTopAds: vi.fn(),
  getTopBlogPosts: vi.fn(),
  getTrafficSources: vi.fn(),
  getCommercialEvents: vi.fn(),
  getLowContactAds: vi.fn(),
  getAdMetrics: vi.fn(),
  getPostMetrics: vi.fn(),
}));

import * as repo from "../../src/modules/analytics/analytics.repository.js";
import {
  recordEvent,
  getOverview,
  getAdMetrics,
  parsePeriodDays,
} from "../../src/modules/analytics/analytics.service.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("analytics.service · recordEvent", () => {
  it("grava evento válido, derivando device/hash do User-Agent", async () => {
    await recordEvent({
      body: { event_type: "whatsapp_click", ad_id: "7", city_slug: "atibaia-sp", session_id: "s1" },
      userAgent: "Mozilla/5.0 (iPhone) Mobile",
    });
    expect(repo.insertEvent).toHaveBeenCalledOnce();
    const row = repo.insertEvent.mock.calls[0][0];
    expect(row.event_type).toBe("whatsapp_click");
    expect(row.ad_id).toBe(7);
    expect(row.device_type).toBe("mobile"); // derivado do UA
    expect(typeof row.user_agent_hash).toBe("string");
    expect(row.user_agent_hash).not.toContain("Mozilla");
  });

  it("rejeita event_type inválido (400) e não grava", async () => {
    await expect(recordEvent({ body: { event_type: "x" }, userAgent: "ua" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });

  it("rejeita payload gigante (413) e não grava", async () => {
    const body = { event_type: "page_view", path: "x".repeat(5000) };
    await expect(recordEvent({ body, userAgent: "ua" })).rejects.toMatchObject({ statusCode: 413 });
    expect(repo.insertEvent).not.toHaveBeenCalled();
  });
});

describe("analytics.service · getOverview", () => {
  it("compõe o overview a partir do repositório (rankings + soma comercial)", async () => {
    repo.getTotals.mockResolvedValue({ visitors30d: 100, views30d: 500 });
    repo.getTimeseries.mockResolvedValue([{ day: "2026-06-15", views: 10, visitors: 5 }]);
    repo.getTopCities.mockResolvedValue([
      { city_slug: "sao-paulo-sp", views: 300, unique_sessions: 80 },
    ]);
    repo.getTopRegions.mockResolvedValue([]);
    repo.getTopPages.mockResolvedValue([{ path: "/comprar", views: 200, unique_sessions: 60 }]);
    repo.getTopAds.mockResolvedValue([{ ad_id: 7, views: 50, whatsapp_clicks: 3 }]);
    repo.getTopBlogPosts.mockResolvedValue([]);
    repo.getTrafficSources.mockResolvedValue({ referrers: [], campaigns: [] });
    repo.getCommercialEvents.mockResolvedValue({
      whatsapp_click: 12,
      phone_click: 4,
      finance_click: 2,
      search_performed: 9,
    });
    repo.getLowContactAds.mockResolvedValue([{ ad_id: 7, views: 50, contacts: 1 }]);

    const out = await getOverview({ period: "30d" });

    expect(out.period).toBe("30d");
    expect(out.totals.views30d).toBe(500);
    expect(out.topCities[0].city_slug).toBe("sao-paulo-sp");
    expect(out.topPages[0].path).toBe("/comprar");
    expect(out.commercialEvents.whatsapp_click).toBe(12);
    expect(out.lowContactAds[0].ad_id).toBe(7);
    // período → dias é repassado ao repositório
    expect(repo.getTopCities).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }));
  });
});

describe("analytics.service · parsePeriodDays / getAdMetrics", () => {
  it("mapeia period para dias (default 30)", () => {
    expect(parsePeriodDays("7d")).toBe(7);
    expect(parsePeriodDays("90d")).toBe(90);
    expect(parsePeriodDays("xx")).toBe(30);
    expect(parsePeriodDays(undefined)).toBe(30);
  });

  it("getAdMetrics rejeita id inválido", async () => {
    await expect(getAdMetrics("abc")).rejects.toMatchObject({ statusCode: 400 });
    await expect(getAdMetrics("0")).rejects.toMatchObject({ statusCode: 400 });
  });
});
