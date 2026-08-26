// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccountPanelShell from "./AccountPanelShell";
import DealerSaleOpportunityDetail from "./DealerSaleOpportunityDetail";
import { isFocusModeRoute, isOpportunityDetailPath } from "@/lib/account/focus-routes";
import {
  FEW_PHOTOS_THRESHOLD,
  HIGH_MILEAGE_KM,
  buildReviewPoints,
} from "@/lib/sale-requests/opportunity-review-points";
import {
  fipeComparison,
  type DealerSaleOpportunityDetail as Detail,
  type DealerVehicleEvaluation,
} from "@/lib/sale-requests/dealer-api";

/**
 * FASE 4.11A — a remodelagem da página de detalhe da oportunidade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO TRAVA
 * ════════════════════════════════════════════════════════════════════════════
 * As decisões NOVAS desta fase, e só elas. O contrato antigo (privacidade,
 * ausência de canal de contato, validações da proposta, ficha declarada)
 * continua provado em `DealerSaleOpportunityDetail.test.tsx` — repetir aquelas
 * asserções aqui criaria duas listas para manter alinhadas à mão.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A ARMADILHA QUE ESTE ARQUIVO EVITA DE PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════════
 * O portão do §64 pede "sidebar removida somente no detalhe". Um teste que só
 * exercitasse `isFocusModeRoute` provaria que a FUNÇÃO responde certo — e
 * continuaria verde se alguém esquecesse de chamá-la no shell.
 *
 * Por isso há dois níveis: a tabela de casos da função E a montagem do shell
 * real nas duas rotas, procurando o `<aside>` no DOM. O segundo é o que prova
 * ALCANCE.
 */

let currentSearch = "";
let currentPathname = "/dashboard-loja/oportunidades/veiculos/1";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => currentPathname,
}));

const fetchSaleOpportunity = vi.fn();
const submitSaleOffer = vi.fn();

vi.mock("@/lib/sale-requests/dealer-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/dealer-api")>();
  return {
    ...actual,
    fetchSaleOpportunity: (...args: unknown[]) => fetchSaleOpportunity(...args),
    submitSaleOffer: (...args: unknown[]) => submitSaleOffer(...args),
  };
});

const EVALUATION: DealerVehicleEvaluation = {
  tire_condition: "good",
  financing_status: "no",
  financing_balance: null,
  fines_status: "no",
  fines_amount: null,
  ipva_status: "paid",
  ipva_amount_due: null,
  licensing_status: "ok",
  caution_report_status: "approved",
  auction_history: "no",
  collision_history: "no",
  engine_condition: "ok",
  engine_notes: null,
  gearbox_condition: "ok",
  gearbox_notes: null,
  suspension_condition: "ok",
  suspension_notes: null,
  body_paint_status: "none",
  body_paint_issues: null,
  body_paint_notes: null,
};

function makeDetail(overrides: Partial<Detail> = {}): Detail {
  return {
    id: 1,
    brand: "BYD",
    brand_slug: "byd",
    model: "Dolphin",
    model_slug: "dolphin",
    fipe_model_description: "Dolphin Plus (Elétrico)",
    year: 2024,
    mileage: 42000,
    transmission: "automatico",
    fuel_type: "eletrico",
    declared_condition: "bom",
    evaluation: EVALUATION,
    minimum_accepted_price: "62500.00",
    fipe_reference_value: "74200.00",
    fipe_reference_at: "2026-05-01T00:00:00.000Z",
    image: "https://cdn.example.com/1.webp",
    images: [
      "https://cdn.example.com/1.webp",
      "https://cdn.example.com/2.webp",
      "https://cdn.example.com/3.webp",
      "https://cdn.example.com/4.webp",
    ],
    known_issues: null,
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    status: "receiving_offers",
    created_at: new Date().toISOString(),
    current_highest_offer: null,
    my_offer: null,
    is_leading: false,
    offers_count: 0,
    is_selected: false,
    selected_amount: null,
    selected_at: null,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = "";
  currentPathname = "/dashboard-loja/oportunidades/veiculos/1";
  fetchSaleOpportunity.mockResolvedValue(makeDetail());
});

afterEach(cleanup);

// ============================================================================
describe("§4 — a sidebar sai NO DETALHE, e continua no resto do painel", () => {
  const shell = (children: React.ReactNode = <p>conteúdo</p>) => (
    <AccountPanelShell
      basePath="/dashboard-loja"
      variant="lojista"
      userName="Loja Teste"
      accountLabel="CNPJ · Lojista"
    >
      {children}
    </AccountPanelShell>
  );

  it("o predicado distingue o DETALHE da listagem e das demais telas", () => {
    // Detalhe → foco.
    expect(isOpportunityDetailPath("/dashboard-loja/oportunidades/veiculos/42", "/dashboard-loja")).toBe(true);
    // Barra final não muda a rota.
    expect(isOpportunityDetailPath("/dashboard-loja/oportunidades/veiculos/42/", "/dashboard-loja")).toBe(true);

    // A LISTAGEM não entra em foco: ela não foi redesenhada nesta fase, e sem
    // menu o lojista ficaria sem saída de uma tela de navegação.
    expect(isOpportunityDetailPath("/dashboard-loja/oportunidades/veiculos", "/dashboard-loja")).toBe(false);

    for (const path of [
      "/dashboard-loja",
      "/dashboard-loja/oportunidades",
      "/dashboard-loja/oportunidades/compradores/9",
      "/dashboard-loja/meus-anuncios",
      "/dashboard-loja/dados",
      "/dashboard-loja/mensagens",
      "/dashboard-loja/plano",
      "/dashboard-loja/suporte",
      // Um segmento a mais é OUTRA tela — uma subpágina futura decide por si.
      "/dashboard-loja/oportunidades/veiculos/42/historico",
      // Painel do particular, mesma rota relativa: o basePath não casa.
      "/dashboard/oportunidades/veiculos/42",
    ]) {
      expect(isFocusModeRoute(path, "/dashboard-loja"), path).toBe(false);
    }
  });

  it("ALCANCE — o shell montado no detalhe não renderiza a barra lateral", () => {
    currentPathname = "/dashboard-loja/oportunidades/veiculos/1";
    const { container } = render(shell());

    // O `<aside>` é a barra. Ausente do DOM, não apenas escondido por CSS: o
    // cartão de plano e o contador de notificações que vivem lá dentro fariam
    // duas requests para uma tela que não mostra nenhum dos dois.
    expect(container.querySelector("aside")).toBeNull();
    expect(screen.queryByText("Meu plano")).toBeNull();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(container.querySelector('[data-panel-mode="focus"]')).not.toBeNull();
    // O conteúdo continua lá — foco não é tela em branco.
    expect(screen.getByText("conteúdo")).toBeTruthy();
  });

  it("ALCANCE — nas telas de dashboard a barra continua exatamente como estava", () => {
    for (const path of ["/dashboard-loja", "/dashboard-loja/oportunidades/veiculos"]) {
      cleanup();
      currentPathname = path;
      const { container } = render(shell());

      expect(container.querySelector("aside"), path).not.toBeNull();
      expect(container.querySelector('[data-panel-mode="focus"]'), path).toBeNull();
    }
  });
});

// ============================================================================
describe("§8/§9 — cabeçalho da página e identidade do veículo", () => {
  it("volta para oportunidades e preserva a loja escolhida na URL", async () => {
    currentSearch = "loja=100";
    render(<DealerSaleOpportunityDetail id="1" />);

    const back = await screen.findByTestId("dealer-detail-back");
    expect(back.textContent).toContain("Voltar para oportunidades");
    expect(back.getAttribute("href")).toBe("/dashboard-loja/oportunidades/veiculos?loja=100");
  });

  it("o veículo aparece com selo, versão e metadados reais", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getByText("BYD Dolphin 2024")).toBeTruthy();
    expect(screen.getByText("Dolphin Plus (Elétrico)")).toBeTruthy();
    expect(screen.getByText("Particular")).toBeTruthy();
    expect(screen.getByText("Recebendo propostas")).toBeTruthy();
  });
});

// ============================================================================
describe("§10 a §12 — a galeria não corta o veículo", () => {
  it("a foto principal usa CONTAIN sobre um fundo da própria imagem", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const photo = await screen.findByTestId("dealer-detail-main-photo");

    /*
      A asserção é sobre a CLASSE de ajuste, e é o coração do §12: `object-cover`
      numa moldura fixa descarta as bordas da foto, e é assim que um carro
      encostado na lateral do quadro some. `object-contain` mostra o veículo
      inteiro em qualquer proporção de origem.

      Presença no DOM não bastaria aqui: a foto do card antigo também estava
      renderizada o tempo todo — o que estava errado era como ela era ajustada.
    */
    expect(photo.className).toContain("object-contain");
    expect(photo.className).not.toContain("object-cover");

    // A camada de fundo existe, é `cover` + `blur` e NÃO é anunciada duas vezes.
    const gallery = screen.getByTestId("dealer-detail-gallery");
    const backdrop = gallery.querySelector('img[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain("object-cover");
    expect(backdrop?.className).toContain("blur");
    expect(backdrop?.getAttribute("alt")).toBe("");
  });

  it("contador, setas e teclado navegam pelas fotos", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    expect(screen.getByTestId("dealer-detail-photo-counter").textContent).toContain("1 / 4");

    await userEvent.click(screen.getByTestId("dealer-detail-next"));
    expect(screen.getByTestId("dealer-detail-photo-counter").textContent).toContain("2 / 4");

    // Circular: da primeira para trás cai na última.
    await userEvent.click(screen.getByTestId("dealer-detail-prev"));
    await userEvent.click(screen.getByTestId("dealer-detail-prev"));
    expect(screen.getByTestId("dealer-detail-photo-counter").textContent).toContain("4 / 4");

    // Teclado (§44): a moldura tem foco e responde às setas.
    const frame = screen.getByRole("group", { name: /Fotos de BYD Dolphin 2024/ });
    frame.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("dealer-detail-photo-counter").textContent).toContain("1 / 4");
  });

  it("as setas têm nome acessível e cada foto tem alt numerado", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    expect(screen.getByLabelText("Foto anterior")).toBeTruthy();
    expect(screen.getByLabelText("Próxima foto")).toBeTruthy();
    expect(screen.getByTestId("dealer-detail-main-photo").getAttribute("alt")).toBe(
      "BYD Dolphin 2024 — foto 1 de 4"
    );
  });

  it("com muitas fotos, as miniaturas NÃO são espremidas: sobra um '+N' que revela o resto", async () => {
    const images = Array.from({ length: 18 }, (_, i) => `https://cdn.example.com/${i}.webp`);
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ images }));

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    // 7 miniaturas + o botão "+11" = as 8 posições da faixa.
    expect(screen.getAllByTestId("dealer-detail-thumb")).toHaveLength(7);
    const more = screen.getByTestId("dealer-detail-thumb-more");
    expect(more.textContent).toContain("+11");

    // E o "+N" FAZ alguma coisa: um contador decorativo esconderia onze fotos
    // atrás de um número e faria o lojista achar que a galeria acabou.
    await userEvent.click(more);
    expect(screen.getAllByTestId("dealer-detail-thumb")).toHaveLength(18);
    expect(screen.queryByTestId("dealer-detail-thumb-more")).toBeNull();
  });

  it("uma foto só: sem setas, sem faixa de miniaturas", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ images: ["https://cdn.example.com/1.webp"] })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    expect(screen.queryByTestId("dealer-detail-next")).toBeNull();
    expect(screen.queryByTestId("dealer-detail-thumb-strip")).toBeNull();
    expect(screen.getByTestId("dealer-detail-photo-counter").textContent).toContain("1 / 1");
  });
});

// ============================================================================
describe("§13/§14 — informações do veículo, e o que NÃO entra nelas", () => {
  it("mostra os cinco dados que existem", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const card = await screen.findByTestId("dealer-detail-vehicle-info");

    expect(card.textContent).toContain("Ano");
    expect(card.textContent).toContain("2024");
    expect(card.textContent).toContain("42.000 km");
    expect(card.textContent).toContain("Elétrico");
    expect(card.textContent).toContain("Automático");
    expect(card.textContent).toContain("Atibaia - SP");
  });

  it("§46 — nem placa, nem chassi, nem portas, nem cor", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    /*
      A referência visual desta fase mostra os quatro. Placa e chassi são PII e o
      §46 os proíbe; portas e cor simplesmente não existem no contrato, e
      derivá-los da descrição FIPE seria adivinhação apresentada como declaração
      do proprietário.

      A varredura é no documento inteiro, e não no cartão: o risco é alguém
      acrescentar o dado em OUTRO lugar da página achando que só a ficha estava
      protegida.
    */
    const text = (document.body.textContent ?? "").toLowerCase();
    for (const term of ["placa", "chassi", "renavam"]) {
      expect(text, `PII na tela: ${term}`).not.toContain(term);
    }
  });
});

// ============================================================================
describe("§22/§23/§55 — o valor mínimo é o número principal da negociação", () => {
  it("§53 — o piso aparece com destaque, e nunca como travessão", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const block = await screen.findByTestId("dealer-detail-minimum");

    expect(block.textContent).toContain("Valor mínimo do vendedor");
    expect(within(block).getByTestId("dealer-offer-minimum").textContent).toMatch(/62\.500,00/);

    // §64 — sem traço no lugar do mínimo, e sem zero.
    expect(block.textContent).not.toContain("—");
    expect(block.textContent).not.toMatch(/R\$\s?0,00/);

    // §23 — e nunca com um rótulo que sugira outra coisa.
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Última avaliação");
    expect(text).not.toContain("Preço estimado");
  });

  it("§55 — legado sem piso diz 'Não informado', nunca zero nem travessão", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ minimum_accepted_price: null }));
    render(<DealerSaleOpportunityDetail id="1" />);

    const block = await screen.findByTestId("dealer-detail-minimum");
    expect(block.textContent).toContain("Não informado");
    expect(block.textContent).not.toMatch(/R\$\s?0,00/);
    // O VALOR não existe; o bloco, sim. Sumir com ele faria a pergunta mais
    // importante da coluna desaparecer sem explicação.
    expect(screen.queryByTestId("dealer-offer-minimum")).toBeNull();
  });
});

// ============================================================================
describe("§26/§27 — a disputa, sem identidade e sem zero", () => {
  it("sem ofertas, as duas ausências são frases distintas", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const panel = await screen.findByTestId("dealer-offer-panel");

    expect(panel.textContent).toContain("Nenhuma oferta recebida ainda.");
    expect(panel.textContent).toContain("Você ainda não fez uma oferta.");
    expect(panel.textContent).not.toMatch(/R\$\s?0,00/);
  });

  it("liderando: o aviso é discreto e não nomeia ninguém", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        current_highest_offer: "60000.00",
        my_offer: "60000.00",
        is_leading: true,
        offers_count: 2,
      })
    );
    render(<DealerSaleOpportunityDetail id="1" />);

    const standing = await screen.findByTestId("dealer-offer-standing");
    expect(standing.textContent).toContain("Você está liderando");
    expect(standing.textContent).not.toMatch(/loja|dealer|concorrente|itmotors/i);
  });

  it("superado: mostra o valor a bater, e continua sem revelar quem", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        current_highest_offer: "60000.00",
        my_offer: "59000.00",
        is_leading: false,
        offers_count: 3,
      })
    );
    render(<DealerSaleOpportunityDetail id="1" />);

    const panel = await screen.findByTestId("dealer-offer-panel");
    expect(panel.textContent).toMatch(/60\.000,00/);
    expect(panel.textContent).toMatch(/59\.000,00/);
    expect(screen.getByTestId("dealer-offer-standing").textContent).toContain(
      "Existe uma proposta maior"
    );
  });
});

// ============================================================================
describe("§28/§29/§36 — o formulário de oferta", () => {
  it("§29 — o CTA é 'Fazer oferta', o mesmo nome do card do feed", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const submit = await screen.findByTestId("dealer-offer-submit");

    expect(submit.textContent).toContain("Fazer oferta");
    // Um único nome para a ação em toda a experiência (§29).
    expect(document.body.textContent).not.toContain("Enviar oferta");
  });

  it("§28 — prefixo R$ fora do campo e placeholder de exemplo", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const input = (await screen.findByTestId("dealer-offer-amount")) as HTMLInputElement;

    expect(input.getAttribute("placeholder")).toBe("Ex.: 62.500,00");
    // O símbolo é do invólucro, não do valor: digitar não deve produzir
    // "R$ R$ 62.500,00".
    await userEvent.type(input, "6250000");
    expect(input.value).toBe("62.500,00");
  });

  it("§28 — os atalhos continuam apenas PREENCHENDO, sem enviar", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ current_highest_offer: "60000.00", offers_count: 1 })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.click(screen.getByTestId("dealer-offer-bump-2000"));

    expect((screen.getByTestId("dealer-offer-amount") as HTMLInputElement).value).toBe(
      "62.000,00"
    );
    expect(submitSaleOffer).not.toHaveBeenCalled();
  });

  it("§36 — a regra do compromisso fica VISÍVEL; o detalhamento, a um clique", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    // O essencial não é escondido: ele está no caminho do olho entre o campo e
    // o botão, sem clique nenhum.
    expect(screen.getByTestId("dealer-offer-commitment").textContent?.length).toBeGreaterThan(20);

    // O resto continua ACESSÍVEL — resumir não é remover (§36).
    expect(screen.queryByTestId("dealer-offer-inspection-notice")).toBeNull();
    await userEvent.click(screen.getByTestId("dealer-offer-terms-toggle"));
    expect(screen.getByTestId("dealer-offer-inspection-notice").textContent?.length).toBeGreaterThan(
      20
    );
  });

  it("§30 — não existe 'Salvar oportunidade': o backend não tem favorito", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(document.body.textContent).not.toContain("Salvar oportunidade");
  });
});

// ============================================================================
describe("§32 a §34 e §56 — a referência de mercado", () => {
  it("§56 — FIPE 74.200 e piso 62.500 → R$ 11.700 e 15,8% abaixo", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-market-reference");

    expect(screen.getByTestId("dealer-detail-fipe-value").textContent).toMatch(/74\.200,00/);
    expect(screen.getByTestId("dealer-detail-fipe-difference").textContent).toMatch(/11\.700,00/);
    expect(screen.getByTestId("dealer-detail-fipe-percent").textContent).toContain("15,8%");
    expect(screen.getByTestId("dealer-detail-fipe-percent").textContent).toContain("abaixo");
    expect(screen.getByTestId("dealer-detail-fipe-badge").textContent).toContain("15,8%");
  });

  it("§34 — a palavra 'margem' (e parentes) não aparece em lugar nenhum", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const term of ["margem", "lucro", "rentabilidade", "ganho potencial"]) {
      expect(text, `métrica financeira não calculada: ${term}`).not.toContain(term);
    }
  });

  it("§20 — nenhum score, nota ou selo de aprovação", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = (document.body.textContent ?? "").toLowerCase();
    for (const term of [
      "atratividade",
      "excelente oportunidade",
      "baixo risco",
      "compra segura",
      "veículo verificado",
      "laudo aprovado pela plataforma",
    ]) {
      expect(text, `julgamento sem algoritmo: ${term}`).not.toContain(term);
    }
  });

  it("piso ausente: a FIPE continua, a comparação some e diz por quê", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ minimum_accepted_price: null }));
    render(<DealerSaleOpportunityDetail id="1" />);

    const card = await screen.findByTestId("dealer-detail-market-reference");
    expect(within(card).getByTestId("dealer-detail-fipe-value").textContent).toMatch(/74\.200,00/);
    expect(screen.queryByTestId("dealer-detail-fipe-difference")).toBeNull();
    expect(card.textContent).toContain("não informou o valor mínimo");
  });

  it("§35 — o aviso de segurança está na tela, curto", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const notice = await screen.findByTestId("dealer-detail-safety-notice");

    expect(notice.textContent).toContain("Avalie com atenção");
    expect(notice.textContent).toContain("laudo cautelar");
  });
});

// ============================================================================
describe("§33 — a conta da FIPE, nos cinco cenários", () => {
  it("FIPE acima do piso → diferença positiva, abaixo da FIPE", () => {
    expect(fipeComparison("74200.00", "62500.00")).toEqual({
      amount: "11700.00",
      percent: 15.8,
      belowFipe: true,
    });
  });

  it("FIPE igual ao piso → zero, e ainda assim 'não está acima'", () => {
    expect(fipeComparison("62500.00", "62500.00")).toEqual({
      amount: "0.00",
      percent: 0,
      belowFipe: true,
    });
  });

  it("FIPE abaixo do piso → o sinal inverte", () => {
    expect(fipeComparison("60000.00", "66000.00")).toEqual({
      amount: "6000.00",
      percent: 10,
      belowFipe: false,
    });
  });

  it("FIPE ausente → null, e não zero", () => {
    expect(fipeComparison(null, "62500.00")).toBeNull();
    expect(fipeComparison("", "62500.00")).toBeNull();
  });

  it("piso ausente → null", () => {
    expect(fipeComparison("74200.00", null)).toBeNull();
  });

  it("FIPE zero não vira divisão por zero", () => {
    expect(fipeComparison("0.00", "62500.00")).toBeNull();
  });

  it("centavos entram inteiros na conta, sem erro de ponto flutuante", () => {
    expect(fipeComparison("74200.10", "62500.05")?.amount).toBe("11700.05");
  });
});

// ============================================================================
describe("§19/§20 — pontos para avaliar: fatos, nunca julgamento", () => {
  const base = { mileage: 40000, images: ["a", "b", "c", "d"], evaluation: EVALUATION };

  it("veículo sem nada a apontar não gera lista (e não ganha selo de aprovado)", () => {
    expect(buildReviewPoints(base)).toEqual([]);
  });

  it("o limiar de quilometragem é o declarado, e é inclusivo", () => {
    expect(buildReviewPoints({ ...base, mileage: HIGH_MILEAGE_KM - 1 })).toEqual([]);
    expect(buildReviewPoints({ ...base, mileage: HIGH_MILEAGE_KM })[0].id).toBe("mileage");
    expect(buildReviewPoints({ ...base, mileage: HIGH_MILEAGE_KM })[0].label).toContain(
      "150.000 km"
    );
  });

  it("poucas fotos é uma afirmação sobre a INFORMAÇÃO, não sobre o carro", () => {
    const few = buildReviewPoints({ ...base, images: ["a", "b"] });
    expect(few.map((p) => p.id)).toContain("photos");
    expect(few.find((p) => p.id === "photos")?.label).toBe("Poucas fotos disponíveis (2)");

    expect(
      buildReviewPoints({ ...base, images: Array(FEW_PHOTOS_THRESHOLD).fill("x") }).map((p) => p.id)
    ).not.toContain("photos");

    expect(buildReviewPoints({ ...base, images: [] }).find((p) => p.id === "photos")?.label).toBe(
      "Nenhuma foto disponível"
    );
  });

  it("§16 — ausência de laudo, 'não sei' e 'não possui' produzem a MESMA frase", () => {
    for (const value of [null, "unknown", "not_available"] as const) {
      const points = buildReviewPoints({
        ...base,
        evaluation: { ...EVALUATION, caution_report_status: value },
      });
      expect(points.map((p) => p.label), String(value)).toContain("Sem laudo cautelar informado");
    }

    // Laudo COM resultado não vira alerta: ele está na ficha, com o resultado.
    // Transformar "aprovado" em ponto de atenção seria mentir sobre a leitura.
    expect(
      buildReviewPoints({
        ...base,
        evaluation: { ...EVALUATION, caution_report_status: "approved" },
      })
    ).toEqual([]);
  });

  it("declarações de risco viram pontos; declarações neutras, não", () => {
    const points = buildReviewPoints({
      ...base,
      evaluation: {
        ...EVALUATION,
        auction_history: "yes",
        collision_history: "yes",
        financing_status: "yes",
        tire_condition: "replace_now",
        engine_condition: "issue",
      },
    });

    // Sem "caution-report": a base declara laudo APROVADO, e um laudo com
    // resultado não vira alerta. A ordem é fixa e vem do módulo.
    expect(points.map((p) => p.id)).toEqual([
      "auction",
      "collision",
      "financing",
      "tires",
      "engine",
    ]);
    // Cada frase diz DE ONDE vem a afirmação.
    expect(points.find((p) => p.id === "collision")?.label).toContain("declarado pelo proprietário");
  });

  it("nenhum ponto é elogio — a lista só cresce com o que merece um segundo olhar", () => {
    const points = buildReviewPoints({
      ...base,
      mileage: 200000,
      images: ["a"],
      evaluation: { ...EVALUATION, auction_history: "yes" },
    });

    const labels = points.map((p) => p.label.toLowerCase()).join(" ");
    for (const term of ["excelente", "ótim", "boa oportunidade", "recomend", "seguro"]) {
      expect(labels, term).not.toContain(term);
    }
  });
});

// ============================================================================
describe("§18 — observações do vendedor", () => {
  it("o texto real aparece inteiro, sem resumo e sem 'ver mais'", async () => {
    const note = "Único dono.\nRevisões em concessionária.\nPneus com 60% de vida útil.";
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ known_issues: note }));

    render(<DealerSaleOpportunityDetail id="1" />);
    const block = await screen.findByTestId("dealer-detail-known-issues");

    expect(block.textContent).toBe(note);
    // Quebras preservadas: o lojista lê como foi escrito.
    expect(block.className).toContain("whitespace-pre-line");
  });

  it("vazio é dito em palavras, e não some da tela", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const empty = await screen.findByTestId("dealer-detail-known-issues-empty");

    expect(empty.textContent).toContain("Nenhuma observação adicional informada.");
  });
});
