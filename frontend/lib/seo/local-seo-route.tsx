import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalSeoLanding } from "@/components/seo/LocalSeoLanding";
import { isValidBrazilianCitySlug } from "@/lib/buy/territory-variant";
import { FaqBlock } from "@/components/seo/FaqBlock";
import {
  loadLocalSeoLanding,
  type LocalSeoLandingModel,
  type LocalSeoVariant,
} from "@/lib/seo/local-seo-data";
import {
  buildBaratosBreadcrumbJsonLd,
  buildLocalSeoBreadcrumbJsonLd,
  buildLocalSeoJsonLd,
  buildLocalSeoMetadata,
} from "@/lib/seo/local-seo-metadata";
import { buildBelowFipeFaqEntries, buildFaqPageJsonLd } from "@/lib/seo/faq";

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
export type LocalSeoRenderSlot = (model: LocalSeoLandingModel) => React.ReactNode;

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
    // Cidade inexistente → 404 real. Chamado no generateMetadata para comitar
    // o status ANTES do Page (com force-dynamic; ver doc nas page.tsx). Sem
    // isso, `/carros-baratos-em/cidade-falsa-xx` respondia 200 indexável
    // (soft-404). Cidade real sem anúncios NÃO cai aqui (fallback 200).
    if (!isValidBrazilianCitySlug(params.slug)) notFound();
    const model = await load(params.slug);
    return buildLocalSeoMetadata(model);
  }

  async function Page({ params }: PageParams) {
    if (!isValidBrazilianCitySlug(params.slug)) notFound();
    const model = await load(params.slug);
    const jsonLd = buildLocalSeoJsonLd(model);

    // BreadcrumbList (Fase 4.3.1):
    //   - "em": canônica intermediária → breadcrumb /carros-em.
    //   - "baratos": canônica de si mesma → breadcrumb próprio /carros-baratos-em.
    //   - "automaticos": noindex,follow (consolida em /carros-em) → sem breadcrumb.
    const breadcrumbJsonLd =
      variant === "em"
        ? buildLocalSeoBreadcrumbJsonLd(model)
        : variant === "baratos"
          ? buildBaratosBreadcrumbJsonLd(model)
          : null;

    // FAQ abaixo da FIPE (Fase 4.3.1) — VISÍVEL (FaqBlock) → emite FAQPage.
    // Só na variant "baratos"; "automaticos" fica enxuta (noindex).
    const faqEntries =
      variant === "baratos" ? buildBelowFipeFaqEntries({ cityName: model.cityName }) : [];
    const faqJsonLd = faqEntries.length > 0 ? buildFaqPageJsonLd(faqEntries) : null;

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {breadcrumbJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
          />
        ) : null}
        {faqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
          />
        ) : null}
        <LocalSeoLanding model={model} />
        {faqEntries.length > 0 ? (
          <FaqBlock
            title={`Perguntas frequentes sobre carros abaixo da FIPE em ${model.cityName}`}
            entries={faqEntries}
          />
        ) : null}
        {options.renderAfter ? options.renderAfter(model) : null}
      </>
    );
  }

  return { generateMetadata, Page };
}
