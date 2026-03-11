function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getSiteUrl() {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_SITE_URL ||
      "https://carrosnacidade.com"
  );
}

export function toAbsoluteUrl(path: string) {
  const siteUrl = getSiteUrl();

  if (!path) return siteUrl;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}
