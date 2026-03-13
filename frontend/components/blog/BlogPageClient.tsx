// frontend/components/blog/BlogPageClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlogCategory, BlogPageContent, BlogPost } from "@/lib/blog/blog-page";

interface BlogPageClientProps {
  content: BlogPageContent;
}

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return "16 de abril de 2024";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function CategoryIcon({ type }: { type?: BlogCategory["icon"] }) {
  if (type === "maintenance") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="m14 7 3 3M4 20l6-6m2-7 4-4 5 5-4 4-5-5Z" />
      </svg>
    );
  }

  if (type === "news") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M3 11.5 12 4l9 7.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7.5Z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function BlogPostCard({
  post,
  featured = false,
}: {
  post: BlogPost;
  featured?: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-[20px] border border-[#E7EAF3] bg-white shadow-[0_12px_28px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,30,60,0.10)]">
      <Link href={`/blog/post/${post.slug}`} className="block">
        <div className={`overflow-hidden ${featured ? "aspect-[1.26/0.74]" : "aspect-[1.12/0.78]"}`}>
          <img
            src={post.coverImage}
            alt={post.title}
            className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]"
            loading="lazy"
          />
        </div>

        <div className="px-4 pb-4 pt-4 md:px-5 md:pb-5">
          <div className="mb-2 inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-[12px] font-extrabold text-[#1F66E5]">
            {post.category}
          </div>

          <h3 className={`font-extrabold leading-[1.16] text-[#1D2440] ${featured ? "text-[22px]" : "text-[18px]"}`}>
            {post.title}
          </h3>

          <p className="mt-3 text-[15px] text-[#7A8197]">{formatDate(post.publishedAt)}</p>

          <p className="mt-3 text-[16px] leading-7 text-[#636C82]">
            {post.excerpt}
          </p>

          <div className="mt-4 inline-flex items-center gap-2 text-[16px] font-bold text-[#2F67F6]">
            <span>{post.ctaLabel || post.readTime}</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
        </div>
      </Link>
    </article>
  );
}

function SidebarCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-[#E7EAF3] bg-white p-5 shadow-[0_12px_28px_rgba(20,30,60,0.06)]">
      <h3 className="text-[22px] font-extrabold text-[#1D2440]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BlogPageClient({ content }: BlogPageClientProps) {
  const [query, setQuery] = useState("");

  const allPosts = useMemo(
    () => [...content.featuredPosts, ...content.popularPosts],
    [content.featuredPosts, content.popularPosts]
  );

  const filteredFeatured = useMemo(() => {
    if (!query.trim()) return content.featuredPosts;

    const normalized = query.trim().toLowerCase();
    return content.featuredPosts.filter(
      (post) =>
        post.title.toLowerCase().includes(normalized) ||
        post.excerpt.toLowerCase().includes(normalized) ||
        post.category.toLowerCase().includes(normalized)
    );
  }, [content.featuredPosts, query]);

  const filteredPopular = useMemo(() => {
    if (!query.trim()) return content.popularPosts;

    const normalized = query.trim().toLowerCase();
    return content.popularPosts.filter(
      (post) =>
        post.title.toLowerCase().includes(normalized) ||
        post.excerpt.toLowerCase().includes(normalized) ||
        post.category.toLowerCase().includes(normalized)
    );
  }, [content.popularPosts, query]);

  const searchCount = query.trim()
    ? filteredFeatured.length + filteredPopular.length
    : allPosts.length;

  return (
    <main className="bg-[#F5F7FC]">
      <section
        className="relative overflow-hidden border-b border-[#E7EAF3]"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(248,249,253,0.96) 0%, rgba(248,249,253,0.80) 44%, rgba(248,249,253,0.22) 100%), url('${content.heroBanner.image}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-12">
          <div className="max-w-[760px]">
            <h1 className="text-[38px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#1D2440] md:text-[58px]">
              {content.heroBanner.title}
            </h1>

            <p className="mt-4 text-[20px] leading-8 text-[#5D667D] md:text-[24px]">
              {content.heroBanner.subtitle}
            </p>

            <div className="mt-8 max-w-[760px]">
              <div className="flex h-[62px] items-center rounded-[16px] border border-[#E6EAF2] bg-white px-5 shadow-[0_12px_22px_rgba(20,30,60,0.05)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 text-[#8792A9]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                >
                  <path d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
                </svg>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Pesquisar artigos"
                  className="ml-3 h-full w-full bg-transparent text-[20px] text-[#1D2440] outline-none placeholder:text-[#9AA3B8]"
                />
                <span className="inline-flex h-9 min-w-[36px] items-center justify-center rounded-full bg-[#E8F7EF] px-3 text-[13px] font-extrabold text-[#1F7A57]">
                  {searchCount}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-5">
              <h2 className="text-[28px] font-extrabold text-[#1D2440] md:text-[34px]">
                Destaques em {content.cityName}
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {filteredFeatured.map((post) => (
                <BlogPostCard key={post.id} post={post} featured />
              ))}
            </div>

            <div className="mt-8">
              <h2 className="text-[28px] font-extrabold text-[#1D2440] md:text-[34px]">
                Artigos populares em {content.cityName}
              </h2>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredPopular.map((post) => (
                <BlogPostCard key={post.id} post={post} />
              ))}
            </div>
          </div>

          <aside className="space-y-5">
            <SidebarCard title={content.sidebarSaleCta.title}>
              <p className="text-[18px] leading-8 text-[#5E6880]">
                {content.sidebarSaleCta.subtitle}
              </p>

              <Link
                href={content.sidebarSaleCta.ctaHref}
                className="mt-5 inline-flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#F5A623] px-5 text-[20px] font-extrabold text-white transition hover:bg-[#E89C17]"
              >
                {content.sidebarSaleCta.ctaLabel}
              </Link>
            </SidebarCard>

            <SidebarCard title={content.newsletter.title}>
              <p className="text-[18px] leading-8 text-[#5E6880]">
                {content.newsletter.subtitle}
              </p>

              <input
                placeholder={content.newsletter.placeholder}
                className="mt-4 h-[52px] w-full rounded-[12px] border border-[#E6EAF2] bg-[#FCFDFF] px-4 text-[16px] text-[#1D2440] outline-none placeholder:text-[#9BA4B8]"
              />

              <button
                type="button"
                className="mt-4 inline-flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#2F67F6] px-5 text-[20px] font-extrabold text-white transition hover:bg-[#2457DC]"
              >
                {content.newsletter.ctaLabel}
              </button>
            </SidebarCard>

            <SidebarCard title="Categorias">
              <div className="space-y-2">
                {content.categories.map((category) => (
                  <Link
                    key={category.id}
                    href={category.href}
                    className="flex items-center justify-between rounded-[12px] px-1 py-2 text-[#33405A] transition hover:bg-[#F7F9FC]"
                  >
                    <span className="flex items-center gap-3 text-[17px] font-semibold">
                      <span className="text-[#7F8BA3]">
                        <CategoryIcon type={category.icon} />
                      </span>
                      {category.label}
                    </span>

                    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#8A94AA]" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </SidebarCard>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6">
        <div
          className="overflow-hidden rounded-[24px] border border-[#E7EAF3] shadow-[0_16px_34px_rgba(20,30,60,0.08)]"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(22,31,58,0.84) 0%, rgba(22,31,58,0.54) 42%, rgba(22,31,58,0.16) 100%), url('${content.bottomBanner.image}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="flex min-h-[220px] flex-col gap-6 px-6 py-8 md:flex-row md:items-end md:justify-between md:px-8">
            <div className="max-w-[520px]">
              <h2 className="text-[30px] font-extrabold leading-tight text-white md:text-[44px]">
                {content.bottomBanner.title}
              </h2>
              <p className="mt-4 text-[18px] leading-8 text-white/85">
                {content.bottomBanner.subtitle}
              </p>
            </div>

            <Link
              href={content.bottomBanner.ctaHref || "/planos"}
              className="inline-flex h-[56px] items-center justify-center rounded-[14px] bg-[#F5A623] px-8 text-[22px] font-extrabold text-white transition hover:bg-[#E89C17]"
            >
              {content.bottomBanner.ctaLabel || "Criar anúncio grátis"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
