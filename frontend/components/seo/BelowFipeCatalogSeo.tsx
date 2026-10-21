import Link from "next/link";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";
import { CityInventoryStats } from "@/components/seo/CityInventoryStats";

/**
 * Conteúdo territorial SSR depois do catálogo, sem hero/card duplicado.
 * Não altera o texto indexável da landing nem fabrica marcas ou inventário.
 */
type BelowFipeCatalogSeoProps = {
  model: LocalSeoLandingModel;
  cityName: string;
  /** Total de ofertas retornadas pelo catálogo filtrado (fonte do grid). */
  catalogTotal: number;
};

export function BelowFipeCatalogSeo({
  model,
  cityName,
  catalogTotal,
}: BelowFipeCatalogSeoProps) {
  // A API territorial pode estar indisponível enquanto a busca continua
  // respondendo. Nunca publicar um texto "não há veículos" ao lado de cards.
  const sourcesAgreeOnInventory = catalogTotal > 0 && !model.isEmptyCity && model.totalAds > 0;
  const paragraphs = sourcesAgreeOnInventory
    ? model.paragraphs
    : [
        `Compare carros baratos em ${cityName} com anúncios sinalizados abaixo da tabela FIPE. Confira preço, ano, quilometragem e condições antes de negociar.`,
        "A disponibilidade de veículos pode mudar conforme os anúncios são publicados ou retirados do catálogo.",
      ];
  return (
    <section
      aria-labelledby="below-fipe-catalog-seo-heading"
      className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 sm:py-9"
    >
      <h2
        id="below-fipe-catalog-seo-heading"
        className="text-base font-bold text-cnc-text-strong sm:text-lg"
      >
        Sobre os carros abaixo da FIPE em {cityName}
      </h2>
      <div className="mt-3 max-w-4xl space-y-2.5 text-sm leading-relaxed text-cnc-muted">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {sourcesAgreeOnInventory ? (
        <CityInventoryStats model={model} className="mt-4 max-w-4xl" />
      ) : null}
      <nav
        aria-label="Outras opções de veículos na cidade"
        className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm"
      >
        <Link href={model.paths.em} className="font-semibold text-primary hover:underline">
          Carros em {model.cityName}
        </Link>
        <Link href={model.paths.automaticos} className="font-semibold text-primary hover:underline">
          Carros automáticos
        </Link>
        <Link href={model.comprarHref} className="font-semibold text-primary hover:underline">
          Ver catálogo filtrado
        </Link>
      </nav>
    </section>
  );
}
