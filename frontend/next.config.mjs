/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Em Next 14.x, a chave correta e experimental.serverComponentsExternalPackages.
  // (serverExternalPackages so existe a partir do Next 15; mantinhamos a
  // legacy gerando warning no build do Render.)
  experimental: {
    serverComponentsExternalPackages: ["@aws-sdk/client-s3"],
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/images/favicon.png" }];
  },
  /**
   * Cache long-lived APENAS para /images/* (assets manuais em frontend/public/images).
   *
   * Motivação (2026-05-20, contenção de bandwidth):
   *   Antes, o Render servia banner-home.png (2 MB), banner-blog.png (2 MB),
   *   pagina-Comprar-Estadual.png (4.7 MB) e outras 12 imagens grandes com
   *   `Cache-Control: public, max-age=0`. Cada visita re-baixava megabytes
   *   do origin — gargalo estimado em 30-50% do bandwidth total do
   *   serviço frontend.
   *
   * Escopo deliberadamente restrito:
   *   - Aplica APENAS a /images/:path* (assets físicos em /public/images/).
   *   - NÃO toca em rotas SSR (HTML), /_next/* (já cacheado pelo Next),
   *     /api/*, /_next/image (proxy dinâmico).
   *
   * Requisito de versionamento:
   *   Assets em /public/images/ NÃO são versionados por hash automático
   *   (Next só faz isso para /_next/static/*). Qualquer atualização DEVE
   *   trocar o nome do arquivo (ex.: banner-home-v2.png) ou conviver com
   *   até 1 ano de cache stale em browsers existentes. Documentado em
   *   docs/runbooks/bandwidth-hardening-runbook.md (a ser atualizado).
   */
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      // ─────────────────────────────────────────────────────────────────────
      // Áreas PRIVADAS (Fase 0.1): nunca cacheável, nunca indexável.
      //
      // Até aqui a única proteção dos painéis era `Disallow:` no robots.txt.
      // Isso impede RASTREAR, não impede INDEXAR: uma URL só descoberta por
      // link externo pode entrar no índice sem conteúdo, e o robots.txt não
      // diz nada a proxies e caches intermediários sobre uma resposta que
      // contém dados de UMA pessoa.
      //
      // As páginas já são `dynamic = "force-dynamic"`, o que impede o Next de
      // gerá-las estaticamente — mas isso é sobre o build, não sobre quem
      // guarda a resposta depois dela sair daqui.
      //
      // Duas entradas por prefixo de propósito: em path-to-regexp,
      // `/dashboard/:path*` cobre `/dashboard/x`, e a entrada sem parâmetro
      // garante a raiz `/dashboard` sem depender do comportamento de
      // zero-ocorrências do `*`.
      //
      // Escopo restrito aos dois painéis: NENHUMA rota pública (`/`,
      // `/comprar`, `/carros-em/*`, `/veiculo/*`, `/lojas/*`, `/blog/*`) casa
      // com estes prefixos — se casasse, teríamos desindexado o site.
      // Coberto por `next.config.headers.test.ts`.
      //
      // As novas áreas dos Produtos A e B nascem sob estes mesmos prefixos e
      // herdam a política sem tocar nesta configuração de novo.
      ...["/dashboard", "/dashboard/:path*", "/dashboard-loja", "/dashboard-loja/:path*"].map(
        (source) => ({
          source,
          headers: [
            { key: "Cache-Control", value: "private, no-store" },
            { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          ],
        })
      ),
    ];
  },
  images: {
    // KILL SWITCH GLOBAL (2026-05-13, segunda iteração do fix de bandwidth).
    //
    // Após o primeiro fix, validação em DevTools ainda mostrou imagens R2
    // passando por /_next/image?url=https%3A%2F%2Fpub-...r2.dev. Causa:
    //   - NEXT_PUBLIC_R2_PUBLIC_BASE_URL não estava setado no Render, então
    //     o helper `shouldSkipNextImageOptimizer` não reconhecia *.r2.dev
    //     como host interno;
    //   - 8 componentes (VehicleGallery, MobileHero, dashboard/AdCard,
    //     account/AdsPremiumList, impulsionar/[adId], LocalSeoLanding,
    //     VehicleGalleryLightbox, admin/moderation/[id]) usam <Image>
    //     diretamente, contornando o VehicleImage.
    //
    // `unoptimized: true` faz com que qualquer <Image> renderize a tag
    // <img> com `src` original, sem prefixo /_next/image. Zero bytes
    // de imagem passam pelo origin do Render. Custo: perdemos as variantes
    // responsivas que o /_next/image gerava — mas como o R2 já entrega
    // o original em CDN edge, o ganho real era pequeno e estava sendo
    // PAGO com bandwidth do Render (caminho duplo).
    //
    // Para reativar otimização de Unsplash/CMS no futuro, converter os
    // 8 bypasses para VehicleImage primeiro, depois remover esta linha.
    unoptimized: true,
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    // remotePatterns ficam para o dia que sairmos do unoptimized global.
    //
    // `img.carrosnacidade.com` (domínio próprio na frente do bucket R2 desde
    // 2026-07-26) está listado por PRECAUÇÃO, não por necessidade: hoje o
    // `unoptimized: true` acima faz todo <Image> virar <img> cru e nada passa
    // pelo /_next/image. Mas se alguém remover o kill switch sem lembrar
    // disto, as fotos dos anúncios cairiam no otimizador com host não
    // permitido → HTTP 400 → vitrine inteira sem foto. Uma linha barata
    // contra um modo de falha caro.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "img.carrosnacidade.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
