/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // IMPORTANT: não use output: "export" enquanto você tem rotas dinâmicas e sitemaps com fetch.
  // output: "standalone" ajuda no deploy (Render/Docker) e NÃO tenta exportar tudo como HTML estático.
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

export default nextConfig;
