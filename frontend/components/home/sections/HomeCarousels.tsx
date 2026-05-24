import { IconPriceTag, IconStar } from "@/components/home/icons";
import { VehicleCarouselSection } from "@/components/home/sections/VehicleCarouselSection";
import type { VehicleCardItem } from "@/components/home/sections/types";
import { fetchHomeCarousels } from "@/lib/home/public-home";
import { buildEmptyStateCopy, normalizePublicAd } from "@/lib/public-contracts";

/**
 * Filtro de defesa em profundidade para cards públicos. Roda
 * `normalizePublicAd` (briefing P2 2026-05-25) — se a normalização
 * devolve `null`, o ad NÃO é renderizável (sem preço, sem slug, ou
 * dirty data que escapou do backend). Preserva o tipo original do
 * caller (AdItem/VehicleCardItem).
 */
function keepRenderableAd<T>(ad: T): boolean {
  return normalizePublicAd(ad) !== null;
}

interface HomeCarouselsProps {
  /** UF do estado em foco (ex: "SP"). Vem do TerritoryResolver. */
  stateUf: string;
  /** Nome do estado em foco (ex: "São Paulo"). Usado em subtítulos. */
  stateName: string;
  /**
   * Nome da cidade detectada via cookie (opcional). Usado APENAS em copy
   * contextual ("anúncios recentes perto de {cidade}") — nunca como filtro
   * dos carrosseis. Os carrosseis são sempre estaduais.
   */
  detectedCityName?: string;
}

/**
 * Server Component async — renderizado dentro de <Suspense> em app/page.tsx
 * para permitir stream do HTML acima da dobra antes dos anuncios chegarem.
 *
 * Política nova: a Home é sempre vitrine ESTADUAL (não cidade). O filtro de
 * cidade era restritivo demais — SP capital escondia o resto do estado.
 * Com filtro estadual o portal aparece cheio e os carrosseis têm volume.
 *
 * Coerência com a página da cidade (/cidade/[slug] e /cidade/[slug]/oportunidades):
 *   - Quando não há destaque PAGO mas há anúncio comum, mostramos os recentes
 *     com subtítulo explicando que não há destaque pago — sem sugerir ausência
 *     total de veículos.
 *   - O carrossel de oportunidades só aparece quando o backend devolveu pelo
 *     menos 1 anúncio abaixo da FIPE para o estado (ou via fallback global em
 *     fetchHomeCarousels). Não usamos recentAds como fallback aqui — isso
 *     seria mentir sobre "abaixo da FIPE".
 */
export async function HomeCarousels({ stateUf, stateName, detectedCityName }: HomeCarouselsProps) {
  const raw = await fetchHomeCarousels(stateUf);

  // Briefing P2 2026-05-25 — defesa em profundidade: nenhum card público
  // pode aparecer com R$ 0, sem slug ou com dirty data. Backend já filtra
  // via DIRTY_TEST_AD_GUARD, mas aplicamos `normalizePublicAd` aqui como
  // safety net. Slugs/preços inválidos somem antes de virar card.
  const highlightAds = raw.highlightAds.filter(keepRenderableAd);
  const opportunityAds = raw.opportunityAds.filter(keepRenderableAd);
  const recentAds = raw.recentAds.filter(keepRenderableAd);

  const hasHighlight = highlightAds.length > 0;
  const hasRecent = recentAds.length > 0;

  const highlightItems = (hasHighlight ? highlightAds : recentAds) as VehicleCardItem[];
  const opportunityItems = opportunityAds as VehicleCardItem[];

  const scope = detectedCityName ? `${detectedCityName} e ${stateName}` : stateName;

  const highlightTitle = hasHighlight ? "Veículos em destaque" : "Veículos recentes";
  const highlightSubtitle = hasHighlight
    ? `Conheça alguns dos veículos mais procurados em ${scope}.`
    : hasRecent
      ? `Nenhum destaque pago no momento — veja anúncios recentes em ${stateName}.`
      : `Anúncios adicionados recentemente em ${stateName}.`;

  // Empty state copy unificada (briefing P2 2026-05-25) — fonte única em
  // `buildEmptyStateCopy` evita divergência entre Home/Estado/Cidade.
  const stateEmptyBody = buildEmptyStateCopy("state-no-ads", { label: stateName }).body;
  const opportunityEmptyBody =
    "Nenhuma oferta abaixo da FIPE no momento. Volte a verificar em breve.";

  return (
    <>
      <VehicleCarouselSection
        icon={<IconStar className="h-6 w-6" />}
        title={highlightTitle}
        subtitle={highlightSubtitle}
        link={{ label: "Ver todos", href: "/comprar" }}
        items={highlightItems}
        variant="highlight"
        emptyMessage={stateEmptyBody}
      />

      {opportunityAds.length > 0 ? (
        <VehicleCarouselSection
          icon={<IconPriceTag className="h-6 w-6" />}
          title="Oportunidades abaixo da FIPE"
          subtitle="Seu carro pelo melhor preço aguardando seu próximo veículo."
          link={{ label: "Ver todos", href: "/comprar?below_fipe=true" }}
          items={opportunityItems}
          variant="opportunity"
          emptyMessage={opportunityEmptyBody}
        />
      ) : null}
    </>
  );
}
