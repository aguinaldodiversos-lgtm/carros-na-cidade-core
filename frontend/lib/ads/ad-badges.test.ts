import { describe, expect, it } from "vitest";
import {
  type AdBadgeSignals,
  inferAdTier,
  resolveAdminAdBadges,
  resolvePublicAdBadges,
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
    expect(inferAdTier(ad({ priority_tier: 1, dealership_id: 99, plan: "pro" }))).toBe(1);
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
    expect(inferAdTier(ad({ priority_tier: "3" as unknown as 3, dealership_id: 99 }))).toBe(2);
  });
});

/**
 * Cobre os invariantes obrigatórios da correção de UX:
 *
 *   - Pro não aparece como badge público.
 *   - Start não aparece como badge público.
 *   - Grátis não aparece como badge público.
 *   - dealer com priority_tier=3 renderiza "LOJA", não "LOJISTA PRO".
 *   - dealer com priority_tier=2 renderiza "LOJA", não "LOJISTA START".
 *   - private com priority_tier=1 renderiza "PARTICULAR".
 *   - destaque com priority_tier=4 renderiza "DESTAQUE".
 *   - opportunity=true renderiza "OPORTUNIDADE".
 *   - below_fipe=true && opportunity=false renderiza "ABAIXO DA FIPE".
 */
describe("resolvePublicAdBadges — vitrine pública (sem nomes de plano)", () => {
  it("priority_tier=4 produz selo 'DESTAQUE'", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 4 }));
    expect(out.find((b) => b.id === "destaque")?.label).toBe("DESTAQUE");
    expect(out.find((b) => b.id === "destaque")?.variant).toBe("warning");
  });

  it("priority_tier=3 + dealer renderiza 'LOJA', não 'LOJISTA PRO'", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 3, seller_kind: "dealer" }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("loja");
    expect(ids).not.toContain("pro");
    expect(out.every((b) => !b.label.toLowerCase().includes("pro"))).toBe(true);
  });

  it("priority_tier=2 + dealer renderiza 'LOJA', não 'LOJISTA START'", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 2, seller_kind: "dealer" }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("loja");
    expect(ids).not.toContain("start");
    expect(out.every((b) => !b.label.toLowerCase().includes("start"))).toBe(true);
  });

  it("priority_tier=1 + private renderiza 'PARTICULAR'", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 1, seller_kind: "private" }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("particular");
    expect(out.find((b) => b.id === "particular")?.label).toBe("PARTICULAR");
  });

  it("opportunity=true produz 'OPORTUNIDADE' e suprime 'ABAIXO DA FIPE'", () => {
    const out = resolvePublicAdBadges(ad({ opportunity: true, below_fipe: true }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("opportunity");
    expect(ids).not.toContain("below_fipe");
  });

  it("below_fipe=true && opportunity=false renderiza 'ABAIXO DA FIPE'", () => {
    const out = resolvePublicAdBadges(ad({ below_fipe: true, opportunity: false }));
    expect(out.map((b) => b.id)).toContain("below_fipe");
    expect(out.find((b) => b.id === "below_fipe")?.label).toBe("ABAIXO DA FIPE");
  });

  it("reviewed_after_below_fipe=true produz 'ANÚNCIO ANALISADO'", () => {
    const out = resolvePublicAdBadges(ad({ reviewed_after_below_fipe: true }));
    expect(out.find((b) => b.id === "reviewed")?.label).toBe("ANÚNCIO ANALISADO");
  });
});

describe("resolvePublicAdBadges — INVARIANTES (nada de plano comercial vaza)", () => {
  it("priority_tier=3 NUNCA produz badge 'pro' ou label com 'PRO'", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 3 },
      { priority_tier: 3, seller_kind: "dealer" },
      { priority_tier: 3, seller_kind: "private" },
      { priority_tier: 3, opportunity: true },
      { priority_tier: 3, below_fipe: true },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      expect(out.map((b) => b.id)).not.toContain("pro");
      for (const b of out) {
        expect(b.label.toUpperCase()).not.toMatch(/\bPRO\b/);
        expect(b.label.toLowerCase()).not.toContain("lojista");
      }
    }
  });

  it("priority_tier=2 NUNCA produz badge 'start' ou label com 'START'", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 2 },
      { priority_tier: 2, seller_kind: "dealer" },
      { priority_tier: 2, seller_kind: "private" },
      { priority_tier: 2, opportunity: true },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      expect(out.map((b) => b.id)).not.toContain("start");
      for (const b of out) {
        expect(b.label.toUpperCase()).not.toMatch(/\bSTART\b/);
        expect(b.label.toLowerCase()).not.toContain("lojista");
      }
    }
  });

  it("priority_tier=1 NUNCA produz label 'GRÁTIS' ou similar", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 1 },
      { priority_tier: 1, seller_kind: "dealer" },
      { priority_tier: 1, seller_kind: "private" },
      { priority_tier: 1, below_fipe: true },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      for (const b of out) {
        expect(b.label.toLowerCase()).not.toContain("grátis");
        expect(b.label.toLowerCase()).not.toContain("gratis");
        expect(b.label.toLowerCase()).not.toContain("free");
      }
    }
  });

  it("'Loja verificada' NUNCA aparece (adiado até integração externa)", () => {
    const combinations: AdBadgeSignals[] = [
      { priority_tier: 4, opportunity: true, dealership_id: 99 },
      { priority_tier: 3, dealership_id: 99, account_type: "CNPJ" },
      { priority_tier: 2, dealership_name: "Loja XYZ" },
      { priority_tier: 1, seller_kind: "private" },
      { below_fipe: true, opportunity: true, reviewed_after_below_fipe: true },
    ];
    for (const a of combinations) {
      const out = resolvePublicAdBadges(a);
      expect(out.every((b) => !b.label.toLowerCase().includes("verificad"))).toBe(true);
    }
  });

  it("seller_kind é sempre exibido (Loja OU Particular) — comprador precisa saber o canal", () => {
    const combinations: AdBadgeSignals[] = [
      { priority_tier: 4 },
      { priority_tier: 3 },
      { priority_tier: 2 },
      { priority_tier: 1 },
      { below_fipe: true },
      { opportunity: true },
      {},
    ];
    for (const a of combinations) {
      const ids = resolvePublicAdBadges(a).map((b) => b.id);
      expect(ids.includes("loja") || ids.includes("particular")).toBe(true);
    }
  });

  it("opportunity=true NÃO duplica 'ABAIXO DA FIPE' (oportunidade implica below_fipe)", () => {
    const out = resolvePublicAdBadges(ad({ opportunity: true, below_fipe: true }));
    const ids = out.map((b) => b.id);
    expect(ids).toContain("opportunity");
    expect(ids).not.toContain("below_fipe");
  });
});

describe("resolvePublicAdBadges — combinações realistas", () => {
  it("Destaque + Oportunidade + Loja (anúncio destacado, preço bem abaixo, CNPJ)", () => {
    const out = resolvePublicAdBadges(
      ad({ priority_tier: 4, opportunity: true, seller_kind: "dealer" })
    );
    expect(out.map((b) => b.id)).toEqual(["destaque", "opportunity", "loja"]);
  });

  it("Pro internamente vira 'Loja' publicamente", () => {
    const out = resolvePublicAdBadges(
      ad({ priority_tier: 3, below_fipe: true, seller_kind: "dealer" })
    );
    expect(out.map((b) => b.id)).toEqual(["below_fipe", "loja"]);
  });

  it("Start internamente vira 'Loja' publicamente", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 2, seller_kind: "dealer" }));
    expect(out.map((b) => b.id)).toEqual(["loja"]);
  });

  it("Grátis (cpf-free-essential) + Particular", () => {
    const out = resolvePublicAdBadges(ad({ priority_tier: 1, seller_kind: "private" }));
    expect(out.map((b) => b.id)).toEqual(["particular"]);
  });

  it("Grátis (cnpj-free-store) — exibe 'Loja' (CNPJ é canal loja, mesmo sem plano pago)", () => {
    const out = resolvePublicAdBadges(
      ad({ priority_tier: 1, account_type: "CNPJ", dealership_id: 99 })
    );
    expect(out.map((b) => b.id)).toEqual(["loja"]);
  });

  it("Destaque + Analisado + Particular (CPF pagou boost, abaixo da FIPE foi revisado)", () => {
    const out = resolvePublicAdBadges(
      ad({
        priority_tier: 4,
        opportunity: true,
        reviewed_after_below_fipe: true,
        seller_kind: "private",
      })
    );
    expect(out.map((b) => b.id)).toEqual(["destaque", "opportunity", "reviewed", "particular"]);
  });
});

/**
 * resolveAdminAdBadges é USADO INTERNAMENTE (painel admin/moderação).
 * Pode mostrar Pro/Start como rótulos de plano para diagnóstico.
 * NUNCA usar em UI pública (testes acima cobrem o público).
 */
describe("resolveAdminAdBadges — painel interno (com rótulos de plano)", () => {
  it("priority_tier=3 produz 'LOJISTA PRO' para admin (não vai pra vitrine)", () => {
    const out = resolveAdminAdBadges(ad({ priority_tier: 3 }));
    expect(out.find((b) => b.id === "pro")?.label).toBe("LOJISTA PRO");
  });

  it("priority_tier=2 produz 'LOJISTA START' para admin", () => {
    const out = resolveAdminAdBadges(ad({ priority_tier: 2 }));
    expect(out.find((b) => b.id === "start")?.label).toBe("LOJISTA START");
  });

  it("priority_tier=4 produz 'DESTAQUE' (admin e público concordam aqui)", () => {
    const adminOut = resolveAdminAdBadges(ad({ priority_tier: 4 }));
    const publicOut = resolvePublicAdBadges(ad({ priority_tier: 4 }));
    expect(adminOut.find((b) => b.id === "destaque")?.label).toBe("DESTAQUE");
    expect(publicOut.find((b) => b.id === "destaque")?.label).toBe("DESTAQUE");
  });

  it("priority_tier=1 não emite rótulo de plano (Grátis fica implícito)", () => {
    const out = resolveAdminAdBadges(ad({ priority_tier: 1, seller_kind: "private" }));
    for (const b of out) {
      expect(b.label.toLowerCase()).not.toContain("grátis");
      expect(b.label.toLowerCase()).not.toContain("gratis");
    }
  });
});

/**
 * Invariantes adicionais alinhados ao briefing territorial 2026-05-20:
 *
 * A imagem `atualização-catalogo.png` mostra "Loja verificada" e "Loja
 * premium" como selos nos cards. O briefing prevalece: enquanto não
 * houver sinal canônico confiável de verificação externa
 * (ex.: `dealer_verified`/`store_verified`), esses labels não podem ser
 * exibidos. Premium também não pode aparecer porque vazaria plano
 * comercial (Pro/Start) indiretamente.
 */
describe("resolvePublicAdBadges — invariantes territoriais 2026-05-20", () => {
  it("nenhum selo público contém o texto 'verificada' (sem sinal canônico ainda)", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 4, seller_kind: "dealer" },
      { priority_tier: 3, seller_kind: "dealer" },
      { priority_tier: 2, seller_kind: "dealer" },
      { priority_tier: 1, seller_kind: "dealer", opportunity: true },
      { priority_tier: 1, seller_kind: "dealer", below_fipe: true },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      for (const b of out) {
        expect(b.label.toLowerCase()).not.toContain("verificada");
        expect(b.label.toLowerCase()).not.toContain("verificado");
      }
    }
  });

  it("nenhum selo público contém o texto 'premium' (vazaria plano comercial)", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 4 },
      { priority_tier: 3, seller_kind: "dealer" },
      { priority_tier: 2, seller_kind: "dealer", opportunity: true },
      { priority_tier: 1, seller_kind: "private", below_fipe: true },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      for (const b of out) {
        expect(b.label.toLowerCase()).not.toContain("premium");
      }
    }
  });

  it("dealer com qualquer tier renderiza exatamente 'LOJA' (sem sufixos)", () => {
    const variants: AdBadgeSignals[] = [
      { priority_tier: 4, seller_kind: "dealer" },
      { priority_tier: 3, seller_kind: "dealer" },
      { priority_tier: 2, seller_kind: "dealer" },
      { priority_tier: 1, seller_kind: "dealer" },
    ];
    for (const a of variants) {
      const out = resolvePublicAdBadges(a);
      const loja = out.find((b) => b.id === "loja");
      expect(loja?.label).toBe("LOJA");
    }
  });
});
