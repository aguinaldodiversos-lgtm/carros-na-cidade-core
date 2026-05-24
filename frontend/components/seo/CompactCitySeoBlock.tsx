import Link from "next/link";

import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

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
 *   - "Marcas frequentes" (opcional, até 6) — chips de texto simples
 *     linkando para a Cidade com filtro por marca. Não é card, não é
 *     CTA forte; sinal SEO para entidades de veículo.
 *
 * NÃO renderiza:
 *   - Stats (dl com totalAds / catalogTotalAds / avgPrice).
 *   - sampleAds (cards).
 *   - "Continue explorando" (links para baratos/automáticos/hub).
 *   - CTA grande de ampliação Cidade → Regional/Estado (briefing
 *     reserva isso para o fluxo principal/PublicFooter).
 *
 * Variantes Estado e Regional NÃO usam este bloco — não precisam de
 * SEO compacto extra por cima do catálogo.
 */

export interface CompactCitySeoBlockProps {
  model: LocalSeoLandingModel;
}

export function CompactCitySeoBlock({ model }: CompactCitySeoBlockProps) {
  const { cityName, topBrands, paths } = model;
  const brands = topBrands.slice(0, 6);

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
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-cnc-muted sm:text-[15px]">
        Encontre carros usados e seminovos em {cityName} e região, com ofertas de lojas e
        particulares. Use os filtros para comparar preço, ano, quilometragem, câmbio e oportunidades
        abaixo da FIPE.
      </p>

      {brands.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-cnc-muted">
            Marcas frequentes
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {brands.map((b) => (
              <li key={b.brand}>
                <Link
                  href={`${paths.em}?brand=${encodeURIComponent(b.brand)}`}
                  className="inline-flex items-center rounded-full border border-cnc-line bg-cnc-surface px-2.5 py-1 text-[12px] font-medium text-cnc-text transition hover:border-primary/50 hover:text-primary"
                >
                  {b.brand}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
