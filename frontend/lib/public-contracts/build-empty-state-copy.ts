/**
 * Copy padronizada de empty states públicos — briefing P2 2026-05-25.
 *
 * Substitui strings ad-hoc espalhadas em `FinancingLandingPageClient`
 * ("Ainda não há ofertas carregadas para X. Volte em breve."),
 * `BlogPostPageClient` ("Conteúdo completo em breve") e empty states
 * variados nos catálogos. Garante:
 *
 *   - tom consistente (neutro, sem promessa)
 *   - sem "em breve" técnico
 *   - sem "backend"/"placeholder"/strings internas
 *
 * Variantes cobrem todos os caminhos zero-result da vitrine. Cada
 * variante retorna { title, body, cta? } — caller renderiza o que
 * couber no layout (alguns lugares só mostram body curto).
 */

export type EmptyStateVariant =
  | "city-no-ads"
  | "region-no-ads"
  | "state-no-ads"
  | "search-no-results"
  | "filters-no-results"
  | "detail-not-found";

export interface EmptyStateContext {
  /** Nome humano do território/contexto (ex.: "Atibaia", "São Paulo"). */
  label?: string | null;
}

export interface EmptyStateCopy {
  title: string;
  body: string;
  /** CTA opcional (rota + label). Caller decide se renderiza. */
  cta?: { href: string; label: string };
}

function safeLabel(label?: string | null): string {
  return typeof label === "string" && label.trim() ? label.trim() : "";
}

export function buildEmptyStateCopy(
  variant: EmptyStateVariant,
  context: EmptyStateContext = {}
): EmptyStateCopy {
  const label = safeLabel(context.label);

  switch (variant) {
    case "city-no-ads":
      return {
        title: label ? `Sem ofertas em ${label} no momento` : "Sem ofertas no momento",
        body: label
          ? `Ainda não há anúncios disponíveis em ${label}. Tente ampliar a busca para a região.`
          : "Ainda não há anúncios disponíveis nesta cidade.",
        cta: { href: "/comprar", label: "Explorar outras cidades" },
      };

    case "region-no-ads":
      return {
        title: label ? `Sem ofertas em ${label} e região` : "Sem ofertas na região",
        body: "Ainda não há anúncios disponíveis nas cidades dessa região. Volte a verificar em breve.",
        cta: { href: "/comprar", label: "Ver outras regiões" },
      };

    case "state-no-ads":
      return {
        title: label ? `Sem ofertas em ${label}` : "Sem ofertas neste estado",
        body: "Ainda não há anúncios disponíveis no estado. Tente outra UF ou volte mais tarde.",
        cta: { href: "/comprar", label: "Ver outros estados" },
      };

    case "search-no-results":
      return {
        title: "Nada encontrado para sua busca",
        body: "Tente termos diferentes ou remova filtros para ampliar os resultados.",
      };

    case "filters-no-results":
      return {
        title: "Nenhum anúncio combina com seus filtros",
        body: "Ajuste preço, marca ou ano para ver mais opções.",
      };

    case "detail-not-found":
      return {
        title: "Veículo não encontrado",
        body: "Este anúncio pode ter sido removido pelo anunciante, expirado, ou está temporariamente indisponível.",
        cta: { href: "/comprar", label: "Ver carros disponíveis" },
      };

    default:
      // Exhaustiveness check — TS aponta se uma variante for esquecida.
      return { title: "Sem resultados no momento", body: "Volte a verificar em breve." };
  }
}
