import Link from "next/link";

import type {
  CitySeoBrandEntity,
  CitySeoDealerEntity,
  CitySeoModelEntity,
  CitySeoNearbyCity,
  CitySeoOverview,
} from "@/lib/seo/city-seo-overview";
import {
  buildInventoryTimestampLabel,
  buildMarketParagraphs,
  formatBrl,
} from "@/lib/seo/city-authority-content";

/**
 * Camada de AUTORIDADE LOCAL da página de cidade (Fase 3).
 *
 * SERVER COMPONENT puro — sem `"use client"`, sem estado, sem efeito. Todo o
 * conteúdo abaixo é HTML no primeiro byte, então o Googlebot recebe os módulos
 * sem executar JavaScript e o custo em JS do bundle é zero.
 *
 * Módulos, na ordem em que sustentam a intenção de busca:
 *   1. Mercado local  — números reais do inventário ativo daquela cidade.
 *   2. Marcas         — entidades com estoque, linkadas quando qualificadas.
 *   3. Modelos        — modelo COMERCIAL (não versão FIPE), idem.
 *   4. Lojas          — anunciantes públicos com estoque na cidade.
 *   5. Cidades próximas — vizinhas com superfície pública própria.
 *
 * REGRAS QUE ESTE ARQUIVO NÃO PODE QUEBRAR:
 *   • Nenhum número escrito à mão: tudo vem do `overview`.
 *   • Nenhum link para superfície não qualificada — entidade abaixo do limiar
 *     aparece como TEXTO, com sua contagem, nunca como âncora. Linkar para uma
 *     página que responde `noindex` gasta rastreio e dilui a malha.
 *   • Nenhum dado de outra cidade: o `overview` inteiro é resolvido pelo slug
 *     pedido, e uma seção sem dado some em vez de ser preenchida.
 *   • Contagem de vizinhança NUNCA entra na contagem da cidade.
 */

export interface CityAuthoritySectionProps {
  overview: CitySeoOverview;
}

const SECTION = "mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8";
const H2 = "text-base font-semibold text-cnc-text-strong sm:text-lg";
const H3 = "text-xs font-semibold uppercase tracking-wide text-cnc-muted";
const CHIP_LINK =
  "inline-flex items-center rounded-full border border-cnc-line bg-cnc-surface px-2.5 py-1 text-[12px] font-medium text-cnc-text transition hover:border-primary/50 hover:text-primary";
const CHIP_TEXT =
  "inline-flex items-center rounded-full border border-cnc-line/60 bg-transparent px-2.5 py-1 text-[12px] font-medium text-cnc-muted";

function Count({ value }: { value: number }) {
  return <span className="ml-1.5 text-cnc-muted">({value})</span>;
}

/**
 * Entidade qualificada vira âncora; não qualificada vira texto com contagem.
 * O usuário continua vendo que existe estoque daquela marca/modelo — só não
 * ganhamos um link para uma página magra.
 */
function EntityChip({
  qualified,
  href,
  label,
  count,
  title,
}: {
  qualified: boolean;
  href: string;
  label: string;
  count: number;
  title?: string;
}) {
  if (!qualified) {
    return (
      <span className={CHIP_TEXT} title={title}>
        {label}
        <Count value={count} />
      </span>
    );
  }

  return (
    <Link href={href} className={CHIP_LINK} title={title}>
      {label}
      <Count value={count} />
    </Link>
  );
}

function MarketOverview({ overview }: { overview: CitySeoOverview }) {
  const paragraphs = buildMarketParagraphs(overview);
  if (paragraphs.length === 0) return null;

  const updatedAt = buildInventoryTimestampLabel(overview);
  const { inventory, priceStats } = overview;

  return (
    <section aria-labelledby="city-market-heading" className={SECTION}>
      <h2 id="city-market-heading" className={H2}>
        O mercado de carros usados em {overview.city.name}
      </h2>

      <div className="mt-2 max-w-3xl space-y-1.5 text-sm leading-relaxed text-cnc-muted sm:text-[15px]">
        {paragraphs.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>

      {/* Grade de números — a mesma informação dos parágrafos, escaneável.
          Cada célula só existe quando o dado existe. */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Veículos anunciados" value={String(inventory.activeAds)} />
        {priceStats.publishable && priceStats.medianPrice != null ? (
          <Stat label="Preço mediano" value={formatBrl(priceStats.medianPrice)} />
        ) : null}
        {inventory.automaticCount > 0 ? (
          <Stat label="Câmbio automático" value={String(inventory.automaticCount)} />
        ) : null}
        {inventory.belowFipeCount > 0 ? (
          <Stat label="Abaixo da FIPE" value={String(inventory.belowFipeCount)} />
        ) : null}
      </dl>

      {updatedAt ? (
        <p className="mt-3 text-[12px] text-cnc-muted">
          Dados do estoque anunciado no Carros na Cidade, atualizados em {updatedAt}.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-cnc-line bg-cnc-surface px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-cnc-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-cnc-text-strong sm:text-base">{value}</dd>
    </div>
  );
}

function BrandDiscovery({
  brands,
  cityName,
}: {
  brands: CitySeoBrandEntity[];
  cityName: string;
}) {
  if (brands.length === 0) return null;

  return (
    <section aria-labelledby="city-brands-heading" className={SECTION}>
      <h2 id="city-brands-heading" className={H2}>
        Marcas com carros à venda em {cityName}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {brands.map((brand) => (
          <li key={brand.slug}>
            <EntityChip
              qualified={brand.qualified}
              href={brand.path}
              label={brand.label}
              count={brand.activeAds}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModelDiscovery({
  models,
  cityName,
}: {
  models: CitySeoModelEntity[];
  cityName: string;
}) {
  if (models.length === 0) return null;

  return (
    <section aria-labelledby="city-models-heading" className={SECTION}>
      <h2 id="city-models-heading" className={H2}>
        Modelos mais anunciados em {cityName}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {models.map((model) => (
          <li key={`${model.brandSlug}-${model.slug}`}>
            <EntityChip
              qualified={model.qualified}
              href={model.path}
              label={`${model.brandLabel} ${model.label}`}
              count={model.activeAds}
              /* A entidade é o modelo comercial; as versões FIPE que
                 colapsaram nela ficam no title, úteis para quem procura a
                 versão exata sem virar uma URL por versão. */
              title={model.fipeVersions.slice(0, 4).join(" · ")}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DealerDiscovery({
  dealers,
  cityName,
}: {
  dealers: CitySeoDealerEntity[];
  cityName: string;
}) {
  if (dealers.length === 0) return null;

  return (
    <section aria-labelledby="city-dealers-heading" className={SECTION}>
      <h2 id="city-dealers-heading" className={H2}>
        Quem está anunciando em {cityName}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {dealers.map((dealer) => (
          <li key={dealer.slug}>
            <Link
              href={dealer.path}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-cnc-line bg-cnc-surface px-3 py-2 text-sm transition hover:border-primary/50"
            >
              <span className="font-medium text-cnc-text">{dealer.name}</span>
              <span className="shrink-0 text-[12px] text-cnc-muted">
                {dealer.activeAds} {dealer.activeAds === 1 ? "anúncio" : "anúncios"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NearbyCityDiscovery({
  cities,
  cityName,
}: {
  cities: CitySeoNearbyCity[];
  cityName: string;
}) {
  if (cities.length === 0) return null;

  return (
    <section aria-labelledby="city-nearby-heading" className={SECTION}>
      <h2 id="city-nearby-heading" className={H2}>
        Carros em cidades próximas de {cityName}
      </h2>
      {/* Separado visual e semanticamente do catálogo: estes veículos NÃO
          entram na contagem da cidade acima. */}
      <p className="mt-1 max-w-3xl text-sm text-cnc-muted">
        Estes veículos estão anunciados em outras cidades e não entram no total de{" "}
        {cityName}.
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {cities.map((city) => (
          <li key={city.slug}>
            <Link href={city.path} className={CHIP_LINK}>
              {city.name}
              {city.state ? `, ${city.state}` : ""}
              {city.distanceKm != null ? (
                <span className="ml-1.5 text-cnc-muted">~{city.distanceKm} km</span>
              ) : null}
              <Count value={city.activeAds} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CityAuthoritySection({ overview }: CityAuthoritySectionProps) {
  const cityName = overview.city.name;

  return (
    <>
      <MarketOverview overview={overview} />
      <BrandDiscovery brands={overview.brands} cityName={cityName} />
      <ModelDiscovery models={overview.models} cityName={cityName} />
      <DealerDiscovery dealers={overview.dealers} cityName={cityName} />
      <NearbyCityDiscovery cities={overview.nearbyCities} cityName={cityName} />
    </>
  );
}
