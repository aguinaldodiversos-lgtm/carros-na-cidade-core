// frontend/lib/seo/home-structured-data.ts
//
// Fase 4.3 (§8) — JSON-LD da Home: WebSite (com SearchAction para a busca
// pública /comprar) + Organization. Lacuna anterior: a Home não emitia
// nenhum application/ld+json.
import { getSiteUrl, toAbsoluteUrl } from "./site";

export function buildHomeJsonLd(): Record<string, unknown>[] {
  const siteUrl = getSiteUrl();

  const website: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Carros na Cidade",
    url: `${siteUrl}/`,
    inLanguage: "pt-BR",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/comprar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  const organization: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Carros na Cidade",
    url: `${siteUrl}/`,
    logo: toAbsoluteUrl("/images/logo-carros-na-cidade.png"),
  };

  return [website, organization];
}
