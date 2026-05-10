import { cache } from "react";
import type { Metadata } from "next";
import { LocalSeoLanding } from "@/components/seo/LocalSeoLanding";
import {
  loadLocalSeoLanding,
  type LocalSeoLandingModel,
  type LocalSeoVariant,
} from "@/lib/seo/local-seo-data";
import { buildLocalSeoJsonLd, buildLocalSeoMetadata } from "@/lib/seo/local-seo-metadata";

export const LOCAL_SEO_REVALIDATE = 60;

interface PageParams {
  params: { slug: string };
}

/**
 * Slot opcional para renderizar conteúdo extra DEPOIS do `LocalSeoLanding`,
 * dentro do mesmo server component da factory.
 *
 * Recebe o `model` já carregado pela factory para evitar refetch e para
 * que o slot tenha acesso a `slug`, `cityName`, `state` etc. sem precisar
 * abrir uma segunda chamada SSR.
 *
 * Caso de uso atual: CTA gated para a Página Regional na canônica
 * `/carros-em/[slug]`. As variantes `baratos` e `automaticos` continuam
 * sem slot — propositalmente — para manter a Página Regional como saída
 * apenas da intenção principal "comprar carros em [cidade]".
 */
export type LocalSeoRenderSlot = (
  model: LocalSeoLandingModel
) => React.ReactNode;

export interface CreateLocalSeoPageOptions {
  /** Conteúdo opcional renderizado após `LocalSeoLanding`. */
  renderAfter?: LocalSeoRenderSlot;
}

export function createLocalSeoPage(
  variant: LocalSeoVariant,
  options: CreateLocalSeoPageOptions = {}
) {
  const load = cache((slug: string) => loadLocalSeoLanding(slug, variant));

  async function generateMetadata({ params }: PageParams): Promise<Metadata> {
    const model = await load(params.slug);
    return buildLocalSeoMetadata(model);
  }

  async function Page({ params }: PageParams) {
    const model = await load(params.slug);
    const jsonLd = buildLocalSeoJsonLd(model);

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LocalSeoLanding model={model} />
        {options.renderAfter ? options.renderAfter(model) : null}
      </>
    );
  }

  return { generateMetadata, Page };
}
