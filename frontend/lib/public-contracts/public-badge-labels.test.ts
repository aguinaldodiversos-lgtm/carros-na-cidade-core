// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PUBLIC_BADGE_IDS_ALLOWED,
  PUBLIC_BADGE_LABELS,
  isPublicBadge,
  resolvePublicAdBadges,
} from "./public-badge-labels";

describe("PUBLIC_BADGE_LABELS — briefing P2 2026-05-25", () => {
  // Labels em CAPS para bater o canônico `resolvePublicAdBadges` (que já
  // está em produção no AdCard). Briefing P2 veta mudança visual.
  it.each([
    ["destaque", "DESTAQUE"],
    ["opportunity", "OPORTUNIDADE"],
    ["below_fipe", "ABAIXO DA FIPE"],
    ["loja", "LOJA"],
    ["particular", "PARTICULAR"],
    ["reviewed", "ANÚNCIO ANALISADO"],
  ] as const)("'%s' → '%s'", (id, expected) => {
    expect(PUBLIC_BADGE_LABELS[id]).toBe(expected);
  });

  it("pro/start admin-only — label NÃO é 'Lojista Pro'/'Lojista Start' na vitrine", () => {
    expect(PUBLIC_BADGE_LABELS.pro).toContain("[admin]");
    expect(PUBLIC_BADGE_LABELS.start).toContain("[admin]");
  });

  it("isPublicBadge: aceita os 6 IDs públicos, rejeita pro/start", () => {
    expect(isPublicBadge("destaque")).toBe(true);
    expect(isPublicBadge("opportunity")).toBe(true);
    expect(isPublicBadge("below_fipe")).toBe(true);
    expect(isPublicBadge("loja")).toBe(true);
    expect(isPublicBadge("particular")).toBe(true);
    expect(isPublicBadge("reviewed")).toBe(true);
    expect(isPublicBadge("pro")).toBe(false);
    expect(isPublicBadge("start")).toBe(false);
  });

  it("PUBLIC_BADGE_IDS_ALLOWED contém exatamente os 6 IDs públicos", () => {
    expect(PUBLIC_BADGE_IDS_ALLOWED.size).toBe(6);
  });
});

describe("resolvePublicAdBadges re-exportado (fonte canônica em ad-badges)", () => {
  it("destaque ativo → emite badge 'destaque' com label 'DESTAQUE'", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const badges = resolvePublicAdBadges({ priority_tier: 4, highlight_until: future });
    expect(badges.some((b) => b.id === "destaque" && b.label === "DESTAQUE")).toBe(true);
  });

  it("opportunity true → emite badge 'opportunity' com label 'OPORTUNIDADE'", () => {
    const badges = resolvePublicAdBadges({ opportunity: true });
    expect(badges.some((b) => b.id === "opportunity" && b.label === "OPORTUNIDADE")).toBe(true);
  });

  it("NUNCA emite badge 'pro'/'start' em vitrine (admin-only)", () => {
    const badges = resolvePublicAdBadges({ priority_tier: 3, dealership_id: 1, plan: "premium" });
    expect(badges.find((b) => b.id === "pro")).toBeUndefined();
    expect(badges.find((b) => b.id === "start")).toBeUndefined();
  });
});
