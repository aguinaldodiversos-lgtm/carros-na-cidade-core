// frontend/components/home/TerritorialEntrySection.tsx

"use client";

import Link from "next/link";

export interface TerritorialCityEntry {
  name: string;
  slug: string;
  state?: string;
}

interface TerritorialEntrySectionProps {
  cities?: TerritorialCityEntry[];
}

const DEFAULT_CITIES: TerritorialCityEntry[] = [
  { name: "Atibaia", slug: "atibaia", state: "SP" },
  { name: "Campinas", slug: "campinas", state: "SP" },
  { name: "Jundiaí", slug: "jundiai", state: "SP" },
  { name: "Bragança Paulista", slug: "braganca-paulista", state: "SP" },
];

export function TerritorialEntrySection({
  cities = DEFAULT_CITIES,
}: TerritorialEntrySectionProps) {
  if (!cities.length) return null;

  return (
    <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          Exploração territorial
        </span>

        <h2 className="text-xl font-bold text-zinc-900">
          Navegue por cidades estratégicas
        </h2>

        <p className="text-sm text-zinc-500">
          Entre direto nas páginas locais, oportunidades e ofertas abaixo da FIPE.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cities.map((city) => (
          <div
            key={city.slug}
            className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {city.name}
                </h3>
                {city.state ? (
                  <p className="mt-1 text-sm text-zinc-500">{city.state}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/cidade/${city.slug}`}
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Ver cidade
              </Link>

              <Link
                href={`/cidade/${city.slug}/oportunidades`}
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Ver oportunidades
              </Link>

              <Link
                href={`/cidade/${city.slug}/abaixo-da-fipe`}
                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
              >
                Ver abaixo da FIPE
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
