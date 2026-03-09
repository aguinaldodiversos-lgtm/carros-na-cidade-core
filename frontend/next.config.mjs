// frontend/next.config.js

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Evita "static export" acidental e mantém o app pronto para deploy Node (SSR/Routes/Sitemaps)
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
