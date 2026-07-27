import type { MetadataRoute } from "next";
import { getSiteUrl } from "../lib/seo/site";

/**
 * robots.txt do portal.
 *
 * ARQUIVO CRÍTICO: um `Disallow: /` acidental aqui desindexa o site inteiro.
 * Coberto por `app/robots.test.ts` — qualquer mudança tem que passar lá.
 *
 * Limpeza 2026-07-26 (GSC acusava 1 problema em cada uma das 4 variantes
 * apex/www × http/https):
 *
 *   - REMOVIDA a diretiva `Host:`. Nunca foi padrão — é extensão do Yandex, o
 *     Google nunca suportou, e era a ÚNICA linha não-canônica do arquivo (1
 *     por variante, batendo com a contagem do GSC). Estava ainda por cima
 *     malformada para a própria extensão: `Host` espera hostname nu, não URL
 *     com esquema. A canonicalização apex↔www já é feita pelo 301 e pela
 *     canonical das páginas — `Host:` não acrescentava nada.
 *
 *   - REMOVIDOS 11 `Allow:` redundantes. Com `Allow: /` no topo, nenhum deles
 *     mudava veredito: verificado caminho a caminho que nenhum contra-mandava
 *     um `Disallow` mais amplo (o padrão `Disallow: /x/` + `Allow: /x/publico/`
 *     NÃO ocorre aqui) e que os 27 caminhos de amostra recebem exatamente o
 *     mesmo veredito antes e depois.
 *
 * `Sitemap:` fica — é padrão e é o que importa.
 *
 * Casamento do robots.txt é por PREFIXO e vence a regra MAIS LONGA (RFC 9309);
 * a ordem das linhas é irrelevante. Ao adicionar um `Allow` novo, ele só faz
 * sentido se for mais específico que algum `Disallow` existente.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
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
  };
}
