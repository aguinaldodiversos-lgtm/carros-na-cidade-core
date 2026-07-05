import AdCard, { type BaseAdData } from "@/components/ads/AdCard";
import type { NearbyRadiusResult } from "@/lib/buy/city-radius-catalog";

/**
 * Bloco "Próximos, até X km" da página de cidade (âncora regional, Onda 2
 * Fase 2a). Renderiza os anúncios das cidades vizinhas dentro do raio,
 * ordenados por distância (destaque só desempata na mesma distância). Cada card
 * mostra PROCEDÊNCIA + distância ("Bragança Paulista - SP · na região ~18 km").
 *
 * Marco 0 km = a cidade da página, cujos anúncios ficam no catálogo principal
 * (bloco "Em [cidade]"). Aqui só vizinhas. Se não houver vizinhas com estoque,
 * a seção não renderiza. Server component — entra no HTML SSR.
 *
 * Segurança: o rótulo é sempre a CIDADE de origem (nunca bairro). A trava de
 * bairro-só-para-lojas vive no serializador de localização; aqui exibimos só
 * cidade + UF + distância.
 */
export function NearbyRadiusSection({
  result,
  cityName,
}: {
  result: NearbyRadiusResult;
  cityName: string;
}) {
  const { radiusKm, nearby } = result;
  if (nearby.length === 0) return null;

  return (
    <section
      aria-labelledby="nearby-radius-heading"
      className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="nearby-radius-heading"
          className="text-[17px] font-extrabold text-cnc-text-strong sm:text-lg"
        >
          Próximos, até {radiusKm} km
        </h2>
        <p className="text-sm text-cnc-muted">
          Anúncios de cidades vizinhas de {cityName}, ordenados por proximidade.
        </p>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nearby.map(({ ad, originCity, originState, distanceKm }, index) => (
          <li key={ad.id ?? index} className="flex flex-col gap-1.5">
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11.5px] font-semibold text-primary">
              {originCity}
              {originState ? ` - ${originState}` : ""}
              {distanceKm != null ? ` · na região ~${distanceKm} km` : ""}
            </span>
            <AdCard item={ad as unknown as BaseAdData} variant="carousel" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default NearbyRadiusSection;
