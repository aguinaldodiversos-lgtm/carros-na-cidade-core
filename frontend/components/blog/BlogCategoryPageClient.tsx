"use client";

import Link from "next/link";
import { useMemo } from "react";
import type {
  BlogCategory,
  BlogCategoryId,
  BlogPageContent,
  BlogPost,
} from "@/lib/blog/blog-page";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

interface BlogCategoryPageClientProps {
  content: BlogPageContent & {
    categoryId: BlogCategoryId;
    categoryLabel: string;
    categoryDescription: string;
    categoryPosts: BlogPost[];
  };
}

const FALLBACK_BLOG_CITY_HREF = `/blog/${DEFAULT_PUBLIC_CITY_SLUG}`;
const FALLBACK_POST_IMAGE = "/images/blog/banner-blog.jpg";

function toText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toSafeImage(value: unknown, fallback: string) {
  return toText(value, fallback);
}

function normalizeHref(value: unknown, fallback: string) {
  const href = toText(value, fallback);
  return href.startsWith("/") || href.startsWith("http") ? href : fallback;
}

function normalizePostHref(post: BlogPost, citySlug?: string) {
  const slug = toText(post.slug, "");
  if (!slug) {
    return citySlug ? `/blog/${citySlug}` : FALLBACK_BLOG_CITY_HREF;
  }
  return citySlug ? `/blog/${citySlug}/${slug}` : `/blog/post/${slug}`;
}

const CATEGORY_STYLES: Record<
  BlogCategoryId,
  { ring: string; bg: string; icon: string; tagBg: string; tagText: string }
> = {
  compra: {
    ring: "ring-[#3F8CFF]/40",
    bg: "bg-[#EAF2FF]",
    icon: "text-[#2F67F6]",
    tagBg: "bg-[#2F67F6]",
    tagText: "text-white",
  },
  venda: {
    ring: "ring-[#9C7BFF]/40",
    bg: "bg-[#F1ECFF]",
    icon: "text-[#7E5BEF]",
    tagBg: "bg-[#7E5BEF]",
    tagText: "text-white",
  },
  manutencao: {
    ring: "ring-[#FFB050]/40",
    bg: "bg-[#FFF1DD]",
    icon: "text-[#F59A1A]",
    tagBg: "bg-[#F59A1A]",
    tagText: "text-white",
  },
  mercado: {
    ring: "ring-[#3CC68A]/40",
    bg: "bg-[#E3F8EE]",
    icon: "text-[#1FAE6A]",
    tagBg: "bg-[#1FAE6A]",
    tagText: "text-white",
  },
  financiamento: {
    ring: "ring-[#3CC0CF]/40",
    bg: "bg-[#E2F6F8]",
    icon: "text-[#1AA3B2]",
    tagBg: "bg-[#1AA3B2]",
    tagText: "text-white",
  },
  cidades: {
    ring: "ring-[#3F8CFF]/40",
    bg: "bg-[#E5F0FF]",
    icon: "text-[#2F67F6]",
    tagBg: "bg-[#2F67F6]",
    tagText: "text-white",
  },
};

function CategoryGlyph({ id }: { id: BlogCategoryId }) {
  const className = "h-7 w-7";
  const stroke = 1.8;

  switch (id) {
    case "compra":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" />
          <circle cx="9" cy="20" r="1.4" />
          <circle cx="17" cy="20" r="1.4" />
        </svg>
      );
    case "venda":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 13.5 13 21a2 2 0 0 1-2.8 0l-7.2-7.2a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7.4a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.6Z" />
          <circle cx="8.5" cy="8.5" r="1.4" />
        </svg>
      );
    case "manutencao":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a4 4 0 0 1 5.4 5.3l-3 3 5.6 5.6-2.1 2.1-5.6-5.6-3 3a4 4 0 0 1-5.4-5.3l3.4 3.4 2.1-2.1-3.4-3.4a4 4 0 0 1 5.3-5.4" />
        </svg>
      );
    case "mercado":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19V3" />
        </svg>
      );
    case "financiamento":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v18" />
          <path d="M16.5 7.5h-6a2.5 2.5 0 0 0 0 5h3a2.5 2.5 0 0 1 0 5h-6" />
        </svg>
      );
    case "cidades":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s7-7.6 7-13A7 7 0 1 0 5 9c0 5.4 7 13 7 13Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
  }
}

function formatDate(dateIso?: string) {
  if (!dateIso) return "";
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function CategoryPostCard({
  post,
  citySlug,
  styles,
  featured = false,
}: {
  post: BlogPost;
  citySlug: string;
  styles: (typeof CATEGORY_STYLES)[BlogCategoryId];
  featured?: boolean;
}) {
  const href = normalizePostHref(post, citySlug);
  const title = toText(post.title, "Artigo automotivo");
  const excerpt = toText(post.excerpt, "");
  const coverImage = toSafeImage(post.coverImage, FALLBACK_POST_IMAGE);
  const readTime = toText(post.readTime, "Ler artigo");
  const date = formatDate(post.publishedAt);

  return (
    <article
      className={`group overflow-hidden rounded-[20px] border border-[#E7EAF3] bg-white shadow-[0_10px_24px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,30,60,0.12)] ${
        featured ? "lg:col-span-2" : ""
      }`}
    >
      <Link href={href} className="block">
        <div className={`relative overflow-hidden ${featured ? "aspect-[2/1]" : "aspect-[1.6/1]"}`}>
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute left-3 top-3">
            <span
              className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${styles.tagBg} ${styles.tagText}`}
            >
              {toText(post.category, "Conteúdo")}
            </span>
          </div>
        </div>

        <div className="px-5 pb-5 pt-5">
          <h3
            className={`line-clamp-2 font-extrabold leading-[1.18] text-[#1D2440] ${
              featured ? "text-[22px] md:text-[28px]" : "text-[18px] md:text-[20px]"
            }`}
          >
            {title}
          </h3>

          {excerpt ? (
            <p className="mt-2 line-clamp-3 text-[14px] leading-6 text-[#636C82] md:text-[15px]">
              {excerpt}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#7A8197]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {readTime}
            </p>
            {date ? (
              <p className="text-[13px] font-medium text-[#7A8197]">{date}</p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function BlogCategoryPageClient({ content }: BlogCategoryPageClientProps) {
  const citySlug = toText(content.citySlug, DEFAULT_PUBLIC_CITY_SLUG);
  const cityName = toText(content.cityName, "São Paulo");
  const categoryId = content.categoryId;
  const categoryLabel = toText(content.categoryLabel, categoryId);
  const categoryDescription = toText(content.categoryDescription, "");
  const styles = CATEGORY_STYLES[categoryId];

  const posts = useMemo(
    () => (Array.isArray(content.categoryPosts) ? content.categoryPosts : []),
    [content.categoryPosts]
  );

  const otherCategories = useMemo<BlogCategory[]>(() => {
    return (Array.isArray(content.categories) ? content.categories : []).filter(
      (cat) => cat.id !== categoryId
    );
  }, [content.categories, categoryId]);

  return (
    <main className="bg-[#F5F7FC]">
      <section className="border-b border-[#EDF1F8] bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6 md:pb-10 md:pt-10">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-[13px] text-[#6C7488] md:text-[14px]">
            <Link href="/" className="hover:text-[#1D2440]">
              Início
            </Link>
            <span>/</span>
            <Link href={`/blog/${citySlug}`} className="hover:text-[#1D2440]">
              Blog
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#1D2440]">{categoryLabel}</span>
          </nav>

          <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:gap-7">
            <span
              className={`flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-full ${styles.bg} ring-2 ${styles.ring} md:h-[96px] md:w-[96px]`}
            >
              <span className={styles.icon}>
                <CategoryGlyph id={categoryId} />
              </span>
            </span>
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wider text-[#7A8197] md:text-[14px]">
                Categoria do blog
              </p>
              <h1 className="mt-1 text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#1D2440] md:text-[44px]">
                {categoryLabel}
              </h1>
              {categoryDescription ? (
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#5D667D] md:text-[18px]">
                  {categoryDescription}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 md:pt-10">
        {posts.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <CategoryPostCard
                key={post.id}
                post={post}
                citySlug={citySlug}
                styles={styles}
                featured={index === 0 && posts.length >= 3}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[20px] border border-dashed border-[#D8DFEC] bg-white px-6 py-12 text-center shadow-[0_8px_24px_rgba(20,30,60,0.04)]">
            <h2 className="text-[22px] font-extrabold text-[#1D2440]">
              Em breve, novos conteúdos por aqui
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-[16px] leading-7 text-[#6C7488]">
              Estamos preparando matérias exclusivas sobre {categoryLabel.toLowerCase()} em{" "}
              {cityName}. Volte em breve para conferir as novidades.
            </p>
            <Link
              href={`/blog/${citySlug}`}
              className="mt-5 inline-flex h-[48px] items-center justify-center rounded-[12px] bg-[#2F67F6] px-6 text-[15px] font-extrabold text-white transition hover:bg-[#2457DC]"
            >
              Voltar para o blog
            </Link>
          </div>
        )}
      </section>

      {otherCategories.length > 0 ? (
        <section className="mx-auto w-full max-w-7xl px-4 pt-10 sm:px-6">
          <h2 className="mb-4 text-[22px] font-extrabold tracking-[-0.01em] text-[#1D2440] md:text-[28px]">
            Explore outras categorias
          </h2>
          <div className="grid grid-cols-3 gap-4 md:grid-cols-5">
            {otherCategories.map((cat) => {
              const catStyles = CATEGORY_STYLES[cat.id];
              return (
                <Link
                  key={cat.id}
                  href={normalizeHref(cat.href, FALLBACK_BLOG_CITY_HREF)}
                  className="group flex flex-col items-center gap-2 rounded-[16px] border border-[#E7EAF3] bg-white p-4 shadow-[0_8px_20px_rgba(20,30,60,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(20,30,60,0.10)]"
                >
                  <span
                    className={`flex h-[56px] w-[56px] items-center justify-center rounded-full ${catStyles.bg} ring-2 ${catStyles.ring}`}
                  >
                    <span className={catStyles.icon}>
                      <CategoryGlyph id={cat.id} />
                    </span>
                  </span>
                  <span className="text-center text-[13px] font-semibold text-[#1D2440] md:text-[14px]">
                    {cat.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
        <div className="overflow-hidden rounded-[20px] border border-[#E5ECFF] bg-[#EAF1FF] shadow-[0_12px_28px_rgba(20,30,60,0.06)]">
          <div className="flex flex-col items-start gap-5 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2F67F6] text-white shadow-[0_6px_16px_rgba(47,103,246,0.35)]">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s7-7.6 7-13A7 7 0 1 0 5 9c0 5.4 7 13 7 13Z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold leading-tight text-[#1D2440] md:text-[24px]">
                  Encontre o carro ideal na sua região
                </h2>
                <p className="mt-1 text-[14px] leading-6 text-[#4D5670] md:text-[15px]">
                  Veículos verificados, vendedores confiáveis e as melhores oportunidades em{" "}
                  {cityName} e região.
                </p>
              </div>
            </div>

            <Link
              href={`/comprar/cidade/${citySlug}`}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#2F67F6] px-6 text-[16px] font-extrabold text-white transition hover:bg-[#2457DC] md:w-auto md:text-[17px]"
            >
              Ver carros em {cityName}
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default BlogCategoryPageClient;
