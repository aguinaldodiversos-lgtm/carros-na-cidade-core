/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/images/favicon.png" }];
  },
  images: {
    remotePatterns: [
      // CDN/storage para imagens de anúncios (ajustar conforme bucket real)
      { protocol: "https", hostname: "images.unsplash.com" },
      // Render.com — servidor de uploads (ajustar para domínio real em produção)
      { protocol: "https", hostname: "carros-na-cidade-api.onrender.com" },
      // Localhost para desenvolvimento
      { protocol: "http", hostname: "localhost" },
      // REMOVER: wildcard "**" eliminado — evita carregamento de imagens de qualquer host
    ],
  },
};

export default nextConfig;
