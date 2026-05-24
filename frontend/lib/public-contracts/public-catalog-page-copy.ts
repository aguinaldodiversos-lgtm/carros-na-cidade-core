/**
 * Copy oficial de títulos/subtítulos por variant pública — briefing P2 2026-05-25.
 *
 * Antes: cada page.tsx inventava H1/H2/description com format próprio.
 * Resultado: divergência (uma rota diz "Carros usados em X", outra diz
 * "Comprar carros em X"; FIPE diz "Tabela FIPE em X" mas título da aba
 * é "Consulte o valor"). Para o usuário/SEO, essas variações poluem
 * sinal local.
 *
 * Centralizar aqui não força mudança visual — só dá uma fonte de
 * verdade. Cada variant retorna { title, subtitle, metaTitle?,
 * metaDescription? }; caller decide o que renderiza.
 *
 * `metaTitle`/`metaDescription` são opcionais — quando presentes, devem
 * ir para `<head>` via `generateMetadata`. Quando ausentes, page faz
 * a sua composição própria (ex.: catálogo com filtros refina o título).
 */

export type CatalogPageVariant =
  | "home"
  | "state"
  | "city"
  | "region"
  | "fipe"
  | "simulator"
  | "anunciar";

export interface CatalogPageCopyContext {
  /** Nome humano do território/contexto (ex.: "São Paulo", "Atibaia"). */
  label?: string | null;
  /** UF (2 letras) — usado em metadata. */
  uf?: string | null;
}

export interface CatalogPageCopy {
  title: string;
  subtitle: string;
  metaTitle?: string;
  metaDescription?: string;
}

function safeLabel(label?: string | null): string {
  return typeof label === "string" && label.trim() ? label.trim() : "";
}

export function publicCatalogPageCopy(
  variant: CatalogPageVariant,
  context: CatalogPageCopyContext = {}
): CatalogPageCopy {
  const label = safeLabel(context.label);
  const uf = safeLabel(context.uf).toUpperCase();

  switch (variant) {
    case "home":
      return {
        title: "Carros usados perto de você",
        subtitle: "Marketplace automotivo regional — comprar, vender e financiar.",
        metaTitle: "Carros na Cidade | Marketplace automotivo regional",
        metaDescription:
          "Encontre carros usados na sua cidade e região. Anúncios verificados, ofertas locais, FIPE e simulador de financiamento.",
      };

    case "state":
      return {
        title: label ? `Carros usados em ${label}` : "Carros usados no estado",
        subtitle: label
          ? `Vitrine estadual — explore anúncios em todas as cidades de ${label}.`
          : "Explore anúncios em todas as cidades do estado.",
        metaTitle: label
          ? `Catálogo de veículos em ${label} | Comprar`
          : "Comprar carros | Carros na Cidade",
        metaDescription: label
          ? `Catálogo de veículos em ${label}: explore anúncios do estado inteiro e refine pela sua cidade no Carros na Cidade.`
          : "Catálogo de veículos brasileiros — anúncios reais, filtros locais.",
      };

    case "city":
      return {
        title: label ? `Carros usados em ${label}` : "Carros usados na cidade",
        subtitle: "Ofertas locais com contato direto do anunciante.",
        metaTitle: label
          ? `Carros usados em ${label}${uf ? ` - ${uf}` : ""} | Comprar`
          : "Comprar carros usados | Carros na Cidade",
      };

    case "region":
      return {
        title: label ? `Carros usados em ${label} e região` : "Carros usados na região",
        subtitle: "Veja ofertas na cidade e em municípios vizinhos.",
        metaTitle: label
          ? `Carros usados em ${label} e região | Carros na Cidade`
          : "Carros usados na região",
      };

    case "fipe":
      return {
        title: label ? `Tabela FIPE em ${label}` : "Tabela FIPE",
        subtitle: "Consulte o valor de referência e compare com anúncios reais na sua cidade.",
        metaTitle: label
          ? `Tabela FIPE em ${label} | Consulte o valor do seu veículo`
          : "Tabela FIPE | Carros na Cidade",
      };

    case "simulator":
      return {
        title: label
          ? `Simule o financiamento do seu carro em ${label}`
          : "Simule o financiamento do seu carro",
        subtitle:
          "Estimativa de parcelas. Os valores finais dependem da aprovação de crédito da instituição financeira.",
        metaTitle: label
          ? `Simule o financiamento do seu carro em ${label}`
          : "Simulador de financiamento | Carros na Cidade",
      };

    case "anunciar":
      return {
        title: "Anuncie seu carro",
        subtitle: "Publique gratuitamente, fale com compradores reais da sua região.",
        metaTitle: "Anuncie seu carro | Carros na Cidade",
        metaDescription:
          "Publique seu veículo no Carros na Cidade com presença regional, FIPE, contato direto via WhatsApp e ferramentas para particular e lojista.",
      };

    default:
      return { title: "Carros na Cidade", subtitle: "Marketplace automotivo regional." };
  }
}
