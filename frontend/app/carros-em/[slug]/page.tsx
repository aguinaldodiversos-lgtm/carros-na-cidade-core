import { createLocalSeoPage, LOCAL_SEO_REVALIDATE } from "@/lib/seo/local-seo-route";
import { RegionCtaLink } from "@/components/territorial/RegionCtaLink";

export const revalidate = LOCAL_SEO_REVALIDATE;

/**
 * Variante "em" (ex.: `/carros-em/atibaia-sp`) é a URL CANÔNICA da
 * intenção "comprar carros em [cidade]" — `/cidade/[slug]` canonicaliza
 * para cá. Como é a URL que recebe o tráfego orgânico, é também onde
 * o CTA gated para a Página Regional precisa estar.
 *
 * Variantes irmãs (`baratos`, `automaticos`) NÃO recebem o CTA: a
 * Regional resolve a intenção "comprar na cidade + arredores", não as
 * intenções específicas de preço-baixo ou câmbio-automático.
 */
const { generateMetadata, Page } = createLocalSeoPage("em", {
  renderAfter: (model) => (
    <RegionCtaLink slug={model.slug} cityName={model.cityName} />
  ),
});

export { generateMetadata };
export default Page;
