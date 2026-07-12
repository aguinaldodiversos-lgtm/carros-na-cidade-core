// frontend/components/home/sections/HomeSeoLinks.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import { SectionHeader as DSSectionHeader } from "@/components/ui/SectionHeader";
import { IconSearch } from "@/components/home/icons";
import type { HomeModelLink, HomePriceBucketLink, HomeSeoCity } from "@/lib/home/home-discovery";

/**
 * Bloco de SEO "Continue sua busca" (reestruturação 2026-07-11).
 *
 * Substitui as antigas seções "Explore por estado" e "Explore por região em
 * SP". Três colunas de links internos:
 *   - Por cidade  → cidades com mais anúncios ativos no estado (slug REAL do
 *                   banco → /carros-em/[slug], rota indexável)
 *   - Por modelo  → modelos com mais anúncios ativos
 *   - Por preço   → faixas de preço com anúncio real na amostra
 *
 * REGRA: nenhum link vazio. `cities`, `models` e `priceBuckets` já chegam
 * derivados de anúncios reais por `fetchHomeDiscovery` — cada item tem
 * lastro (≥1 anúncio), então nenhum destino é vazio. Coluna sem itens some;
 * se as três somem, a seção inteira some.
 *
 * Server Component.
 */

interface HomeSeoLinksProps {
  cities: HomeSeoCity[];
  models: HomeModelLink[];
  priceBuckets: HomePriceBucketLink[];
}

function LinkColumn({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-cnc-muted">{heading}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function ColumnLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link
        href={href}
        className="inline-block text-[14px] leading-snug text-cnc-text-strong transition hover:text-primary hover:underline"
      >
        {label}
      </Link>
    </li>
  );
}

export function HomeSeoLinks({ cities, models, priceBuckets }: HomeSeoLinksProps) {
  const cityItems = (cities || []).filter((c) => c?.slug && c?.name).slice(0, 6);
  const hasCities = cityItems.length > 0;
  const hasModels = models.length > 0;
  const hasPrices = priceBuckets.length > 0;

  if (!hasCities && !hasModels && !hasPrices) return null;

  return (
    <section
      aria-label="Continue sua busca"
      className="mx-auto w-full max-w-8xl px-4 pb-10 pt-6 sm:px-6 sm:pb-14 sm:pt-10 lg:px-8"
    >
      <DSSectionHeader
        as="h2"
        title="Continue sua busca"
        description="Atalhos para explorar o portal por cidade, modelo e faixa de preço."
        variant="with-icon"
        icon={<IconSearch className="h-5 w-5" />}
        className="mb-5 sm:mb-7"
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
        {hasCities && (
          <LinkColumn heading="Por cidade">
            {cityItems.map((city) => (
              <ColumnLink
                key={city.id ?? city.slug}
                href={`/carros-em/${city.slug}`}
                label={city.name}
              />
            ))}
          </LinkColumn>
        )}

        {hasModels && (
          <LinkColumn heading="Por modelo">
            {models.map((model) => (
              <ColumnLink key={model.href} href={model.href} label={model.label} />
            ))}
          </LinkColumn>
        )}

        {hasPrices && (
          <LinkColumn heading="Por preço">
            {priceBuckets.map((bucket) => (
              <ColumnLink key={bucket.key} href={bucket.href} label={bucket.label} />
            ))}
          </LinkColumn>
        )}
      </div>
    </section>
  );
}
