import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/seo/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/anuncios",
          "/comprar",
          "/cidade/",
          "/veiculo/",
          "/blog/",
          "/tabela-fipe/",
          "/simulador-financiamento/",
          "/sitemap.xml",
          "/sitemaps/",
        ],
        disallow: ["/api/", "/dashboard", "/dashboard-loja", "/login", "/pagamento", "/impulsionar"],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteUrl,
  };
}
