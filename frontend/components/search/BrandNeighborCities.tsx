import Link from "next/link";

import { getCityProfile, getStaticCitySlugs } from "@/lib/market/market-data";

/**
 * Bloco de links internos "Ver {marca} em cidades vizinhas" para a página
 * marca+cidade (auditoria SEO 2026-07-03, item 5). Ajuda o Google a entender o
 * cluster marca×território e distribui autoridade entre as páginas irmãs.
 *
 * "Vizinhas" = outras cidades do MESMO UF (o seed estático não tem grafo de
 * proximidade; UF é a aproximação disponível e suficiente para o sinal de
 * cluster). Server component — resolve as cidades no SSR.
 */

interface BrandNeighborCitiesProps {
  citySlug: string;
  cityUf?: string | null;
  brandName: string;
  brandSlug: string;
  limit?: number;
}

export function BrandNeighborCities({
  citySlug,
  cityUf,
  brandName,
  brandSlug,
  limit = 6,
}: BrandNeighborCitiesProps) {
  const uf = (cityUf || "").trim().toUpperCase();
  if (!uf || !brandName || !brandSlug) return null;

  const neighbors = getStaticCitySlugs(300)
    .filter((slug) => slug !== citySlug)
    .map((slug) => getCityProfile(slug))
    .filter((c) => (c.uf || "").toUpperCase() === uf)
    .slice(0, limit);

  if (neighbors.length === 0) return null;

  return (
    <section className="mx-auto mt-6 w-full max-w-7xl px-4 md:px-6 xl:px-8">
      <div className="rounded-[22px] border border-[#E5E9F2] bg-white p-5 shadow-[0_10px_24px_rgba(20,30,60,0.05)]">
        <h2 className="text-[17px] font-extrabold text-[#1D2440]">
          Ver {brandName} em cidades vizinhas
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-[#6E748A]">
          Explore ofertas de {brandName} em outras cidades de {uf}.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {neighbors.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/cidade/${c.slug}/marca/${brandSlug}`}
                className="inline-flex items-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-1.5 text-sm font-medium text-[#47506A] transition hover:border-[#D8E2FB] hover:bg-[#F5F8FF] hover:text-[#1F66E5]"
              >
                {brandName} em {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default BrandNeighborCities;
