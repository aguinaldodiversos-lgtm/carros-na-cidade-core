import { describe, it, expect } from "vitest";
import {
  AD_BADGE_STYLE,
  resolveAdBadgeVariant,
} from "../../frontend/lib/dashboard/ad-status-badge.ts";

/**
 * Tarefa 5 — testes do mapping status → badge do dashboard do anunciante.
 *
 * Função pura (sem DOM), independente do AdCard.tsx. Cobre o contrato
 * que o card consome:
 *   • pending_review → "Em análise"
 *   • rejected       → "Rejeitado"
 *   • Destaque NUNCA aparece para status fora de active.
 *   • Botões Pausar/Impulsionar fora de active devem usar variantes
 *     que NÃO sejam "active" nem "highlighted".
 *
 * O teste DOM completo está em
 *   frontend/components/dashboard/AdCard.test.tsx
 * (executado pelo CI com frontend/node_modules instalado).
 */

describe("resolveAdBadgeVariant — mapping status → badge", () => {
  it("active sem destaque → 'active' / 'Ativo'", () => {
    const v = resolveAdBadgeVariant("active", false);
    expect(v).toBe("active");
    expect(AD_BADGE_STYLE[v].label).toBe("Ativo");
  });

  it("active com is_featured=true → 'highlighted' / 'Destaque'", () => {
    const v = resolveAdBadgeVariant("active", true);
    expect(v).toBe("highlighted");
    expect(AD_BADGE_STYLE[v].label).toBe("Destaque");
  });

  it("pending_review → 'Em análise' (mesmo com is_featured=true)", () => {
    expect(resolveAdBadgeVariant("pending_review", false)).toBe("pending_review");
    expect(AD_BADGE_STYLE.pending_review.label).toBe("Em análise");

    // Destaque não pode aparecer para pending_review.
    const v = resolveAdBadgeVariant("pending_review", true);
    expect(v).toBe("pending_review");
    expect(AD_BADGE_STYLE[v].label).not.toBe("Destaque");
  });

  it("rejected → 'Rejeitado'", () => {
    expect(resolveAdBadgeVariant("rejected", false)).toBe("rejected");
    expect(AD_BADGE_STYLE.rejected.label).toBe("Rejeitado");
  });

  it("paused → 'Pausado' (Destaque não vaza)", () => {
    expect(resolveAdBadgeVariant("paused", true)).toBe("paused");
  });

  it("sold/expired/blocked têm rótulos próprios", () => {
    expect(AD_BADGE_STYLE.sold.label).toBe("Vendido");
    expect(AD_BADGE_STYLE.expired.label).toBe("Expirado");
    expect(AD_BADGE_STYLE.blocked.label).toBe("Bloqueado");
    expect(resolveAdBadgeVariant("sold", false)).toBe("sold");
    expect(resolveAdBadgeVariant("expired", false)).toBe("expired");
    expect(resolveAdBadgeVariant("blocked", false)).toBe("blocked");
  });

  it("status desconhecido cai em 'paused' (defesa)", () => {
    expect(resolveAdBadgeVariant("foo_unknown", false)).toBe("paused");
  });
});
