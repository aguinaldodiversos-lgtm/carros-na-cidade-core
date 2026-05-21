import type { Metadata } from "next";
import { notFound } from "next/navigation";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import { StateLocationPrompt } from "@/components/territorial/StateLocationPrompt";
import { StateRegionsBlock } from "@/components/territorial/StateRegionsBlock";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadStateCatalogData } from "@/lib/buy/state-catalog-loader";
import {
  hasRestrictiveFilters,
  normalizeStateFilters,
  normalizeUf,
  stateNameFromUf,
  type SearchParams,
} from "@/lib/buy/territory-variant";
import { fetchStateRegions } from "@/lib/territory/fetch-state-regions";
import { toAbsoluteUrl } from "@/lib/seo/site";

type CarrosUsadosUfPageProps = {
  params: { uf: string };
  searchParams?: SearchParams;
};

/**
 * `/carros-usados/[uf]` — Página Estadual CANÔNICA (PR 3, briefing
 * 2026-05-20).
 *
 * Função: porta de entrada e hub de distribuição. Recepciona busca
 * ampla ("carros usados em SP"), oferece CTA de localização, conduz
 * para Regional/Cidade via blocos curados.
 *
 * Compatibilidade: `/comprar/estado/[uf]` continua respondendo nesta
 * fase como alias, com canonical apontando PARA cá. Migração de
 * redirect 301 só após validação SEO em produção (briefing item 2).
 *
 * Precedência de rotas no Next 14:
 *   - `/carros-usados/regiao/[slug]` casa com 3 segmentos
 *     (`regiao` é literal) — sempre vence.
 *   - `/carros-usados/[uf]` casa com 2 segmentos — pega `sp`, `mg`,
 *     `rj`, etc. UF inválida retorna 404 real via `notFound()`.
 */

export const revalidate = 60;

export async function generateMetadata({
  params,
  searchParams = {},
}: CarrosUsadosUfPageProps): Promise<Metadata> {
  const uf = normalizeUf(params.uf);
  if (!uf) {
    return {
      title: "Comprar carros | Carros na Cidade",
      robots: { index: false, follow: true },
    };
  }

  const stateName = stateNameFromUf(uf);

  // Title/Description literais do briefing 2026-05-20 (item 12):
  //   Title final esperado: "Carros usados em [Estado] | Carros na Cidade"
  //   Description: "Encontre carros usados e seminovos em [Estado]. Veja
  //     ofertas por cidade, região, lojas e particulares."
  //
  // Importante: o root layout aplica `title.template = "%s | Carros na
  // Cidade"`. Enviar a string completa duplicaria o sufixo (" | Carros
  // na Cidade | Carros na Cidade"). Aqui enviamos apenas o fragmento
  // territorial — o template cuida do nome do site.
  const title = `Carros usados em ${stateName}`;
  const description = `Encontre carros usados e seminovos em ${stateName}. Veja ofertas por cidade, região, lojas e particulares.`;

  // Canonical SELF — esta é A rota canônica do estado. Sem query string
  // mesmo com filtros aplicados, para não fragmentar sinal SEO.
  const canonicalPath = `/carros-usados/${uf.toLowerCase()}`;

  // Filtros restritivos (brand/model/q/...) → noindex. URLs filtradas
  // existem para o usuário mas não para o crawler — canonical já aponta
  // para a URL limpa. `normalizeStateFilters` é puro (sem fetch),
  // então a checagem aqui não duplica chamada de backend.
  const filters = normalizeStateFilters(uf, searchParams);
  const noindex = hasRestrictiveFilters(filters);

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    ...(noindex && { robots: { index: false, follow: true } }),
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function CarrosUsadosUfPage({
  params,
  searchParams = {},
}: CarrosUsadosUfPageProps) {
  const catalog = await loadStateCatalogData(params.uf, searchParams);
  if (!catalog) notFound();

  const { uf, stateName, city, filters, initialResults, initialFacets } = catalog;

  const regionalEnabled = isRegionalPageEnabled();

  // Bloco "Explore por região" só faz fetch quando a flag regional
  // estiver ativa — links regionais com flag off são 404, não vale
  // pagar a chamada nem montar a UI.
  const stateRegionsPayload = regionalEnabled
    ? await fetchStateRegions(uf, { limit: 8 })
    : null;
  const stateRegions = stateRegionsPayload?.regions ?? [];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Carros usados em ${stateName}`,
    numberOfItems: initialResults.pagination.total,
    itemListElement: initialResults.data.slice(0, 20).map((ad, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
      name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <BuyMarketplacePageClient
        initialResults={initialResults}
        initialFacets={initialFacets}
        initialFilters={filters}
        city={city}
        variant="estadual"
        stateUf={uf}
        enableGeoRedirect
        regionalEnabled={regionalEnabled}
      />

      <div className="bg-cnc-bg pb-20 md:pb-0">
        {/* CTA de localização — fica logo abaixo do catálogo para
            convidar usuários "novos" (sem cidade confirmada) a se
            localizar OU descer para os blocos de descoberta abaixo.
            Não redireciona agressivamente; só guia via scroll. */}
        <StateLocationPrompt />

        {/* Bloco "Explore por região" — caminho de conversão para a
            Regional. Suprimido quando a flag está OFF para não criar
            links 404, ou quando o estado não tem cobertura regional
            cadastrada ainda. */}
        {regionalEnabled && stateRegions.length > 0 ? (
          <StateRegionsBlock
            stateName={stateName}
            regions={stateRegions}
            maxCards={8}
          />
        ) : null}
      </div>
    </>
  );
}
