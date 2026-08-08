import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";
import { CityInventoryStats, hasCityInventoryData } from "@/components/seo/CityInventoryStats";

/**
 * Bloco SEO mínimo renderizado APÓS a paginação na Página Cidade
 * (`/carros-em/[slug]` e legado `/comprar/cidade/[slug]`). Briefing
 * 2026-05-22 — "Atualizar página Comprar/Catálogo":
 *
 *   "Preservar sinal SEO local sem criar segundo rodapé."
 *
 * Substitui o `<LocalSeoLanding compactBelow>` antigo, que carregava
 * stats (dl), "Continue explorando" (lista grande de links) e cards
 * de destaque — tudo isso criava sensação de "pré-rodapé" antes do
 * `PublicFooter` azul de 6 colunas.
 *
 * Renderiza somente:
 *   - h2 baixo destaque: "Sobre carros usados em [cidade]"
 *   - 1 parágrafo curto com palavras-chave (carros usados, seminovos,
 *     lojas, particulares, abaixo da FIPE).
 *
 * NÃO renderiza:
 *   - Stats (dl com totalAds / catalogTotalAds / avgPrice).
 *   - sampleAds (cards).
 *   - "Continue explorando" (links para baratos/automáticos/hub).
 *   - CTA grande de ampliação Cidade → Regional/Estado (briefing
 *     reserva isso para o fluxo principal/PublicFooter).
 *   - "Marcas frequentes" (REMOVIDO na Fase 3). Aqueles chips apontavam
 *     para `/carros-em/[slug]?brand=<nome cru da FIPE>` — uma URL com
 *     parâmetro, que a política de query deduplica para a cidade limpa
 *     (noindex/canonical na cidade). Ou seja: o bloco de marcas da página
 *     gastava seus links num beco. A mesma intenção agora é servida por
 *     `CityAuthoritySection`, que linka para a canônica
 *     `/cidade/[slug]/marca/[marca]` e SÓ quando a marca qualifica.
 *
 * Variantes Estado e Regional NÃO usam este bloco — não precisam de
 * SEO compacto extra por cima do catálogo.
 */

export interface CompactCitySeoBlockProps {
  model: LocalSeoLandingModel;
}

export function CompactCitySeoBlock({ model }: CompactCitySeoBlockProps) {
  const { cityName } = model;
  const hasData = hasCityInventoryData(model);

  return (
    <section
      aria-labelledby="compact-city-seo-heading"
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <h2
        id="compact-city-seo-heading"
        className="text-base font-semibold text-cnc-text-strong sm:text-lg"
      >
        Sobre carros usados em {cityName}
      </h2>

      {/*
        Cidade COM inventário → estatísticas locais reais (intro data-driven +
        tabela + "atualizado em"), conteúdo único por cidade. Cidade SEM
        inventário → parágrafo genérico institucional (a página já é
        noindex,follow nesse caso, então não há risco de "conteúdo em escala").
      */}
      {hasData ? (
        <CityInventoryStats model={model} showIntro className="mt-2" />
      ) : (
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-cnc-muted sm:text-[15px]">
          Encontre carros usados e seminovos em {cityName} e região, com ofertas de lojas e
          particulares. Use os filtros para comparar preço, ano, quilometragem, câmbio e
          oportunidades abaixo da FIPE.
        </p>
      )}

    </section>
  );
}
