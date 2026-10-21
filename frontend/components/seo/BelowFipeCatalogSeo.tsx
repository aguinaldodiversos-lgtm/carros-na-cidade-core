import Link from "next/link";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

/**
 * Conteúdo territorial SSR depois do catálogo, sem hero/card duplicado.
 * Não altera o texto indexável da landing nem fabrica marcas ou inventário.
 */
export function BelowFipeCatalogSeo({ model }: { model: LocalSeoLandingModel }) {
  return (
    <section
      aria-labelledby="below-fipe-catalog-seo-heading"
      className="mx-auto w-full max-w-[1600px] px-4 py-7 sm:px-6 sm:py-9"
    >
      <h2
        id="below-fipe-catalog-seo-heading"
        className="text-base font-bold text-cnc-text-strong sm:text-lg"
      >
        Sobre os carros abaixo da FIPE em {model.cityName}
      </h2>
      <div className="mt-3 max-w-4xl space-y-2.5 text-sm leading-relaxed text-cnc-muted">
        {model.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <nav aria-label="Outras opções de veículos na cidade" className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
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
