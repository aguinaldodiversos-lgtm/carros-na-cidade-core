// frontend/lib/blog/blog-hub.ts
//
// Lógica PURA de composição do hub do blog (Fase 4.2.1 — correção /blog).
//
// O hub (/blog e /blog/<cidade>) mostra:
//   - SOMENTE posts do CMS quando existem (source='cms', published);
//   - o fallback hardcoded (blog-page.ts) APENAS quando o CMS está vazio.
//
// Antes, a composição vivia inline em /blog/[cidade]/page.tsx e:
//   (a) /blog não a executava (era um redirect → bare /blog sem HTML de post);
//   (b) só renderizava 9 dos 13 posts (popularPosts = slice(6, 9)).
//
// Esta função centraliza a regra (sem I/O, testável) e é consumida pelo
// componente servidor compartilhado BlogHubServer, usado pelas DUAS rotas.

import type { BlogPageContent, BlogPost, BlogTrendingItem } from "@/lib/blog/blog-page";

/**
 * Mescla os cards do CMS no conteúdo do hub.
 *
 * - `cmsCards` vazio → retorna `content` intacto (o fallback hardcoded
 *   continua preenchendo o layout). NÃO duplica fallback + CMS.
 * - `cmsCards` não vazio → o CMS é a fonte canônica: TODOS os posts entram
 *   (featured = 6 primeiros; popular = o restante), garantindo que todos os
 *   posts adotados apareçam no HTML — não só os 9 primeiros.
 *
 * Os links dos cards apontam para /blog/<citySlug>/<slug> (rota que resolve o
 * post do CMS com canonical global /blog/<slug>).
 *
 * Função pura: não muta `content`, devolve um novo objeto.
 */
export function applyCmsPostsToHubContent(
  content: BlogPageContent,
  cmsCards: BlogPost[],
  citySlug: string
): BlogPageContent {
  if (!Array.isArray(cmsCards) || cmsCards.length === 0) {
    return content;
  }

  const featuredPosts = cmsCards.slice(0, 6);
  // Restante dos posts entra em "Mais lidos" — assim os 13 (ou N) adotados
  // aparecem todos no hub, não apenas os 9 do recorte antigo (slice(6, 9)).
  const popularPosts = cmsCards.slice(6);
  const trendingPosts: BlogTrendingItem[] = cmsCards.slice(0, 4).map((post) => ({
    id: `trend-${post.id}`,
    title: post.title,
    image: post.coverImage,
    href: `/blog/${encodeURIComponent(citySlug)}/${post.slug}`,
  }));

  return {
    ...content,
    featuredPosts,
    popularPosts,
    trendingPosts,
  };
}
