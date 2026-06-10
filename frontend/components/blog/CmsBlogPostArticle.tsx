// frontend/components/blog/CmsBlogPostArticle.tsx
//
// Artigo completo de um post do CMS (Fase 4.2) — substitui o shell
// "Conteúdo completo em breve" quando o slug corresponde a um post
// PUBLICADO no blog_posts. Server component: o conteúdo Markdown é
// renderizado no servidor com o renderer seguro (lib/blog/markdown) —
// nada de dangerouslySetInnerHTML para conteúdo vindo do banco.
import Image from "next/image";
import Link from "next/link";

import { BlogPostCard } from "@/components/blog/BlogPageClient";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { MarkdownContent } from "@/lib/blog/markdown";
import { cmsPostToBlogPost, type CmsBlogPost } from "@/lib/blog/blog-cms";
import { findCategoryDefinition } from "@/lib/blog/blog-page";

const PLACEHOLDER_IMAGE = "/images/vehicle-placeholder.svg";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function CmsBlogPostArticle({
  post,
  relatedPosts,
  citySlug,
  cityName,
  cityLabel,
}: {
  post: CmsBlogPost;
  relatedPosts: CmsBlogPost[];
  citySlug: string;
  cityName: string;
  cityLabel: string;
}) {
  const buyHref = `/comprar/cidade/${encodeURIComponent(citySlug)}`;
  const blogHref = `/blog/${encodeURIComponent(citySlug)}`;
  const coverImage = post.cover_image_url || PLACEHOLDER_IMAGE;
  const categoryLabel = post.category
    ? (findCategoryDefinition(post.category)?.label ?? post.category)
    : "Blog";
  const publishedLabel = formatDate(post.published_at);
  const related = relatedPosts
    .filter((p) => p.id !== post.id)
    .slice(0, 3)
    .map((p) => cmsPostToBlogPost(p, cityLabel));

  return (
    <>
      <main className="bg-cnc-bg pb-24 md:pb-12">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="text-[12px] text-cnc-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="transition hover:text-primary">
                  Home
                </Link>
              </li>
              <li aria-hidden className="text-cnc-line">
                ›
              </li>
              <li>
                <Link href={blogHref} className="transition hover:text-primary">
                  Blog
                </Link>
              </li>
              <li aria-hidden className="text-cnc-line">
                ›
              </li>
              <li className="font-semibold text-cnc-text-strong">{categoryLabel}</li>
            </ol>
          </nav>

          <article className="mt-4 sm:mt-5">
            <header>
              <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                {categoryLabel}
              </span>

              <h1 className="mt-2.5 text-[22px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:mt-3 sm:text-[28px] md:text-[34px]">
                {post.title}
              </h1>

              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-cnc-muted sm:text-[13px]">
                {publishedLabel && (
                  <time dateTime={post.published_at || undefined}>{publishedLabel}</time>
                )}
                {post.reading_time_minutes != null && (
                  <span>{post.reading_time_minutes} min de leitura</span>
                )}
              </p>
            </header>

            <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-cnc-bg shadow-card sm:mt-5">
              <Image
                src={coverImage}
                alt={post.cover_image_alt || post.title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 720px"
                className="object-cover"
              />
            </div>

            {post.excerpt ? (
              <p className="mt-5 text-[15px] font-medium leading-relaxed text-cnc-text-strong sm:text-[17px]">
                {post.excerpt}
              </p>
            ) : null}

            {post.content ? <MarkdownContent content={post.content} className="mt-5" /> : null}

            {post.tags.length > 0 && (
              <p className="mt-6 flex flex-wrap items-center gap-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-cnc-line/40 px-2.5 py-1 text-[11px] font-semibold text-cnc-muted"
                  >
                    #{tag}
                  </span>
                ))}
              </p>
            )}

            <section
              aria-label="Encontre carros na sua região"
              className="mt-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-strong p-5 text-white shadow-card sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                    Vitrine local
                  </p>
                  <h2 className="mt-1 text-[18px] font-extrabold leading-tight sm:text-[22px]">
                    Encontre o carro ideal em {cityName}
                  </h2>
                  <p className="mt-1 text-[13px] leading-snug text-white/85 sm:text-[14px]">
                    Explore ofertas reais com filtros, abaixo da FIPE e contato direto com o
                    anunciante.
                  </p>
                </div>

                <Link
                  href={buyHref}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[13px] font-extrabold text-primary shadow-card transition hover:bg-white/90"
                >
                  Ver carros em {cityName}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </section>
          </article>

          {related.length > 0 && (
            <section className="mt-8" aria-label="Artigos relacionados">
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-extrabold text-cnc-text-strong sm:text-[20px]">
                  Artigos relacionados
                </h2>
                <Link
                  href={blogHref}
                  className="text-[13px] font-bold text-primary transition hover:text-primary-strong"
                >
                  Ver todos
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {related.map((rel) => (
                  <BlogPostCard key={rel.id} post={rel} citySlug={citySlug} />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <SiteBottomNav />
    </>
  );
}

export default CmsBlogPostArticle;
