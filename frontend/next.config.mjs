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
