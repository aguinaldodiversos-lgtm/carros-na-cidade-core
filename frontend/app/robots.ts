// frontend/app/robots.ts

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
          "/cidade/",
          "/blog/",
          "/comprar",
          "/simulador-financiamento",
          "/tabela-fipe",
          "/sitemap.xml",
          "/sitemaps/",
        ],
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard-loja",
          "/login",
          "/pagamento",
          "/impulsionar",
        ],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteUrl,
  };
}
