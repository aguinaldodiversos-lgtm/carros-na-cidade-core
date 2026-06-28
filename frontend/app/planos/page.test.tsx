// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

import PlanosPage, { metadata } from "./page";

/**
 * Fase 3A — landing /planos sem ativar Mercado Pago.
 *
 * Atualização (Destaque dinâmico): o card "Destaque 7 dias" agora consome a
 * config pública de boost (platform_settings) via fetchPublicBoost. O lib é
 * mockado aqui para um valor estável (R$ 39,90 / 7 dias / ativo) — equivalente
 * ao fallback centralizado — mantendo as travas de regressão determinísticas.
 *
 * Testes asseguram:
 *   - 4 planos renderizados (Grátis, Start, Pro, Destaque 7 dias)
 *   - Pro marcado como recomendado
 *   - Destaque 7 dias com aviso explícito sobre o que NÃO faz
 *   - CTAs apontam para fluxos seguros existentes (não Mercado Pago)
 *   - canonical = /planos, robots index/follow
 *   - termos proibidos ausentes
 */

vi.mock("@/lib/commercial/public-boost", () => ({
  fetchPublicBoost: vi.fn(async () => ({
    id: "boost-7d",
    name: "Destaque 7 dias",
    description: "Prioridade alta nas buscas e badge de destaque por 7 dias.",
    price_cents: 3990,
    duration_days: 7,
    active: true,
  })),
  formatBoostPriceBRL: (cents: number) =>
    (cents / 100)
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      .replace(new RegExp(String.fromCharCode(160), "g"), " "),
}));

afterEach(cleanup);

async function renderPage() {
  // PlanosPage é Server Component async (fetch do boost). Resolvemos o
  // elemento antes de entregar ao RTL.
  return render(await PlanosPage());
}

describe("/planos — metadata SEO", () => {
  it("title é 'Planos para anunciar veículos'", () => {
    expect(String(metadata.title)).toBe("Planos para anunciar veículos");
  });

  it("description menciona oferta sem promessas vazias", () => {
    expect(String(metadata.description || "")).toMatch(/anuncie|grátis|destaque/i);
    expect(String(metadata.description || "")).not.toMatch(
      /evento premium|feirão|banner regional|crm/i
    );
  });

  it("canonical = /planos (limpo, sem query)", () => {
    expect(metadata.alternates?.canonical).toBe("/planos");
  });

  it("robots: index, follow", () => {
    const robots = metadata.robots as { index?: boolean; follow?: boolean } | undefined;
    expect(robots?.index).toBe(true);
    expect(robots?.follow).toBe(true);
  });
});

describe("/planos — estrutura visual", () => {
  it("renderiza hero com título principal", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/Escolha o plano ideal para anunciar seu veículo/);
  });

  it("renderiza chips do hero (Sem comissão / Mais visibilidade / Cadastro simples)", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/Sem comissão/);
    expect(text).toMatch(/Mais visibilidade/);
    expect(text).toMatch(/Cadastro simples/);
  });

  it("renderiza os 4 planos via data-plan-id", async () => {
    const { container } = await renderPage();
    const ids = Array.from(container.querySelectorAll("[data-plan-id]")).map((el) =>
      el.getAttribute("data-plan-id")
    );
    expect(ids.sort()).toEqual(["destaque-7-dias", "gratis", "lojista-pro", "lojista-start"].sort());
  });

  it("ordem de exibição: Destaque → Pro → Start → Grátis", async () => {
    const { container } = await renderPage();
    const ids = Array.from(container.querySelectorAll("[data-plan-id]")).map((el) =>
      el.getAttribute("data-plan-id")
    );
    expect(ids).toEqual(["destaque-7-dias", "lojista-pro", "lojista-start", "gratis"]);
  });

  it("Pro tem badge RECOMENDADO", async () => {
    const { container } = await renderPage();
    const proCard = container.querySelector('[data-plan-id="lojista-pro"]');
    expect(proCard?.textContent).toMatch(/RECOMENDADO/);
  });

  it("Destaque 7 dias tem badge TOPO POR 7 DIAS", async () => {
    const { container } = await renderPage();
    const destaqueCard = container.querySelector('[data-plan-id="destaque-7-dias"]');
    expect(destaqueCard?.textContent).toMatch(/TOPO POR 7 DIAS/);
  });

  it("renderiza bloco de benefícios", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/Por que escolher o Carros na Cidade/);
    expect(text).toMatch(/Mais confiança para o comprador/);
    expect(text).toMatch(/Mais alcance local e regional/);
    expect(text).toMatch(/Página com visual profissional/);
    expect(text).toMatch(/Sem promessas confusas/);
  });

  it("renderiza FAQ com 4 perguntas obrigatórias", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/O Destaque libera vídeo 360\?/);
    expect(text).toMatch(/Posso contratar o Destaque mais de uma vez\?/);
    expect(text).toMatch(/Posso anunciar gratuitamente\?/);
    expect(text).toMatch(/Quando começam os planos pagos\?/);
  });

  it("renderiza CTA final com 'Comece a anunciar hoje' e 2 botões", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/Comece a anunciar hoje/);
    expect(text).toMatch(/Criar conta grátis/);
    expect(text).toMatch(/Falar com o suporte/);
  });
});

describe("/planos — conteúdo dos cards (oferta segura desta fase)", () => {
  it("Grátis mostra preço R$ 0 e limites de CPF (3) e CNPJ (10)", async () => {
    const { container } = await renderPage();
    const card = container.querySelector('[data-plan-id="gratis"]');
    const text = card?.textContent || "";
    expect(text).toMatch(/R\$ 0/);
    expect(text).toMatch(/Pessoa física: até 3 anúncios/);
    expect(text).toMatch(/Loja com CNPJ: até 10 anúncios/);
    expect(text).toMatch(/Até 8 fotos por anúncio/);
  });

  it("Start mostra R$ 79,90/mês e até 20 anúncios", async () => {
    const { container } = await renderPage();
    const card = container.querySelector('[data-plan-id="lojista-start"]');
    const text = card?.textContent || "";
    expect(text).toMatch(/R\$ 79,90/);
    expect(text).toMatch(/Até 20 anúncios ativos/);
  });

  it("Pro mostra R$ 149,90/mês com prioridade superior ao Start", async () => {
    const { container } = await renderPage();
    const card = container.querySelector('[data-plan-id="lojista-pro"]');
    const text = card?.textContent || "";
    expect(text).toMatch(/R\$ 149,90/);
    expect(text).toMatch(/Prioridade comercial superior ao Start/);
  });

  it("Destaque 7 dias mostra R$ 39,90 e os 3 cautions explícitos", async () => {
    const { container } = await renderPage();
    const card = container.querySelector('[data-plan-id="destaque-7-dias"]');
    const text = card?.textContent || "";
    expect(text).toMatch(/R\$ 39,90/);
    expect(text).toMatch(/Não libera vídeo 360/);
    expect(text).toMatch(/Não altera o limite de fotos/);
    expect(text).toMatch(/Não altera o limite de anúncios/);
  });
});

describe("/planos — CTAs apontam para login → fluxo do anúncio (Mercado Pago NÃO acionado)", () => {
  function hrefOfCta(container: HTMLElement, planId: string): string | null {
    const card = container.querySelector(`[data-plan-id="${planId}"]`);
    return card?.querySelector("a")?.getAttribute("href") ?? null;
  }

  it("Grátis → /login?next=/anunciar (volta pra fluxo do anúncio após auth)", async () => {
    const { container } = await renderPage();
    expect(hrefOfCta(container, "gratis")).toBe("/login?next=/anunciar");
  });

  it("Start → /login?next=/anunciar?plano=start", async () => {
    const { container } = await renderPage();
    expect(hrefOfCta(container, "lojista-start")).toBe("/login?next=/anunciar?plano=start");
  });

  it("Pro → /login?next=/anunciar?plano=pro", async () => {
    const { container } = await renderPage();
    expect(hrefOfCta(container, "lojista-pro")).toBe("/login?next=/anunciar?plano=pro");
  });

  it("Destaque 7 dias → /login?next=/anunciar?acao=destaque (NÃO checkout MP — exige ad_id)", async () => {
    // Travamento: NUNCA iniciar Mercado Pago de Destaque sem ad_id.
    const { container } = await renderPage();
    expect(hrefOfCta(container, "destaque-7-dias")).toBe("/login?next=/anunciar?acao=destaque");
  });

  it("TODAS as 4 CTAs começam com /login?next= (forçam autenticação antes de qualquer ação comercial)", async () => {
    const { container } = await renderPage();
    const planIds = ["gratis", "lojista-start", "lojista-pro", "destaque-7-dias"];
    for (const id of planIds) {
      const href = hrefOfCta(container, id);
      expect(href, `plano=${id}`).toMatch(/^\/login\?next=/);
    }
  });

  it("nenhum link da página aponta para mercadopago.com / /api/payments diretamente", async () => {
    const { container } = await renderPage();
    const hrefs = Array.from(container.querySelectorAll("a")).map(
      (a) => a.getAttribute("href") || ""
    );
    for (const href of hrefs) {
      expect(href).not.toMatch(/mercadopago/i);
      expect(href).not.toMatch(/^\/api\/payments/);
    }
  });
});

describe("/planos — termos proibidos (não promete features não entregues)", () => {
  it("não menciona Evento Premium / Feirão / Banner Regional / impulsionamento geolocalizado / CRM", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).not.toMatch(/Evento Premium/i);
    expect(text).not.toMatch(/Feir[ãa]o/i);
    expect(text).not.toMatch(/banner regional/i);
    expect(text).not.toMatch(/impulsionamento geolocalizado/i);
    expect(text).not.toMatch(/\bCRM\b/i);
  });

  it("Pro NÃO promete vídeo 360 nem créditos mensais (features não entregues)", async () => {
    const { container } = await renderPage();
    const proCard = container.querySelector('[data-plan-id="lojista-pro"]');
    const text = proCard?.textContent || "";
    expect(text).not.toMatch(/vídeo 360|video 360/i);
    expect(text).not.toMatch(/créditos mensais|credito mensal|destaques mensais inclus/i);
  });

  it("Pro NÃO promete 15 fotos (wizard ainda limita 10)", async () => {
    const { container } = await renderPage();
    const proCard = container.querySelector('[data-plan-id="lojista-pro"]');
    const text = proCard?.textContent || "";
    expect(text).not.toMatch(/15 fotos/i);
  });

  it("Start NÃO promete crédito mensal (não implementado)", async () => {
    const { container } = await renderPage();
    const startCard = container.querySelector('[data-plan-id="lojista-start"]');
    const text = startCard?.textContent || "";
    expect(text).not.toMatch(/destaque mensal|crédito mensal|credito mensal/i);
  });

  it("FAQ do Destaque deixa CLARO que não libera vídeo 360", async () => {
    const { container } = await renderPage();
    const text = container.textContent || "";
    expect(text).toMatch(/O Destaque libera vídeo 360\?\s*[\s\S]*Não\. O Destaque apenas/);
  });
});
