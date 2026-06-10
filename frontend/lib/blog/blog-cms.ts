// frontend/lib/blog/blog-cms.ts
//
// Cliente SSR dos endpoints públicos do CMS do Blog (Fase 4.2):
//   GET /api/public/blog/posts        → lista published (paginada)
//   GET /api/public/blog/posts/:slug  → detalhe published (404 = null)
//
// Cache: revalidate 300s + tag `public-blog`. Publicar/despublicar no
// admin dispara revalidateTag('public-blog') via BFF → conteúdo novo
// aparece na navegação seguinte sem esperar o TTL.
//
// Convivência com o conteúdo estático legado (lib/blog/blog-page.ts):
// os posts do CMS entram NA FRENTE dos cards do hub; o fallback hardcoded
// continua preenchendo o layout enquanto houver poucos posts reais.

import type { Metadata } from "next";
import { getBackendApiBaseUrl, getInternalBackendApiBaseUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import { findCategoryDefinition, type BlogCategoryId, type BlogPost } from "@/lib/blog/blog-page";

export type CmsBlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  category: BlogCategoryId | null;
  tags: string[];
  published_at: string | null;
  updated_at: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  og_image_url: string | null;
  is_indexable: boolean;
  reading_time_minutes: number | null;
};

const BLOG_CACHE = { revalidate: 300, tags: ["public-blog"] };
const FALLBACK_COVER = "/images/vehicle-placeholder.svg";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    const internal = getInternalBackendApiBaseUrl();
    if (internal) return stripTrailingSlash(internal);
  }
  return stripTrailingSlash(getBackendApiBaseUrl());
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: "public-blog",
      next: BLOG_CACHE,
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Lista posts publicados (mais recentes primeiro). Falha de rede/backend
 * degrada para lista vazia — o hub cai no conteúdo fallback sem erro.
 */
export async function fetchPublishedBlogPosts({
  category,
  limit = 12,
  offset = 0,
}: {
  category?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ posts: CmsBlogPost[]; total: number }> {
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (offset > 0) params.set("offset", String(offset));
  if (category) params.set("category", category);

  const json = await fetchJson<{
    success?: boolean;
    data?: CmsBlogPost[];
    total?: number;
  }>(`${apiBase}/api/public/blog/posts?${params.toString()}`);

  if (!json || json.success === false || !Array.isArray(json.data)) {
    return { posts: [], total: 0 };
  }
  return { posts: json.data, total: json.total || json.data.length };
}

/**
 * Detalhe de post publicado por slug. null para inexistente OU
 * não-publicado (backend responde 404 para ambos).
 */
export async function fetchPublishedBlogPost(slug: string): Promise<CmsBlogPost | null> {
  const safe = String(slug || "").trim();
  // Slug do CMS é sempre [a-z0-9-]; qualquer outra coisa não é post.
  if (!safe || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(safe)) return null;

  const apiBase = getApiBaseUrl();
  const json = await fetchJson<{ success?: boolean; data?: CmsBlogPost }>(
    `${apiBase}/api/public/blog/posts/${encodeURIComponent(safe)}`
  );
  if (!json || json.success === false || !json.data) return null;
  return json.data;
}

/** "2026-06-10T03:00:00.000Z" → "2026-06-10" (shape dos cards legados). */
function toDateOnly(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Converte um post do CMS para o shape `BlogPost` consumido pelos cards do
 * hub legado (BlogPageClient). Os cards linkam para
 * /blog/<cidade>/<slug> — essa URL também resolve posts do CMS (a página
 * dual tenta o CMS antes do fallback), com canonical /blog/<slug>.
 */
export function cmsPostToBlogPost(post: CmsBlogPost, cityLabel: string): BlogPost {
  const def = post.category ? findCategoryDefinition(post.category) : null;
  return {
    id: `cms-${post.id}`,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt || "",
    coverImage: post.cover_image_url || FALLBACK_COVER,
    publishedAt: toDateOnly(post.published_at),
    readTime: post.reading_time_minutes
      ? `${post.reading_time_minutes} min de leitura`
      : "Leitura rápida",
    category: def?.label ?? (post.category || "Blog"),
    categoryId: post.category ?? undefined,
    cityLabel,
  };
}

function resolveSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(/\/+$/, "");
}

/** Resolve a URL absoluta da capa para OG/JSON-LD. */
export function resolveCmsPostImage(post: CmsBlogPost): string | null {
  const raw = post.og_image_url || post.cover_image_url;
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  return `${resolveSiteUrl()}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

/**
 * Metadata Next.js de um post do CMS (Fase 4.2 §8):
 *   - meta_title/meta_description com fallback title/excerpt;
 *   - canonical: canonical_url do post OU o path canônico recebido;
 *   - robots por is_indexable (post não-indexável continua acessível,
 *     mas com noindex/follow);
 *   - Open Graph type article + imagem.
 */
export function buildCmsPostMetadata(post: CmsBlogPost, canonicalPath: string): Metadata {
  const title = (post.meta_title?.trim() || post.title).slice(0, 70);
  const description = (
    post.meta_description?.trim() ||
    post.excerpt?.trim() ||
    `${post.title} — Blog Carros na Cidade.`
  ).slice(0, 200);
  const canonical = post.canonical_url?.trim() || canonicalPath;
  const image = resolveCmsPostImage(post);

  return {
    title: `${title} | Blog Carros na Cidade`,
    description,
    alternates: { canonical },
    robots: post.is_indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      locale: "pt_BR",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * JSON-LD BlogPosting do post (Article schema com datePublished e
 * dateModified reais do banco).
 */
export function buildCmsPostJsonLd(post: CmsBlogPost, pageUrl: string) {
  const siteUrl = resolveSiteUrl();
  const image = resolveCmsPostImage(post);
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt || undefined,
    url: pageUrl,
    mainEntityOfPage: { "@type": "WebPage", "@id": pageUrl },
    datePublished: post.published_at || undefined,
    dateModified: post.updated_at || post.published_at || undefined,
    ...(image ? { image } : {}),
    articleSection: post.category || undefined,
    inLanguage: "pt-BR",
    author: {
      "@type": "Organization",
      name: "Carros na Cidade",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "Carros na Cidade",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/images/logo-carros-na-cidade.png`,
      },
    },
  };
}
