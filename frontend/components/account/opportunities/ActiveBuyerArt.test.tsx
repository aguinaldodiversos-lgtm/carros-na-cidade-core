// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ActiveBuyerArt, { ART_BODY_TYPES, resolveArtBodyType } from "./ActiveBuyerArt";
import ActiveBuyerCard from "./ActiveBuyerCard";
import {
  artBodyTypeFor,
  describeOpportunityCriteria,
  describeOpportunityTitle,
  formatBudgetParts,
  inferBodyTypeFromModel,
  type DealerOpportunity,
} from "@/lib/purchase-intents/api";

/**
 * A ilustração e o card de comprador ativo.
 *
 * Este arquivo trava as três coisas que separam esta tela de um catálogo de
 * anúncios: a figura é ILUSTRATIVA (nunca foto), ela não promete uma carroceria
 * que o comprador não declarou, e vinte cópias na mesma página não colidem entre
 * si por causa de `id` de gradiente.
 */

function makeOpportunity(overrides: Partial<DealerOpportunity> = {}): DealerOpportunity {
  return {
    id: 1,
    intent_type: "specific_model",
    brand: "Volkswagen",
    model: "Gol",
    body_type: null,
    transmission: "manual",
    max_price: "55000.00",
    purchase_timeframe: "within_30_days",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    ...overrides,
  };
}

/**
 * `Intl.NumberFormat` com BRL separa "R$" do número com NBSP (U+00A0), não com
 * espaço comum. `toHaveTextContent` normaliza espaço e esconde a diferença;
 * `toBe` não — e uma asserção com espaço comum falha exibindo duas strings
 * visualmente IDÊNTICAS, que é o pior diagnóstico possível.
 *
 * Normalizar aqui, e não na fonte, é deliberado: o NBSP é o comportamento certo
 * na tela (impede "R$" de quebrar para a linha de cima do número).
 */
const plain = (value: string) => value.replace(/[\u00A0\u202F]/g, " ");

afterEach(cleanup);

describe("a figura é ILUSTRAÇÃO, nunca fotografia", () => {
  it("não existe <img>, nem background-image, nem URL de foto no card", () => {
    render(<ActiveBuyerCard opportunity={makeOpportunity()} basePath="/dashboard-loja" />);
    const card = screen.getByTestId("active-buyer-card");

    /*
      Uma foto de um Gol 2020 vermelho no card de quem procura "Volkswagen Gol"
      comunicaria quatro coisas falsas: que aquele carro existe, que aquela cor é
      exigida, que aquela geração é exigida e que a configuração é a procurada.

      A ausência é verificada de três formas porque há três maneiras de uma foto
      entrar: `<img>`, `background-image` em style inline, e um `<image>` dentro
      do próprio SVG.
    */
    expect(card.querySelector("img")).toBeNull();
    expect(card.querySelector("image")).toBeNull();
    expect(card.querySelector("picture")).toBeNull();
    expect(card.innerHTML).not.toMatch(/background-image/i);
    expect(card.innerHTML).not.toMatch(/\.(?:jpe?g|png|webp|avif)/i);

    // A ÚNICA URL tolerada é o namespace do próprio SVG. Proibir `https?://`
    // por inteiro reprovaria o `xmlns` e o teste seria afrouxado até não provar
    // mais nada; nomear a exceção mantém a proibição afiada.
    const urls = card.innerHTML.match(/https?:\/\/[^"'\s)]+/gi) ?? [];
    for (const url of urls) {
      expect(url).toBe("http://www.w3.org/2000/svg");
    }
  });

  it("a figura não consome nenhum campo de foto, mesmo se o payload trouxer um", () => {
    render(
      <ActiveBuyerCard
        opportunity={
          {
            ...makeOpportunity(),
            // Campos de outros produtos. O card de procura não tem foto — e não
            // pode passar a ter porque um payload vizinho mudou de forma.
            images: ["https://cdn.example.com/gol.jpg"],
            photos: ["https://cdn.example.com/gol-2.jpg"],
            image_url: "https://cdn.example.com/gol-3.jpg",
          } as unknown as DealerOpportunity
        }
        basePath="/dashboard-loja"
      />
    );

    expect(screen.getByTestId("active-buyer-card").innerHTML).not.toContain("cdn.example.com");
  });

  it("o texto alternativo diz que é ilustração e que representa a CATEGORIA", () => {
    render(<ActiveBuyerArt bodyType="suv" />);
    const art = screen.getByTestId("active-buyer-art");

    // Um alt do tipo "Volkswagen Gol branco" faria por áudio exatamente o que a
    // fotografia faria por imagem.
    expect(art).toHaveAttribute("aria-label", expect.stringContaining("Ilustração da categoria"));
    expect(art.getAttribute("aria-label")).toContain("SUV");
  });
});

describe("a ilustração desenha a categoria DECLARADA — e nunca adivinha", () => {
  it("`open_category` desenha a carroceria que o comprador escolheu", () => {
    for (const bodyType of ["hatch", "sedan", "suv", "picape", "coupe", "minivan", "wagon"]) {
      cleanup();
      render(
        <ActiveBuyerCard
          opportunity={makeOpportunity({
            intent_type: "open_category",
            brand: null,
            model: null,
            body_type: bodyType,
          })}
          basePath="/dashboard-loja"
        />
      );
      expect(screen.getByTestId("active-buyer-art")).toHaveAttribute("data-body-type", bodyType);
    }
  });

  it("`specific_model` infere a carroceria pelo NOME COMERCIAL", () => {
    render(
      <ActiveBuyerCard
        opportunity={makeOpportunity({ brand: "Volkswagen", model: "Gol" })}
        basePath="/dashboard-loja"
      />
    );

    /*
      O modo específico não declara carroceria (o CHECK da tabela obriga
      `body_type` a ser NULL), então a figura é INFERIDA do nome comercial.

      A fase anterior desenhava o genérico aqui, para não apresentar palpite
      nosso como dado do comprador. Ficava honesto e ilegível: numa grade real
      a maioria das procuras é por modelo, e o lojista via a mesma figura
      repetida linha após linha. A inferência é de APRESENTAÇÃO — não vai ao
      banco, não filtra, não participa de matching — e o desconhecido cai no
      genérico em vez de chutar.
    */
    expect(screen.getByTestId("active-buyer-art")).toHaveAttribute("data-body-type", "hatch");
    expect(artBodyTypeFor(makeOpportunity({ brand: "Volkswagen", model: "Gol" }))).toBe("hatch");
  });

  it("a inferência cobre as quatro carrocerias que o lojista separa de relance", () => {
    const cases: Array<[string, string]> = [
      ["Gol", "hatch"],
      ["Argo", "hatch"],
      ["HB20", "hatch"],
      ["Corolla", "sedan"],
      ["Civic", "sedan"],
      ["HR-V", "suv"],
      ["Tracker Premier Turbo 1.0", "suv"],
      ["Compass", "suv"],
      ["Strada", "picape"],
      ["Hilux", "picape"],
      ["Spin", "minivan"],
    ];

    for (const [model, expected] of cases) {
      expect(inferBodyTypeFromModel(model)).toBe(expected);
    }
  });

  it("vence a chave MAIS LONGA: os pares que se contêm dariam a resposta errada", () => {
    /*
      `onix` é hatch e `onix plus` é sedã; `corolla` é sedã e `corolla cross` é
      SUV; `hb20` é hatch e `hb20s` é sedã. Casar pelo primeiro prefixo que
      bate erraria nos três — e erraria em silêncio, desenhando um hatch para
      quem procura um sedã.
    */
    expect(inferBodyTypeFromModel("Onix")).toBe("hatch");
    expect(inferBodyTypeFromModel("Onix Plus 1.0 Turbo")).toBe("sedan");
    expect(inferBodyTypeFromModel("Corolla XEi")).toBe("sedan");
    expect(inferBodyTypeFromModel("Corolla Cross XRE")).toBe("suv");
    expect(inferBodyTypeFromModel("HB20 Comfort")).toBe("hatch");
    expect(inferBodyTypeFromModel("HB20S Evolution")).toBe("sedan");
  });

  it("modelo não mapeado NÃO vira palpite: cai no genérico", () => {
    // Um nome que ninguém mapeou tem de cair na figura neutra. Inventar "SUV"
    // para um desconhecido seria pior do que não afirmar nada.
    expect(inferBodyTypeFromModel("Modelo Que Nao Existe")).toBeNull();
    expect(inferBodyTypeFromModel(null)).toBeNull();
    expect(inferBodyTypeFromModel("")).toBeNull();
    expect(artBodyTypeFor(makeOpportunity({ brand: "Xyz", model: "Zzz 1.0" }))).toBe("generic");
  });

  it("carroceria DECLARADA vence a inferência — dado do comprador manda", () => {
    /*
      Se a procura é de categoria aberta e diz "picape", a figura é picape ainda
      que algum `model` viesse junto. O declarado nunca é sobrescrito por
      heurística nossa.
    */
    expect(
      artBodyTypeFor({
        intent_type: "open_category",
        body_type: "picape",
        model: "Corolla",
      })
    ).toBe("picape");
  });

  it("carroceria desconhecida não some: cai no genérico", () => {
    // O vocabulário vem de `ads.canonical.constants.js` e pode crescer no banco
    // antes de crescer aqui. Um card sem figura mudaria de altura e torceria a
    // linha do grid.
    expect(resolveArtBodyType("conversivel")).toBe("generic");
    expect(resolveArtBodyType(null)).toBe("generic");
    expect(resolveArtBodyType("")).toBe("generic");
  });
});

describe("IDs de gradiente não colidem entre cópias na mesma página", () => {
  it("vinte cards → zero `id` repetido no documento", () => {
    const items = Array.from({ length: 20 }, (_, index) =>
      makeOpportunity({
        id: index + 1,
        intent_type: index % 2 === 0 ? "specific_model" : "open_category",
        brand: index % 2 === 0 ? "Volkswagen" : null,
        model: index % 2 === 0 ? "Gol" : null,
        body_type: index % 2 === 0 ? null : ART_BODY_TYPES[index % 7],
      })
    );

    const { container } = render(
      <ul>
        {items.map((item) => (
          <ActiveBuyerCard key={item.id} opportunity={item} basePath="/dashboard-loja" />
        ))}
      </ul>
    );

    /*
      `id` em SVG é global ao DOCUMENTO. Com um prefixo fixo, as vinte lupas
      teriam `id="lens"` e o navegador resolveria `url(#lens)` pela PRIMEIRA
      ocorrência — todas passariam a pintar com o gradiente da primeira.

      O sintoma seria um degradê levemente errado, sem um único aviso no
      console. Por isso a prova é de UNICIDADE, e não de aparência.
    */
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo `url(#…)` aponta para um id que existe DENTRO do mesmo SVG", () => {
    const { container } = render(
      <ul>
        <ActiveBuyerCard opportunity={makeOpportunity({ id: 1 })} basePath="/x" />
        <ActiveBuyerCard opportunity={makeOpportunity({ id: 2 })} basePath="/x" />
      </ul>
    );

    for (const svg of container.querySelectorAll("svg")) {
      const own = new Set([...svg.querySelectorAll("[id]")].map((node) => node.id));
      const referenced = [...svg.innerHTML.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]);

      for (const reference of referenced) {
        // Referência que vaza para outro SVG é exatamente a colisão que o teste
        // acima previne — aqui a checagem é por CONTINÊNCIA, não por unicidade.
        expect(own.has(reference)).toBe(true);
      }
    }
  });

  it("o identificador não carrega os dois-pontos do React", () => {
    const { container } = render(<ActiveBuyerArt bodyType="suv" />);
    for (const node of container.querySelectorAll("[id]")) {
      // `url(#:r3:-lens)` é legal em HTML mas quebra `querySelector` e qualquer
      // CSS que venha a apontar para o gradiente.
      expect(node.id).not.toContain(":");
    }
  });
});

describe("campos nulos não viram lixo na tela", () => {
  it("sem critério declarado, a LINHA some — não vira separador órfão", () => {
    render(
      <ActiveBuyerCard
        opportunity={
          {
            ...makeOpportunity(),
            transmission: null,
            purchase_timeframe: null,
          } as unknown as DealerOpportunity
        }
        basePath="/dashboard-loja"
      />
    );

    const card = screen.getByTestId("active-buyer-card");
    expect(screen.queryByTestId("active-buyer-criteria")).not.toBeInTheDocument();

    // Nada de "undefined", "null", "•" solto ou "Não informado • Não informado".
    const text = card.textContent || "";
    expect(text).not.toMatch(/undefined|null|NaN/);
    expect(text).not.toMatch(/•\s*•/);
    expect(text).not.toMatch(/^\s*•|•\s*$/);
    expect(text).not.toMatch(/Não informado/);
  });

  it("um critério só não deixa marcador pendurado", () => {
    expect(describeOpportunityCriteria({ transmission: "manual", purchase_timeframe: null })).toBe(
      "Manual"
    );
    expect(
      describeOpportunityCriteria({ transmission: null, purchase_timeframe: "within_7_days" })
    ).toBe("Em até 7 dias");
    expect(describeOpportunityCriteria({ transmission: null, purchase_timeframe: null })).toBe("");
  });

  it("sem orçamento utilizável, o card diz a frase neutra — nunca 'R$ 0'", () => {
    render(
      <ActiveBuyerCard
        opportunity={makeOpportunity({ max_price: "0.00" })}
        basePath="/dashboard-loja"
      />
    );

    const budget = screen.getByTestId("active-buyer-budget");
    expect(budget).toHaveTextContent("Sem orçamento definido");
    expect(budget.textContent || "").not.toMatch(/R\$\s*0/);
  });

  it("cidade e data ausentes somem em vez de renderizar vazio", () => {
    render(
      <ActiveBuyerCard
        opportunity={
          {
            ...makeOpportunity(),
            city: null,
            created_at: "não é data",
          } as unknown as DealerOpportunity
        }
        basePath="/dashboard-loja"
      />
    );

    expect(screen.queryByTestId("active-buyer-city")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-buyer-published")).not.toBeInTheDocument();
    // E o card continua com título e CTA — não fica um retângulo mudo.
    expect(screen.getByTestId("active-buyer-title")).toHaveTextContent("Volkswagen Gol");
    expect(screen.getByTestId("active-buyer-cta")).toBeVisible();
  });
});

describe("o orçamento é TETO, e o texto diz isso", () => {
  it("'Até' acompanha o número, e a palavra 'preço' não aparece", () => {
    render(<ActiveBuyerCard opportunity={makeOpportunity()} basePath="/dashboard-loja" />);
    const card = screen.getByTestId("active-buyer-card");

    expect(within(card).getByTestId("active-buyer-budget")).toHaveTextContent("Até");
    expect(within(card).getByTestId("active-buyer-budget")).toHaveTextContent("R$ 55.000");

    // O comprador declarou capacidade, não precificou um carro. Chamar isso de
    // "preço" faria o lojista ler o número como avaliação já feita.
    expect(card.textContent || "").not.toMatch(/pre[çc]o|valor do ve[íi]culo/i);
  });

  it("`formatBudgetParts` separa prefixo e número, e nunca devolve zero", () => {
    const parts = formatBudgetParts("55000.00");
    expect(parts.prefix).toBe("Até");
    expect(plain(parts.value ?? "")).toBe("R$ 55.000");
    expect(parts.fallback).toBe("");
    expect(formatBudgetParts(null).value).toBeNull();
    expect(formatBudgetParts("0").value).toBeNull();
    expect(formatBudgetParts("abc").value).toBeNull();
  });
});

describe("títulos dos dois modos REAIS", () => {
  it("compra específica: marca e modelo, sem ano inventado", () => {
    expect(
      describeOpportunityTitle({
        intent_type: "specific_model",
        brand: "Volkswagen",
        model: "Gol",
        max_price: "55000.00",
      })
    ).toBe("Volkswagen Gol");
  });

  it("categoria aberta: carroceria + teto, sem modelo inventado", () => {
    const title = describeOpportunityTitle({
      intent_type: "open_category",
      body_type: "suv",
      max_price: "90000.00",
    });

    expect(plain(title)).toBe("SUV até R$ 90.000");
    // Nenhum nome de modelo entra num modo que não declarou nenhum.
    expect(title).not.toMatch(/Corolla|HR-V|Gol|Strada/);
  });

  it("nunca devolve título vazio: um card mudo é pior que um rótulo genérico", () => {
    expect(
      describeOpportunityTitle({ intent_type: "specific_model", brand: null, model: null })
    ).toBe("Modelo específico");
    expect(
      describeOpportunityTitle({ intent_type: "open_category", body_type: null, max_price: null })
    ).toBe("Categoria aberta");
  });
});
