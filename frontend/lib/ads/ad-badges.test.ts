import { describe, expect, it } from "vitest";
import {
  type AdBadgeSignals,
  inferAdTier,
  resolveAdBadges,
} from "./ad-badges";

const future = new Date(Date.now() + 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();

function ad(partial: Partial<AdBadgeSignals> = {}): AdBadgeSignals {
  return partial;
}

describe("inferAdTier — preferência ao canônico", () => {
  it("priority_tier=4 retorna 4 (mesmo sem highlight_until)", () => {
    expect(inferAdTier(ad({ priority_tier: 4 }))).toBe(4);
  });

  it("priority_tier=3 retorna 3", () => {
    expect(inferAdTier(ad({ priority_tier: 3 }))).toBe(3);
  });

  it("priority_tier=2 retorna 2", () => {
    expect(inferAdTier(ad({ priority_tier: 2 }))).toBe(2);
  });

  it("priority_tier=1 retorna 1 (mesmo com dealership_id ou plan='pro' que heurística promoveria)", () => {
    expect(
      inferAdTier(ad({ priority_tier: 1, dealership_id: 99, plan: "pro" }))
    ).toBe(1);
  });

  it("priority_tier canônico vence highlight_until ativo (cnpj-free-store com highlight expirado mal classificado)", () => {
    expect(inferAdTier(ad({ priority_tier: 1, highlight_until: future }))).toBe(1);
  });
});

describe("inferAdTier — fallback heurístico (priority_tier ausente/inválido)", () => {
  it("sem priority_tier + highlight_until futuro → 4", () => {
    expect(inferAdTier(ad({ highlight_until: future }))).toBe(4);
  });

  it("sem priority_tier + highlight_until passado → tier do plan/dealership", () => {
    expect(inferAdTier(ad({ highlight_until: past }))).toBe(1);
  });

  it("sem priority_tier + plan='pro' → 3", () => {
    expect(inferAdTier(ad({ plan: "pro" }))).toBe(3);
    expect(inferAdTier(ad({ plan: "Premium" }))).toBe(3);
  });

  it("sem priority_tier + dealership_id → 2", () => {
    expect(inferAdTier(ad({ dealership_id: 99 }))).toBe(2);
  });

  it("sem priority_tier + seller_type='dealer' → 2", () => {
    expect(inferAdTier(ad({ seller_type: "dealer" }))).toBe(2);
  });

  it("anúncio vazio → 1", () => {
    expect(inferAdTier(ad())).toBe(1);
  });

  it("priority_tier inválido (0, 5, string) cai para heurística", () => {
    expect(inferAdTier(ad({ priority_tier: 0 as 1 }))).toBe(1);
    expect(inferAdTier(ad({ priority_tier: 5 as 4, plan: "pro" }))).toBe(3);
    expect(
      inferAdTier(ad({ priority_tier: "3" as unknown as 3, dealership_id: 99 }))
    ).toBe(2);
  });
});

describe("resolveAdBadges — selos individuais por sinal canônico", () => {
  it("priority_tier=4 produz 'OFERTA DESTAQUE'", () => {
    const out = resolveAdBadges(ad({ priority_tier: 4 }));
    expect(out.map((b) => b.id)).toContain("destaque");
    expect(out.find((b) => b.id === "destaque")?.label).toBe("OFERTA DESTAQUE");
    expect(out.find((b) => b.id === "destaque")?.variant).toBe("warning");
  });

  it("priority_tier=3 produz 'LOJISTA PRO'", () => {
    const out = resolveAdBadges(ad({ priority_tier: 3 }));
    expect(out.map((b) => b.id)).toContain("pro");
    expect(out.find((b) => b.id === "pro")?.label).toBe("LOJISTA PRO");
    expect(out.find((b) => b.id === "pro")?.variant).toBe("premium");
  });

  it("priority_tier=2 produz 'LOJISTA START'", () => {
    const out = resolveAdBadges(ad({ priority_tier: 2 }));
    expect(out.map((b) => b.id)).toContain("start");
    expect(out.find((b) => b.id === "start")?.label).toBe("LOJISTA START");
    expect(out.find((b) => b.id === "start")?.variant).toBe("info");
  });

  it("opportunity=true produz 'OPORTUNIDADE' (mais forte que below_fipe)", () => {
    const out = resolveAdBadges(ad({ opportunity: true, below_fipe: true }));
    expect(out.map((b) => b.id)).toContain("opportunity");
    expect(out.map((b) => b.id)).not.toContain("below_fipe");
  });

  it("below_fipe=true SEM opportunity=true produz 'ABAIXO DA FIPE'", () => {
    const out = resolveAdBadges(ad({ below_fipe: true, opportunity: false }));
    expect(out.map((b) => b.id)).toContain("below_fipe");
    expect(out.find((b) => b.id === "below_fipe")?.label).toBe("ABAIXO DA FIPE");
  });

  it("reviewed_after_below_fipe=true produz 'ANÚNCIO ANALISADO'", () => {
    const out = resolveAdBadges(ad({ reviewed_after_below_fipe: true }));
    expect(out.find((b) => b.id === "reviewed")?.label).toBe("ANÚNCIO ANALISADO");
    expect(out.find((b) => b.id === "reviewed")?.variant).toBe("reviewed");
  });

  it("tier=1 + seller_kind='private' produz 'PARTICULAR'", () => {
    const out = resolveAdBadges(ad({ priority_tier: 1, seller_kind: "private" }));
    expect(out.map((b) => b.id)).toContain("particular");
  });
});

describe("resolveAdBadges — invariantes negativos", () => {
  it("'Loja verificada' NUNCA aparece (adiado até integração externa)", () => {
    const combinations: AdBadgeSignals[] = [
      { priority_tier: 4, opportunity: true, dealership_id: 99 },
      { priority_tier: 3, dealership_id: 99, account_type: "CNPJ" },
      { priority_tier: 2, dealership_name: "Loja XYZ" },
      { priority_tier: 1, seller_kind: "private" },
      { priority_tier: 1, dealership_id: 99 },
      { below_fipe: true, opportunity: true, reviewed_after_below_fipe: true },
    ];
    for (const a of combinations) {
      const out = resolveAdBadges(a);
      const labels = out.map((b) => b.label.toLowerCase());
      expect(labels.some((l) => l.includes("verificad"))).toBe(false);
    }
  });

  it("'PARTICULAR' NÃO aparece em tier 2/3/4 (tier já comunica o canal)", () => {
    expect(
      resolveAdBadges(ad({ priority_tier: 2, seller_kind: "private" })).map((b) => b.id)
    ).not.toContain("particular");
    expect(
      resolveAdBadges(ad({ priority_tier: 3, seller_kind: "private" })).map((b) => b.id)
    ).not.toContain("particular");
    expect(
      resolveAdBadges(ad({ priority_tier: 4, seller_kind: "private" })).map((b) => b.id)
    ).not.toContain("particular");
  });

  it("opportunity=true NÃO duplica 'ABAIXO DA FIPE' (oportunidade implica below_fipe)", () => {
    const out = resolveAdBadges(ad({ opportunity: true, below_fipe: true }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("opportunity");
    expect(ids).not.toContain("below_fipe");
  });

  it("tier 1 sem seller_kind explícito mas com dealership_id → NÃO emite 'PARTICULAR' (mapper canônico decide)", () => {
    // resolveSellerKind fallback: dealership_id válido → "dealer". Então
    // tier 1 (cnpj-free-store) com dealership_id não mostra "PARTICULAR".
    const out = resolveAdBadges(ad({ priority_tier: 1, dealership_id: 99 }));
    expect(out.map((b) => b.id)).not.toContain("particular");
  });
});

describe("resolveAdBadges — combinações realistas", () => {
  it("Destaque + Oportunidade (camada 4 + preço bem abaixo)", () => {
    const out = resolveAdBadges(ad({ priority_tier: 4, opportunity: true }));
    expect(out.map((b) => b.id)).toEqual(["destaque", "opportunity"]);
  });

  it("Pro + Abaixo da FIPE (camada 3 + sinal de preço fraco)", () => {
    const out = resolveAdBadges(
      ad({ priority_tier: 3, below_fipe: true, opportunity: false })
    );
    expect(out.map((b) => b.id)).toEqual(["pro", "below_fipe"]);
  });

  it("Start sem extras (camada 2, sem sinal de preço)", () => {
    const out = resolveAdBadges(ad({ priority_tier: 2 }));
    expect(out.map((b) => b.id)).toEqual(["start"]);
  });

  it("Grátis + Particular (camada 1, anunciante pessoa física)", () => {
    const out = resolveAdBadges(ad({ priority_tier: 1, seller_kind: "private" }));
    expect(out.map((b) => b.id)).toEqual(["particular"]);
  });

  it("Grátis CNPJ (cnpj-free-store com dealership_id) — sem selo, NÃO promove a Start", () => {
    // Caso crítico do alinhamento: tier 1 canônico vence heurística que
    // veria dealership_id e promoveria para Start.
    expect(
      resolveAdBadges(ad({ priority_tier: 1, dealership_id: 99 }))
    ).toEqual([]);
  });

  it("Anúncio absolutamente vazio (sem sinais) — emite 'PARTICULAR' por default seguro de resolveSellerKind", () => {
    // resolveSellerKind default é "private" quando faltam sinais. Para o
    // comprador, isso é o comportamento mais conservador (não promete
    // "loja" sem evidência). Documentado como expectativa do mapper.
    expect(resolveAdBadges(ad({ priority_tier: 1 })).map((b) => b.id)).toEqual([
      "particular",
    ]);
  });

  it("Destaque + Oportunidade + Analisado (3 chips lado a lado)", () => {
    const out = resolveAdBadges(
      ad({
        priority_tier: 4,
        opportunity: true,
        reviewed_after_below_fipe: true,
      })
    );
    expect(out.map((b) => b.id)).toEqual(["destaque", "opportunity", "reviewed"]);
  });
});
