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
          "/carros-em/",
          "/carros-baratos-em/",
          "/carros-automaticos-em/",
          "/veiculo/",
          "/blog/",
          "/tabela-fipe/",
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
          // NOTA (fase 1 de desindexação): o simulador é `noindex, follow` na própria
          // página. NÃO bloqueamos por robots aqui de propósito — se bloqueássemos, o
          // Google não rastrearia as ~30k URLs legadas `?veiculo=` e nunca veria o
          // noindex, atrasando a remoção delas do índice. Deixamos rastrear para o
          // noindex limpar o índice primeiro. Reintroduzir `Disallow:
          // /simulador-financiamento` numa 2ª fase, quando o GSC mostrar essas URLs
          // saindo do índice.
        ],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`],
    host: siteUrl,
  };
}
