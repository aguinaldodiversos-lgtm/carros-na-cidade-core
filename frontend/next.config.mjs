/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // ✅ Render-friendly (gera .next/standalone)
  // ❌ NÃO use "export" (static export), porque suas rotas precisam de runtime (sitemaps + fetch)
  output: "standalone",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
};

module.exports = nextConfig;
