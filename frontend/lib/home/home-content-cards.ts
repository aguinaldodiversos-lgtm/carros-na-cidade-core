// frontend/lib/home/home-content-cards.ts
//
// Cards da seção "Conteúdo para comprar e vender com segurança" da Home.
//
// ── O defeito (SEO Fase 4.1A, achado P1-4) ───────────────────────────────────
// `ContentCardsSection.tsx` trazia SEIS `href` hardcoded:
//
//     /blog/compra-usado   /blog/tabela-fipe   /blog/financiamento
//     /blog/checklist      /blog/vender-rapido /blog/carro-cidade
//
// Foram escritos antes do CMS existir e nunca reconciliados com os slugs reais.
// Medido em produção em 2026-08-31: os SEIS respondem 404, e `blog_posts` tem
// 13 posts publicados, nenhum com esses slugs. Seis links mortos na página de
// maior autoridade do site.
//
// ── A regra ──────────────────────────────────────────────────────────────────
// A Home não inventa slug de blog. Os cards saem da MESMA fonte que o hub e o
// `blog.xml` usam (`fetchPublishedBlogPosts` → `/api/public/blog/posts`), na
// ordem que o backend já devolve (mais recentes primeiro).
//
// O destino é a CANÔNICA global do post, `/blog/<slug>` — a mesma URL que o
// `blog.xml` publica e que `buildCmsPostMetadata` declara como canonical. Não
// usamos a variante territorial `/blog/<cidade>/<slug>` aqui: a Home não tem
// cidade garantida, e foi exatamente esse tipo de suposição que produziu o
// achado P1-2.

import type { BlogCategoryId } from "@/lib/blog/blog-page";
import type { CmsBlogPost } from "@/lib/blog/blog-cms";

/** Slug do CMS é sempre `[a-z0-9-]`; qualquer outra coisa não é post. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Quantos cards a grade comporta (2 × 3 no mobile, 6 colunas no desktop). */
export const HOME_CONTENT_CARD_LIMIT = 6;

export type HomeContentCard = {
  id: string;
  title: string;
  href: string;
  categoryId: BlogCategoryId | null;
};

/**
 * PURA: posts publicados → cards.
 *
 * Descarta post sem título ou com slug fora do formato — card sem destino
 * navegável é pior que card ausente. Menos posts que o limite significa menos
 * cards; ZERO posts significa nenhum card, e a seção some (o caller decide).
 *
 * Não há fallback para os seis slugs antigos: eles não existem.
 */
export function buildHomeContentCards(
  posts: CmsBlogPost[] | null | undefined,
  limit = HOME_CONTENT_CARD_LIMIT
): HomeContentCard[] {
  if (!Array.isArray(posts)) return [];

  const max = Math.max(0, Number(limit) || 0);
  const cards: HomeContentCard[] = [];

  for (const post of posts) {
    if (cards.length >= max) break;
    if (!post) continue;

    const slug = String(post.slug || "").trim();
    if (!SLUG_RE.test(slug)) continue;

    const title = String(post.title || "").trim();
    if (!title) continue;

    cards.push({
      id: String(post.id ?? slug),
      title,
      href: `/blog/${slug}`,
      categoryId: post.category ?? null,
    });
  }

  return cards;
}
