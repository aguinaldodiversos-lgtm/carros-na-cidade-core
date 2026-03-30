"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlogCategory, BlogPageContent, BlogPost } from "@/lib/blog/blog-page";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

interface BlogPageClientProps {
  content: BlogPageContent;
}

const FALLBACK_PLANOS_HREF = "/planos";
const FALLBACK_BLOG_CITY_HREF = `/blog/${DEFAULT_PUBLIC_CITY_SLUG}`;
const FALLBACK_HERO_IMAGE = "/images/hero.jpeg";
const FALLBACK_BOTTOM_BANNER_IMAGE = "/images/banner1.jpg";

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
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path d="m14 7 3 3M4 20l6-6m2-7 4-4 5 5-4 4-5-5Z" />
      </svg>
    );
  }

  if (type === "news") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
      >
        <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path d="M3 11.5 12 4l9 7.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7.5Z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#D8DFEC] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(20,30,60,0.04)]">
      <h3 className="text-[22px] font-extrabold text-[#1D2440]">{title}</h3>
      <p className="mx-auto mt-3 max-w-[560px] text-[16px] leading-7 text-[#6C7488]">
        {description}
      </p>
    </div>
  );
}

function BlogPostCard({
  post,
  citySlug,
  featured = false,
}: {
  post: BlogPost;
  citySlug?: string;
  featured?: boolean;
}) {
  const href = normalizePostHref(post, citySlug);
  const title = toText(post.title, "Artigo automotivo");
  const excerpt = toText(
    post.excerpt,
    "Confira mais informações e conteúdos relevantes sobre o mercado automotivo."
  );
  const category = toText(post.category, "Conteúdo");
  const coverImage = toSafeImage(post.coverImage, FALLBACK_HERO_IMAGE);
  const ctaText = toText(post.ctaLabel, toText(post.readTime, "Ler artigo"));

  return (
    <article className="overflow-hidden rounded-[20px] border border-[#E7EAF3] bg-white shadow-[0_12px_28px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,30,60,0.10)]">
      <Link href={href} className="block">
        <div
          className={`overflow-hidden ${featured ? "aspect-[1.26/0.74]" : "aspect-[1.12/0.78]"}`}
        >
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover transition duration-500 hover:scale-[1.03]"
            loading="lazy"
          />
        </div>

        <div className="px-4 pb-4 pt-4 md:px-5 md:pb-5">
          <div className="mb-2 inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-[12px] font-extrabold text-[#1F66E5]">
            {category}
          </div>

          <h3
            className={`font-extrabold leading-[1.16] text-[#1D2440] ${
              featured ? "text-[22px]" : "text-[18px]"
            }`}
          >
            {title}
          </h3>

          <p className="mt-3 text-[15px] text-[#7A8197]">{formatDate(post.publishedAt)}</p>

          <p className="mt-3 text-[16px] leading-7 text-[#636C82]">{excerpt}</p>

          <div className="mt-4 inline-flex items-center gap-2 text-[16px] font-bold text-[#2F67F6]">
            <span>{ctaText}</span>
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m9 6 6 6-6 6" />
            </svg>
          </div>
        </div>
      </Link>
    </article>
  );
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-[#E7EAF3] bg-white p-5 shadow-[0_12px_28px_rgba(20,30,60,0.06)]">
      <h3 className="text-[22px] font-extrabold text-[#1D2440]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BlogPageClient({ content }: BlogPageClientProps) {
  const [query, setQuery] = useState("");

  const citySlug = toText(content.citySlug, DEFAULT_PUBLIC_CITY_SLUG);
  const cityName = toText(content.cityName, "São Paulo");

  const heroTitle = toText(content.heroBanner?.title, "Blog Carros na Cidade");
  const heroSubtitle = toText(
    content.heroBanner?.subtitle,
    `Dicas e notícias de automóveis em ${cityName} e região`
  );
  const heroImage = toSafeImage(content.heroBanner?.image, FALLBACK_HERO_IMAGE);

  const bottomBannerTitle = toText(
    content.bottomBanner?.title,
    "Quer vender seu carro rápido e seguro?"
  );
  const bottomBannerSubtitle = toText(
    content.bottomBanner?.subtitle,
    `Anuncie grátis em ${cityName} e fale direto com compradores da sua cidade.`
  );
  const bottomBannerImage = toSafeImage(content.bottomBanner?.image, FALLBACK_BOTTOM_BANNER_IMAGE);
  const bottomBannerHref = normalizeHref(content.bottomBanner?.ctaHref, FALLBACK_PLANOS_HREF);
  const bottomBannerCta = toText(content.bottomBanner?.ctaLabel, "Criar anúncio grátis");

  const sidebarTitle = toText(content.sidebarSaleCta?.title, "Anuncie seu carro grátis");
  const sidebarSubtitle = toText(
    content.sidebarSaleCta?.subtitle,
    "Venda fácil e segura na sua cidade."
  );
  const sidebarHref = normalizeHref(content.sidebarSaleCta?.ctaHref, FALLBACK_PLANOS_HREF);
  const sidebarCta = toText(content.sidebarSaleCta?.ctaLabel, "Criar anúncio grátis");

  const newsletterTitle = toText(content.newsletter?.title, "Receba as últimas");
  const newsletterSubtitle = toText(
    content.newsletter?.subtitle,
    "Dicas e novidades de automóveis na sua cidade."
  );
  const newsletterPlaceholder = toText(
    content.newsletter?.placeholder,
    "Digite seu melhor email aqui"
  );
  const newsletterCta = toText(content.newsletter?.ctaLabel, "Quero Receber");

  const safeCategories = useMemo(() => {
    return Array.isArray(content.categories) ? content.categories : [];
  }, [content.categories]);

  const safeFeaturedPosts = useMemo(() => {
    return Array.isArray(content.featuredPosts) ? content.featuredPosts : [];
  }, [content.featuredPosts]);

  const safePopularPosts = useMemo(() => {
    return Array.isArray(content.popularPosts) ? content.popularPosts : [];
  }, [content.popularPosts]);

  const allPosts = useMemo(
    () => [...safeFeaturedPosts, ...safePopularPosts],
    [safeFeaturedPosts, safePopularPosts]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredFeatured = useMemo(() => {
    if (!normalizedQuery) return safeFeaturedPosts;

    return safeFeaturedPosts.filter((post) => {
      const title = toText(post.title).toLowerCase();
      const excerpt = toText(post.excerpt).toLowerCase();
      const category = toText(post.category).toLowerCase();

      return (
        title.includes(normalizedQuery) ||
        excerpt.includes(normalizedQuery) ||
        category.includes(normalizedQuery)
      );
    });
  }, [safeFeaturedPosts, normalizedQuery]);

  const filteredPopular = useMemo(() => {
    if (!normalizedQuery) return safePopularPosts;

    return safePopularPosts.filter((post) => {
      const title = toText(post.title).toLowerCase();
      const excerpt = toText(post.excerpt).toLowerCase();
      const category = toText(post.category).toLowerCase();

      return (
        title.includes(normalizedQuery) ||
        excerpt.includes(normalizedQuery) ||
        category.includes(normalizedQuery)
      );
    });
  }, [safePopularPosts, normalizedQuery]);

  const searchCount = normalizedQuery
    ? filteredFeatured.length + filteredPopular.length
    : allPosts.length;

  const hasNoSearchResults =
    normalizedQuery.length > 0 && filteredFeatured.length === 0 && filteredPopular.length === 0;

  return (
    <main className="bg-[#F5F7FC]">
      <section
        className="relative overflow-hidden border-b border-[#E7EAF3]"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(248,249,253,0.96) 0%, rgba(248,249,253,0.80) 44%, rgba(248,249,253,0.22) 100%), url('${heroImage}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-12">
          <div className="max-w-[760px]">
            <h1 className="text-[38px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#1D2440] md:text-[58px]">
              {heroTitle}
            </h1>

            <p className="mt-4 text-[20px] leading-8 text-[#5D667D] md:text-[24px]">
              {heroSubtitle}
            </p>

            <div className="mt-8 max-w-[760px]">
              <div className="flex h-[62px] items-center rounded-[16px] border border-[#E6EAF2] bg-white px-5 shadow-[0_12px_22px_rgba(20,30,60,0.05)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6 shrink-0 text-[#8792A9]"
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
            {hasNoSearchResults ? (
              <EmptyState
                title="Nenhum artigo encontrado"
                description={`Não encontramos resultados para "${query}". Tente outra palavra-chave ou navegue pelos conteúdos em destaque da sua cidade.`}
              />
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="text-[28px] font-extrabold text-[#1D2440] md:text-[34px]">
                    Destaques em {cityName}
                  </h2>
                </div>

                {filteredFeatured.length > 0 ? (
                  <div className="grid gap-5 md:grid-cols-2">
                    {filteredFeatured.map((post) => (
                      <BlogPostCard key={post.id} post={post} citySlug={citySlug} featured />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="Sem destaques no momento"
                    description="Ainda não há artigos em destaque disponíveis para esta cidade."
                  />
                )}

                <div className="mt-8">
                  <h2 className="text-[28px] font-extrabold text-[#1D2440] md:text-[34px]">
                    Artigos populares em {cityName}
                  </h2>
                </div>

                {filteredPopular.length > 0 ? (
                  <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filteredPopular.map((post) => (
                      <BlogPostCard key={post.id} post={post} citySlug={citySlug} />
                    ))}
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState
                      title="Sem artigos populares"
                      description="Os conteúdos populares ainda estão sendo preparados para esta cidade."
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <aside className="space-y-5">
            <SidebarCard title={sidebarTitle}>
              <p className="text-[18px] leading-8 text-[#5E6880]">{sidebarSubtitle}</p>

              <Link
                href={sidebarHref}
                className="mt-5 inline-flex h-[54px] w-full items-center justify-center rounded-[14px] bg-[#F5A623] px-5 text-[20px] font-extrabold text-white transition hover:bg-[#E89C17]"
              >
                {sidebarCta}
              </Link>
            </SidebarCard>

            <SidebarCard title={newsletterTitle}>
              <p className="text-[18px] leading-8 text-[#5E6880]">{newsletterSubtitle}</p>

              <input
                placeholder={newsletterPlaceholder}
                className="mt-4 h-[52px] w-full rounded-[12px] border border-[#E6EAF2] bg-[#FCFDFF] px-4 text-[16px] text-[#1D2440] outline-none placeholder:text-[#9BA4B8]"
              />

              <button
                type="button"
                className="mt-4 inline-flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[#2F67F6] px-5 text-[20px] font-extrabold text-white transition hover:bg-[#2457DC]"
              >
                {newsletterCta}
              </button>
            </SidebarCard>

            <SidebarCard title="Categorias">
              <div className="space-y-2">
                {safeCategories.length > 0 ? (
                  safeCategories.map((category) => (
                    <Link
                      key={category.id}
                      href={normalizeHref(category.href, FALLBACK_BLOG_CITY_HREF)}
                      className="flex items-center justify-between rounded-[12px] px-1 py-2 text-[#33405A] transition hover:bg-[#F7F9FC]"
                    >
                      <span className="flex items-center gap-3 text-[17px] font-semibold">
                        <span className="text-[#7F8BA3]">
                          <CategoryIcon type={category.icon} />
                        </span>
                        {category.label}
                      </span>

                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-[#8A94AA]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  ))
                ) : (
                  <p className="text-[16px] leading-7 text-[#6C7488]">
                    As categorias serão exibidas aqui em breve.
                  </p>
                )}
              </div>
            </SidebarCard>
          </aside>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6">
        <div
          className="overflow-hidden rounded-[24px] border border-[#E7EAF3] shadow-[0_16px_34px_rgba(20,30,60,0.08)]"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(22,31,58,0.84) 0%, rgba(22,31,58,0.54) 42%, rgba(22,31,58,0.16) 100%), url('${bottomBannerImage}')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="flex min-h-[220px] flex-col gap-6 px-6 py-8 md:flex-row md:items-end md:justify-between md:px-8">
            <div className="max-w-[520px]">
              <h2 className="text-[30px] font-extrabold leading-tight text-white md:text-[44px]">
                {bottomBannerTitle}
              </h2>
              <p className="mt-4 text-[18px] leading-8 text-white/85">{bottomBannerSubtitle}</p>
            </div>

            <Link
              href={bottomBannerHref}
              className="inline-flex h-[56px] items-center justify-center rounded-[14px] bg-[#F5A623] px-8 text-[22px] font-extrabold text-white transition hover:bg-[#E89C17]"
            >
              {bottomBannerCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export default BlogPageClient;
