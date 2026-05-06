import { describe, expect, it } from "vitest";

import { getPlans, getPlanById } from "./plan-store";

/**
 * Contrato do FALLBACK público de planos (planSeed em plan-store.ts).
 *
 * Fonte de verdade real é o banco / admin (`subscription_plans`). Este
 * fallback só é exposto quando `/api/plans` falha (SSR ou client) — mas
 * mesmo no fallback os números precisam bater com a oferta oficial de
 * lançamento, senão usuário vê preços/limites antigos quando backend cair.
 *
 * Oferta oficial (docs/runbooks/plans-launch-alignment.md):
 *
 *   Grátis CPF       — 3 ads,  8 fotos, peso 1, sem vídeo, 0 destaques/mês
 *   Grátis CNPJ      — 10 ads, 8 fotos, peso 1, sem vídeo, 0 destaques/mês
 *   Start CNPJ       — 20 ads, 12 fotos, peso 2, sem vídeo, 1 destaque/mês — R$ 79,90/mês
 *   Pro CNPJ         — ilimitado (trava 1000), 15 fotos, peso 3, vídeo 360, 3 destaques/mês — R$ 149,90/mês
 *   Destaque 7 dias  — peso 4 enquanto ativo, R$ 39,90 (boost avulso, fora do plan-store)
 *
 * Planos descontinuados (CPF Premium Highlight, Evento Premium): não aparecem
 * em getPlans({ onlyActive: true }) — o lookup por id continua funcionando
 * para preservar histórico.
 */

describe("plan-store fallback — alinhamento à oferta oficial de lançamento", () => {
  describe("Grátis CPF (cpf-free-essential)", () => {
    const plan = getPlanById("cpf-free-essential")!;

    it("preço 0, ad_limit 3", () => {
      expect(plan.price).toBe(0);
      expect(plan.ad_limit).toBe(3);
    });

    it("8 fotos, peso 1, sem vídeo 360, 0 destaques mensais", () => {
      expect(plan.max_photos).toBe(8);
      expect(plan.weight).toBe(1);
      expect(plan.video_360_enabled).toBe(false);
      expect(plan.monthly_highlight_credits).toBe(0);
    });

    it("aparece em getPlans({ type: 'CPF', onlyActive: true })", () => {
      const cpfPlans = getPlans({ type: "CPF", onlyActive: true });
      expect(cpfPlans.some((p) => p.id === "cpf-free-essential")).toBe(true);
    });
  });

  describe("Grátis CNPJ (cnpj-free-store)", () => {
    const plan = getPlanById("cnpj-free-store")!;

    it("preço 0, ad_limit 10 (alinhado à oferta — antes era 20)", () => {
      expect(plan.price).toBe(0);
      expect(plan.ad_limit).toBe(10);
    });

    it("8 fotos, peso 1, sem vídeo 360, 0 destaques mensais", () => {
      expect(plan.max_photos).toBe(8);
      expect(plan.weight).toBe(1);
      expect(plan.video_360_enabled).toBe(false);
      expect(plan.monthly_highlight_credits).toBe(0);
    });
  });

  describe("Start CNPJ (cnpj-store-start)", () => {
    const plan = getPlanById("cnpj-store-start")!;

    it("preço R$ 79,90/mês (oferta oficial — fallback antigo era R$ 299,90)", () => {
      expect(plan.price).toBe(79.9);
      expect(plan.billing_model).toBe("monthly");
    });

    it("ad_limit 20 (oferta oficial — fallback antigo era 80)", () => {
      expect(plan.ad_limit).toBe(20);
    });

    it("12 fotos, peso 2, sem vídeo 360, 1 destaque mensal incluído", () => {
      expect(plan.max_photos).toBe(12);
      expect(plan.weight).toBe(2);
      expect(plan.video_360_enabled).toBe(false);
      expect(plan.monthly_highlight_credits).toBe(1);
    });
  });

  describe("Pro CNPJ (cnpj-store-pro)", () => {
    const plan = getPlanById("cnpj-store-pro")!;

    it("preço R$ 149,90/mês (oferta oficial — fallback antigo era R$ 599,90)", () => {
      expect(plan.price).toBe(149.9);
      expect(plan.billing_model).toBe("monthly");
    });

    it("ad_limit é a trava técnica (>= 1000) — 'ilimitado' com defesa", () => {
      // Oferta oficial: "anúncios ilimitados no lançamento, com trava
      // técnica/admin configurável". Fallback usa 1000 como trava segura.
      expect(plan.ad_limit).toBeGreaterThanOrEqual(1000);
    });

    it("15 fotos, peso 3, vídeo 360 habilitado, 3 destaques mensais inclusos", () => {
      expect(plan.max_photos).toBe(15);
      expect(plan.weight).toBe(3);
      expect(plan.video_360_enabled).toBe(true);
      expect(plan.monthly_highlight_credits).toBe(3);
    });

    it("é o plano recomendado para CNPJ", () => {
      expect(plan.recommended).toBe(true);
    });
  });

  describe("Plano Evento Premium (cnpj-evento-premium) — produto desligado", () => {
    it("permanece no array (lookup por id funciona) mas com is_active=false", () => {
      const plan = getPlanById("cnpj-evento-premium");
      expect(plan).toBeTruthy();
      expect(plan?.is_active).toBe(false);
    });

    it("NÃO aparece em getPlans({ onlyActive: true }) — defesa em profundidade", () => {
      const all = getPlans({ onlyActive: true });
      expect(all.some((p) => p.id === "cnpj-evento-premium")).toBe(false);
    });

    it("NÃO aparece em getPlans({ type: 'CNPJ', onlyActive: true })", () => {
      const cnpj = getPlans({ type: "CNPJ", onlyActive: true });
      expect(cnpj.some((p) => p.id === "cnpj-evento-premium")).toBe(false);
    });
  });

  describe("CPF Premium Highlight (cpf-premium-highlight) — descontinuado", () => {
    // Substituído pelo boost avulso "Destaque 7 dias" (R$ 39,90,
    // BOOST_OPTIONS no backend), válido para CPF e CNPJ.
    it("permanece no array com is_active=false (lookup histórico)", () => {
      const plan = getPlanById("cpf-premium-highlight");
      expect(plan).toBeTruthy();
      expect(plan?.is_active).toBe(false);
    });

    it("NÃO aparece em getPlans({ type: 'CPF', onlyActive: true })", () => {
      const cpf = getPlans({ type: "CPF", onlyActive: true });
      expect(cpf.some((p) => p.id === "cpf-premium-highlight")).toBe(false);
    });
  });

  describe("Composição da listagem pública (onlyActive=true)", () => {
    it("CPF retorna apenas Grátis CPF", () => {
      const cpf = getPlans({ type: "CPF", onlyActive: true });
      expect(cpf.map((p) => p.id).sort()).toEqual(["cpf-free-essential"]);
    });

    it("CNPJ retorna apenas Grátis CNPJ + Start + Pro (3 planos)", () => {
      const cnpj = getPlans({ type: "CNPJ", onlyActive: true });
      const ids = cnpj.map((p) => p.id).sort();
      expect(ids).toEqual(["cnpj-free-store", "cnpj-store-pro", "cnpj-store-start"]);
    });

    it("nenhum plano público promove Evento/Banner Regional/Feirão na descrição", () => {
      const all = getPlans({ onlyActive: true });
      for (const plan of all) {
        const haystack = `${plan.name} ${plan.description} ${plan.benefits.join(" ")}`;
        expect(haystack).not.toMatch(/evento/i);
        expect(haystack).not.toMatch(/feir[ãa]o/i);
        expect(haystack).not.toMatch(/banner regional/i);
      }
    });
  });

  describe("Pesos comerciais consistentes com commercial_layer do ranking", () => {
    // O SQL em src/modules/ads/filters/ads-ranking.sql.js usa:
    //   priority_level >= 80 → camada 3 (Pro)
    //   priority_level >= 50 → camada 2 (Start)
    //   demais             → camada 1 (Grátis)
    //   highlight_until    → camada 4 (boost avulso 7d, fora do plano)
    it("Pro tem priority_level >= 80", () => {
      expect(getPlanById("cnpj-store-pro")?.priority_level).toBeGreaterThanOrEqual(80);
    });

    it("Start tem priority_level >= 50 e < 80", () => {
      const p = getPlanById("cnpj-store-start")?.priority_level ?? 0;
      expect(p).toBeGreaterThanOrEqual(50);
      expect(p).toBeLessThan(80);
    });

    it("Grátis CPF tem priority_level < 50", () => {
      expect(getPlanById("cpf-free-essential")?.priority_level).toBeLessThan(50);
    });

    it("Grátis CNPJ tem priority_level < 50", () => {
      expect(getPlanById("cnpj-free-store")?.priority_level).toBeLessThan(50);
    });

    it("weight (campo opcional do fallback) bate com a camada SQL alvo", () => {
      // Garantia explícita do contrato visualizado pelo frontend, mesmo
      // que SQL derive de priority_level — `weight` é o número que UI
      // usa pra explicar a hierarquia ao usuário.
      expect(getPlanById("cpf-free-essential")?.weight).toBe(1);
      expect(getPlanById("cnpj-free-store")?.weight).toBe(1);
      expect(getPlanById("cnpj-store-start")?.weight).toBe(2);
      expect(getPlanById("cnpj-store-pro")?.weight).toBe(3);
      // Peso 4 (Destaque 7d) é boost avulso, não plano — não aparece aqui.
    });
  });
});
