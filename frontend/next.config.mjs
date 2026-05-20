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
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
