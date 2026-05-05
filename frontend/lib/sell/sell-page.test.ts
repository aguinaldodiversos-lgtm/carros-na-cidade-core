import { describe, it, expect } from "vitest";
import { getSellPageContent } from "./sell-page";

/**
 * Termos PROIBIDOS na copy pública de /anunciar.
 *
 * Critérios:
 * - "Evento Premium", "Feirão" / "FeirÆo", "banner regional",
 *   "impulsionamento geolocalizado", "cnpj-evento-premium":
 *   produto Evento desligado (ver
 *   docs/runbooks/events-feature-shutdown.md). Não pode aparecer.
 * - "plano premium" / "plano básico": rotular planos por nomes
 *   internos antigos confunde a oferta atual (Start/Pro/Destaque).
 * - "CRM futuro" / "integração futura com CRM" /
 *   "base pronta para integração com CRM": prometia produto que não
 *   está sendo entregue. Substituído por "gestão simples …".
 * - "destaque regional" como copy comercial: substituído por
 *   "destaque 7 dias" (nome do produto kept).
 *
 * `premium` aparecendo isolado é EVITADO nesta página de conversão
 * para não confundir com promessa de plano (a única exceção legítima
 * seria o nome do plano "Plano Destaque Premium", que NÃO renderiza
 * em /anunciar — a página não lista planos por nome).
 */
const FORBIDDEN_PATTERNS: ReadonlyArray<RegExp> = [
  /\bEvento Premium\b/i,
  /\bFeirão\b/i,
  /\bFeirÆo\b/,
  /\bbanner regional\b/i,
  /\bimpulsionamento geolocalizado\b/i,
  /\bcnpj-evento-premium\b/i,
  /\bplano premium\b/i,
  /\bplano básico\b/i,
  /\bCRM futuro\b/i,
  /\bintegração futura com CRM\b/i,
  /\bbase pronta para integração com CRM\b/i,
  /\bdestaque regional\b/i,
  /\bpremium\b/i, // garantia adicional: nenhuma menção solta a "premium"
];

function flattenContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenContent).join("\n");
  if (content && typeof content === "object") {
    return Object.values(content as Record<string, unknown>)
      .map(flattenContent)
      .join("\n");
  }
  return "";
}

describe("/anunciar copy — termos proibidos", () => {
  it("getSellPageContent não contém termos proibidos", async () => {
    const content = await getSellPageContent();
    const flat = flattenContent(content);

    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(
        flat,
        `termo proibido ${pattern} apareceu na copy de /anunciar`
      ).not.toMatch(pattern);
    }
  });

  it("a copy ainda menciona Start, Pro e Destaque (oferta atual)", async () => {
    const content = await getSellPageContent();
    const flat = flattenContent(content);

    // Garante que a substituição não eliminou os nomes corretos do produto.
    expect(flat).toMatch(/\bplano Start\b/);
    expect(flat).toMatch(/\bplano Pro\b/);
    expect(flat).toMatch(/\bdestaque 7 dias\b/i);
  });

  it("a copy mantém a proposta principal (FIPE, WhatsApp, presença local)", async () => {
    const content = await getSellPageContent();
    const flat = flattenContent(content);

    expect(flat).toMatch(/FIPE/);
    expect(flat).toMatch(/WhatsApp/);
    // Regional/local: alguma referência precisa permanecer
    expect(flat).toMatch(/regional|local|cidade/i);
  });
});

describe("/anunciar canonical — metadata da rota", () => {
  it("page.tsx exporta metadata com canonical apontando para /anunciar", async () => {
    // Importa o módulo da página e checa o metadata exportado.
    // Não renderiza nada — apenas inspeciona a constante.
    const mod = (await import("../../app/anunciar/page")) as {
      metadata?: { alternates?: { canonical?: string } };
    };
    expect(mod.metadata?.alternates?.canonical).toBe("/anunciar");
  });
});
