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
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    // remotePatterns restritivo: somente hosts onde realmente queremos que
    // o /_next/image otimize variantes. Imagens de veículo (R2 público,
    // backend onrender, proxy /api/vehicle-images, /uploads) são marcadas
    // como `unoptimized` no <VehicleImage> e NÃO precisam estar listadas
    // aqui — o hostname "**" foi removido em 2026-05-13 para forçar
    // qualquer imagem remota arbitrária a quebrar visivelmente em dev em
    // vez de silenciosamente passar pelo otimizador do Render.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
