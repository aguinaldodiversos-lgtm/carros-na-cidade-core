import { IconPriceTag, IconStar } from "@/components/home/icons";
import { VehicleCarouselSection } from "@/components/home/sections/VehicleCarouselSection";
import type { VehicleCardItem } from "@/components/home/sections/types";
import { fetchHomeCarousels } from "@/lib/home/public-home";

interface HomeCarouselsProps {
  activeCitySlug?: string;
  activeCityId?: number;
  activeCityName: string;
}

/**
 * Server Component async — renderizado dentro de <Suspense> em app/page.tsx
 * para permitir stream do HTML acima da dobra antes dos anuncios chegarem.
 *
 * Coerência com a página da cidade (/cidade/[slug] e /cidade/[slug]/oportunidades):
 *   - Quando não há destaque PAGO mas há anúncio comum, mostramos os recentes
 *     com subtítulo explicando que não há destaque pago — sem sugerir ausência
 *     total de veículos (a página territorial mostraria os mesmos anúncios).
 *   - O carrossel de oportunidades só aparece quando o backend devolveu pelo
 *     menos 1 anúncio abaixo da FIPE para o território (ou via fallback global
 *     em fetchHomeCarousels). Não usamos recentAds como fallback aqui — isso
 *     seria mentir sobre "abaixo da FIPE".
 */
export async function HomeCarousels({
  activeCitySlug,
  activeCityId,
  activeCityName,
}: HomeCarouselsProps) {
  const { highlightAds, opportunityAds, recentAds } = await fetchHomeCarousels(
    activeCitySlug,
    activeCityId
  );

  const hasHighlight = highlightAds.length > 0;
  const hasRecent = recentAds.length > 0;

  const highlightItems = (hasHighlight ? highlightAds : recentAds) as VehicleCardItem[];
  const opportunityItems = opportunityAds as VehicleCardItem[];

  const highlightTitle = hasHighlight ? "Veículos em destaque" : "Veículos recentes";
  const highlightSubtitle = hasHighlight
    ? `Conheça alguns dos veículos mais procurados em ${activeCityName}.`
    : hasRecent
      ? `Nenhum destaque pago no momento — veja anúncios recentes em ${activeCityName}.`
      : `Anúncios adicionados recentemente perto de ${activeCityName}.`;

  return (
    <>
      <VehicleCarouselSection
        icon={<IconStar className="h-6 w-6" />}
        title={highlightTitle}
        subtitle={highlightSubtitle}
        link={{ label: "Ver todos", href: "/comprar" }}
        items={highlightItems}
        variant="highlight"
        emptyMessage="Nenhum anúncio disponível no momento."
      />

      {opportunityAds.length > 0 ? (
        <VehicleCarouselSection
          icon={<IconPriceTag className="h-6 w-6" />}
          title="Oportunidades abaixo da FIPE"
          subtitle="Seu carro pelo melhor preço aguardando seu próximo veículo."
          link={{ label: "Ver todos", href: "/comprar?below_fipe=true" }}
          items={opportunityItems}
          variant="opportunity"
          emptyMessage="Nenhuma oportunidade abaixo da FIPE agora."
        />
      ) : null}
    </>
  );
}
