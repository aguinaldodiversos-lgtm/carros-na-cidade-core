// @vitest-environment node
import { describe, expect, it } from "vitest";

import { normalizePublicAd, normalizePublicAdList } from "./normalize-public-ad";

describe("normalizePublicAd — briefing P2 2026-05-25", () => {
  const baseValid = {
    id: 42,
    slug: "honda-civic-2020-campinas-sp",
    title: "Honda Civic 2020",
    brand: "Honda",
    model: "Civic",
    price: 89900,
    city: "Campinas",
    state: "SP",
  };

  describe("contrato completo", () => {
    it("ad válido sai com todos os campos populados", () => {
      const out = normalizePublicAd(baseValid);
      expect(out).not.toBeNull();
      expect(out!.id).toBe(42);
      expect(out!.slug).toBe("honda-civic-2020-campinas-sp");
      expect(out!.title).toBe("Honda Civic 2020");
      expect(out!.brand).toBe("Honda");
      expect(out!.price).toBe(89900);
      expect(out!.city).toBe("Campinas");
      expect(out!.state).toBe("SP");
    });

    it("title composto de brand+model quando title omisso", () => {
      const out = normalizePublicAd({ ...baseValid, title: undefined });
      expect(out!.title).toBe("Honda Civic");
    });

    it("state lowercase normaliza para UPPER", () => {
      const out = normalizePublicAd({ ...baseValid, state: "sp" });
      expect(out!.state).toBe("SP");
    });

    it("badges populados a partir dos sinais do backend", () => {
      const out = normalizePublicAd({
        ...baseValid,
        priority_tier: 4,
        highlight_until: "2026-12-01T00:00:00Z",
        below_fipe: true,
        opportunity: true,
        seller_kind: "dealer",
        reviewed_after_below_fipe: true,
      });
      expect(out!.badges.priorityTier).toBe(4);
      expect(out!.badges.belowFipe).toBe(true);
      expect(out!.badges.opportunity).toBe(true);
      expect(out!.badges.sellerKind).toBe("dealer");
      expect(out!.badges.reviewedAfterBelowFipe).toBe(true);
    });
  });

  describe("rejeita ads inutilizáveis (default requirePrice + requireHref)", () => {
    it("price=0 → null (sem 'R$ 0' no card)", () => {
      expect(normalizePublicAd({ ...baseValid, price: 0 })).toBeNull();
    });

    it("price=null → null", () => {
      expect(normalizePublicAd({ ...baseValid, price: null })).toBeNull();
    });

    it("price negativo → null", () => {
      expect(normalizePublicAd({ ...baseValid, price: -100 })).toBeNull();
    });

    it("slug vazio E id ausente → null (sem href possível)", () => {
      expect(normalizePublicAd({ ...baseValid, slug: "", id: null })).toBeNull();
    });

    it("slug vazio mas id válido → mantém (caller usa id no href)", () => {
      const out = normalizePublicAd({ ...baseValid, slug: "" });
      expect(out).not.toBeNull();
      expect(out!.slug).toBeNull();
      expect(out!.id).toBe(42);
    });
  });

  describe("defesa contra dirty data que escapa do backend", () => {
    it("title com 'TEST Test' → null", () => {
      expect(normalizePublicAd({ ...baseValid, title: "TEST Test Vehicle" })).toBeNull();
    });

    it("model com 'DeployModel' → null", () => {
      expect(normalizePublicAd({ ...baseValid, model: "DeployModel" })).toBeNull();
    });

    it("slug com 'fake-' → null", () => {
      expect(normalizePublicAd({ ...baseValid, slug: "fake-ad-123" })).toBeNull();
    });
  });

  describe("NUNCA defaulta cidade/estado para 'São Paulo'/'SP'", () => {
    it("city/state ausentes → null (não inventa)", () => {
      const out = normalizePublicAd({ ...baseValid, city: null, state: null });
      expect(out!.city).toBeNull();
      expect(out!.state).toBeNull();
    });
  });

  describe("opções", () => {
    it("requirePrice=false aceita ad sem preço", () => {
      const out = normalizePublicAd({ ...baseValid, price: 0 }, { requirePrice: false });
      expect(out).not.toBeNull();
      expect(out!.price).toBeNull();
    });
  });
});

describe("normalizePublicAdList — briefing P2 2026-05-25", () => {
  it("filtra ads sem preço/href e mantém ordem dos válidos", () => {
    const raws = [
      { id: 1, slug: "ad-1", title: "A", price: 100, city: "X", state: "SP" },
      { id: 2, slug: "ad-2", title: "B", price: 0, city: "X", state: "SP" }, // drop
      { id: 3, slug: "ad-3", title: "C", price: 200, city: "X", state: "SP" },
      { id: null, slug: "", title: "D", price: 300, city: "X", state: "SP" }, // drop
    ];
    const out = normalizePublicAdList(raws);
    expect(out.length).toBe(2);
    expect(out[0].id).toBe(1);
    expect(out[1].id).toBe(3);
  });
});
