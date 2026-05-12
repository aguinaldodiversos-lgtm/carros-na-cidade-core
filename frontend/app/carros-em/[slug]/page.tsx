import { createLocalSeoPage, LOCAL_SEO_REVALIDATE } from "@/lib/seo/local-seo-route";
import { TerritorialFooterLinks } from "@/components/territorial/TerritorialFooterLinks";

export const revalidate = LOCAL_SEO_REVALIDATE;

/**
 * Variante "em" (ex.: `/carros-em/atibaia-sp`) é a URL CANÔNICA da
 * intenção "comprar carros em [cidade]" — `/cidade/[slug]` canonicaliza
 * para cá. Como é a URL que recebe o tráfego orgânico, é também onde
 * os CTAs cross-territoriais (Regional + Estado) precisam estar.
 *
 * Variantes irmãs (`baratos`, `automaticos`) NÃO recebem os CTAs: a
 * Regional resolve a intenção "comprar na cidade + arredores" e o
 * Estado resolve "comprar no estado", nenhum dos quais combina com
 * intenções específicas de preço-baixo ou câmbio-automático.
 *
 * Auditoria 2026-05-11: substituído `RegionCtaLink` solo por
 * `TerritorialFooterLinks` para adicionar o CTA "Ver catálogo de
 * [UF]" — gap detectado na navegação cross-territorial.
 */
const { generateMetadata, Page } = createLocalSeoPage("em", {
  renderAfter: (model) => (
    <TerritorialFooterLinks
      slug={model.slug}
      cityName={model.cityName}
      state={model.state}
    />
  ),
});

export { generateMetadata };
export default Page;
