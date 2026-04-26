// frontend/components/blog/BlogPostPageClient.tsx
//
// Shell visual da rota /blog/[cidade]/[slug] (post individual).
// Resolve o 404 dos cards do grid sem entrar em arquitetura de
// conteúdo completo — exibe metadados do post (tipo BlogPost),
// um bloco "Conteúdo completo em breve" e CTAs para a vitrine
// local. PR L.2 substituirá o bloco quando houver content real.
"use client";

import Image from "next/image";
import Link from "next/link";

import {
  ArrowRightIcon,
  BlogPostCard,
  ClockIcon,
  readingMinutesLabel,
} from "@/components/blog/BlogPageClient";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import type { BlogPost } from "@/lib/blog/blog-page";

const PLACEHOLDER_IMAGE = "/images/vehicle-placeholder.svg";

interface BlogPostPageClientProps {
  post: BlogPost;
  relatedPosts: BlogPost[];
  citySlug: string;
  cityName: string;
}

export function BlogPostPageClient({
  post,
  relatedPosts,
  citySlug,
  cityName,
}: BlogPostPageClientProps) {
  const buyHref = `/comprar/cidade/${citySlug}`;
  const blogHref = `/blog/${citySlug}`;
  const coverImage = post.coverImage || PLACEHOLDER_IMAGE;

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
              <li className="font-semibold text-cnc-text-strong">{post.category || "Artigo"}</li>
            </ol>
          </nav>

          <article className="mt-4 sm:mt-5">
            <header>
              <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                {post.category || "BLOG"}
              </span>

              <h1 className="mt-3 text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[30px] md:text-[36px]">
                {post.title}
              </h1>

              <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-cnc-muted sm:text-[13px]">
                <ClockIcon /> {readingMinutesLabel(post.readTime)}
              </p>
            </header>

            <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-cnc-bg shadow-card sm:mt-5">
              <Image
                src={coverImage}
                alt={post.title}
                fill
                priority
                sizes="(max-width: 768px) 100vw, 720px"
                className="object-cover"
              />
            </div>

            {post.excerpt ? (
              <p className="mt-5 text-[15px] leading-relaxed text-cnc-text-strong sm:text-[16px]">
                {post.excerpt}
              </p>
            ) : null}

            <section
              aria-label="Conteúdo completo em breve"
              className="mt-6 rounded-2xl border border-dashed border-cnc-line bg-cnc-surface p-5 text-center shadow-card sm:p-6"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cnc-muted">
                Em produção
              </p>
              <h2 className="mt-1 text-[18px] font-extrabold leading-tight text-cnc-text-strong sm:text-[20px]">
                Conteúdo completo em breve
              </h2>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-snug text-cnc-muted sm:text-[14px]">
                Estamos preparando este artigo para você. Enquanto isso, confira as ofertas
                disponíveis em {cityName}.
              </p>
            </section>

            <section
              aria-label="Encontre carros na sua região"
              className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-strong p-5 text-white shadow-card sm:p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                    Vitrine local
                  </p>
                  <h3 className="mt-1 text-[18px] font-extrabold leading-tight sm:text-[22px]">
                    Encontre o carro ideal em {cityName}
                  </h3>
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
                  <ArrowRightIcon />
                </Link>
              </div>
            </section>
          </article>

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

            {relatedPosts.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {relatedPosts.map((related) => (
                  <BlogPostCard key={related.id} post={related} citySlug={citySlug} />
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-cnc-line bg-cnc-surface p-5 text-[13px] text-cnc-muted">
                Em breve novos artigos para {cityName}.
              </p>
            )}
          </section>
        </div>
      </main>

      <SiteBottomNav />
    </>
  );
}

export default BlogPostPageClient;
