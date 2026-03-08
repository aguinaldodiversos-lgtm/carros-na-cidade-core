// frontend/lib/seo/site.ts

export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    process.env.SITE_URL?.replace(/\/+$/, "") ||
    "https://carrosnacidade.com"
  );
}

export function toAbsoluteUrl(path?: string | null): string {
  const siteUrl = getSiteUrl();

  if (!path) return siteUrl;
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl}${normalizedPath}`;
}
