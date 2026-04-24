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
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default nextConfig;
