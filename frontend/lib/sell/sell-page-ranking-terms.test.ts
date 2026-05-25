import { describe, expect, it } from "vitest";

import { getSellPageContent } from "@/lib/sell/sell-page";

/**
 * Briefing P2-D 2026-05-25 — guard de regressão contra exposição de
 * mecânica interna de ranking no conteúdo público de /anunciar.
 *
 * Regras do briefing:
 *   "Não expor mecânica interna de ranking:
 *     priority_tier;
 *     peso;
 *     lógica Pro > Start > Grátis nos cards públicos;
 *     nomes técnicos de plano como se fossem regra de ordenação."
 *
 * Se mencionar planos ou destaque, usar linguagem comercial limpa
 * (ex.: "planos pagos", "destaque", "selo público") — não técnica.
 *
 * Selos que o comprador vê continuam canônicos via `resolvePublicAdBadges`
 * (Destaque, Loja, Oportunidade, Abaixo da FIPE) — nunca emite Pro/Start.
 */

describe("/anunciar — sem nomes internos de plano no copy público", () => {
  it("não menciona 'plano Pro' / 'plano Start' / 'Grátis' como regra de ordenação", async () => {
    const content = await getSellPageContent();
    const json = JSON.stringify(content);
    // Termos exatos do bastidor comercial — não devem aparecer na copy.
    expect(json).not.toMatch(/plano Pro\b/);
    expect(json).not.toMatch(/plano Start\b/);
    expect(json).not.toMatch(/\bplano Grátis\b/i);
    expect(json).not.toMatch(/priority_tier/);
    expect(json).not.toMatch(/hybrid_score/);
    expect(json).not.toMatch(/baseCityBoost/);
  });

  it("não cita 'Pro' / 'Start' como nomes próprios em contexto de ranking", async () => {
    const content = await getSellPageContent();
    const json = JSON.stringify(content);
    // "Pro" e "Start" isolados em contexto de ranking são proibidos.
    // (Falsos positivos legítimos: "Programa", "Processo", "Pronto",
    //  "Startup" — checamos word boundary específico de exposição de
    //  nome de plano comercial.)
    expect(json).not.toMatch(/\bPro\s+e\s+plano\b/);
    expect(json).not.toMatch(/\bStart\s+respeit/);
    expect(json).not.toMatch(/\bPro\s*>\s*Start/);
  });

  it("dealerBenefits descreve benefício, não mecanismo interno", async () => {
    const content = await getSellPageContent();
    for (const benefit of content.dealerBenefits) {
      expect(benefit.title).not.toMatch(/\bplano Pro\b/);
      expect(benefit.title).not.toMatch(/\bplano Start\b/);
      expect(benefit.description).not.toMatch(/\bplano Pro\b/);
      expect(benefit.description).not.toMatch(/\bplano Start\b/);
    }
  });

  it("strings proibidas do briefing P0/P2 ausentes no conteúdo público", async () => {
    const content = await getSellPageContent();
    const json = JSON.stringify(content);
    const forbidden = [
      "backend irá incorporar",
      "features[]",
      "has_photo",
      "DeployModel",
      "SÆo Paulo",
      "Teste alerta",
      "Auto Center Teste",
    ];
    for (const word of forbidden) {
      expect(json).not.toContain(word);
    }
  });
});
