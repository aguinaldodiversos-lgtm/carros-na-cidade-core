"use client";

import Link from "next/link";
import { HomeSearchSection } from "../search/HomeSearchSection";
import { SearchResultsList } from "../search/SearchResultsList";

interface HomePageClientProps {
  data: {
    featuredCities: Array<{
      id: number;
      name: string;
      slug: string;
      demand_score?: number;
    }>;
    highlightAds: Array<any>;
    opportunityAds: Array<any>;
    recentAds: Array<any>;
    stats: {
      total_ads?: number | string;
      total_cities?: number | string;
      total_advertisers?: number | string;
      total_users?: number | string;
    };
  };
}

function statValue(value: number | string | undefined, fallback = "0") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

export function HomePageClient({ data }: HomePageClientProps) {
  return (
    <main className="min-h-screen bg-[#f2f3f7]">
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 md:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                Portal automotivo territorial
              </span>

              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-zinc-900 md:text-5xl">
                O portal de carros mais relevante da sua cidade
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 md:text-lg">
                Encontre carros usados e seminovos com busca inteligente,
                páginas locais por cidade, oportunidades abaixo da FIPE e
                navegação feita para gerar confiança e conversão.
              </p>

              <div className="mt-8">
                <HomeSearchSection />
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/anuncios"
                  className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Ver anúncios
                </Link>
                <Link
                  href="/planos"
                  className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Anunciar no portal
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-3xl bg-zinc-900 p-6 text-white">
                <div className="text-sm text-zinc-300">Anúncios ativos</div>
                <div className="mt-3 text-3xl font-bold">
                  {statValue(data.stats.total_ads)}
                </div>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <div className="text-sm text-zinc-500">Cidades mapeadas</div>
                <div className="mt-3 text-3xl font-bold text-zinc-900">
                  {statValue(data.stats.total_cities)}
                </div>
              </div>

              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <div className="text-sm text-zinc-500">Lojistas</div>
                <div className="mt-3 text-3xl font-bold text-zinc-900">
                  {statValue(data.stats.total_advertisers)}
                </div>
              </div>

              <div className="rounded-3xl bg-blue-600 p-6 text-white">
                <div className="text-sm text-blue-100">Usuários</div>
                <div className="mt-3 text-3xl font-bold">
                  {statValue(data.stats.total_users)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {data.featuredCities?.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-zinc-900">
                Cidades em foco
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Rotas locais para expansão comercial e SEO massivo.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.featuredCities.slice(0, 8).map((city) => (
              <div
                key={city.id}
                className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-zinc-900">
                  {city.name}
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Score de demanda: {Number(city.demand_score || 0).toFixed(1)}
                </p>

                <div className="mt-5 flex flex-col gap-2">
                  <Link
                    href={`/cidade/${city.slug}`}
                    className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  >
                    Ver cidade
                  </Link>
                  <Link
                    href={`/cidade/${city.slug}/oportunidades`}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Oportunidades
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-zinc-900">Destaques da cidade</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Anúncios estratégicos com mais relevância comercial.
          </p>
        </div>
        <SearchResultsList items={data.highlightAds || []} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-zinc-900">Abaixo da FIPE</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Oportunidades com potencial de giro e conversão.
          </p>
        </div>
        <SearchResultsList items={data.opportunityAds || []} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-5">
          <h2 className="text-2xl font-bold text-zinc-900">Recém-publicados</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Veículos que acabaram de entrar no portal.
          </p>
        </div>
        <SearchResultsList items={data.recentAds || []} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="rounded-3xl bg-zinc-900 px-6 py-10 text-white md:px-10">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-bold">
              Estrutura comercial pronta para crescer cidade por cidade
            </h2>
            <p className="mt-3 text-zinc-300">
              Busca inteligente, filtros semânticos, páginas territoriais,
              indexação em escala e pipeline de publicação robusto.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/planos"
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Conhecer planos
              </Link>
              <Link
                href="/anuncios"
                className="rounded-2xl border border-zinc-700 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Explorar anúncios
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
