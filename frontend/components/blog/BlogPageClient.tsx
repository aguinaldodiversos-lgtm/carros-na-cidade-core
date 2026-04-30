"use client";

import Link from "next/link";
import { useMemo } from "react";
import type {
  BlogCategory,
  BlogCategoryId,
  BlogPageContent,
  BlogPost,
  BlogTrendingItem,
} from "@/lib/blog/blog-page";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

interface BlogPageClientProps {
  content: BlogPageContent;
}

const FALLBACK_BLOG_CITY_HREF = `/blog/${DEFAULT_PUBLIC_CITY_SLUG}`;
const FALLBACK_HERO_IMAGE = "/images/imagem_banner_blog.png";
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
  { ring: string; bg: string; icon: string; label: string }
> = {
  compra: {
    ring: "ring-[#3F8CFF]/40",
    bg: "bg-[#EAF2FF]",
    icon: "text-[#2F67F6]",
    label: "text-[#1D2440]",
  },
  venda: {
    ring: "ring-[#9C7BFF]/40",
    bg: "bg-[#F1ECFF]",
    icon: "text-[#7E5BEF]",
    label: "text-[#1D2440]",
  },
  manutencao: {
    ring: "ring-[#FFB050]/40",
    bg: "bg-[#FFF1DD]",
    icon: "text-[#F59A1A]",
    label: "text-[#1D2440]",
  },
  mercado: {
    ring: "ring-[#3CC68A]/40",
    bg: "bg-[#E3F8EE]",
    icon: "text-[#1FAE6A]",
    label: "text-[#1D2440]",
  },
  financiamento: {
    ring: "ring-[#3CC0CF]/40",
    bg: "bg-[#E2F6F8]",
    icon: "text-[#1AA3B2]",
    label: "text-[#1D2440]",
  },
  cidades: {
    ring: "ring-[#3F8CFF]/40",
    bg: "bg-[#E5F0FF]",
    icon: "text-[#2F67F6]",
    label: "text-[#1D2440]",
  },
};

const CATEGORY_BADGE_COLORS: Record<BlogCategoryId, string> = {
  compra: "bg-[#2F67F6] text-white",
  venda: "bg-[#7E5BEF] text-white",
  manutencao: "bg-[#F59A1A] text-white",
  mercado: "bg-[#1FAE6A] text-white",
  financiamento: "bg-[#1AA3B2] text-white",
  cidades: "bg-[#2F67F6] text-white",
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

function CategoryButton({ category }: { category: BlogCategory }) {
  const styles = CATEGORY_STYLES[category.id];

  return (
    <Link
      href={normalizeHref(category.href, FALLBACK_BLOG_CITY_HREF)}
      className="group flex shrink-0 flex-col items-center gap-1.5 outline-none md:gap-2"
    >
      <span
        className={`flex h-[52px] w-[52px] items-center justify-center rounded-full ${styles.bg} ring-2 ${styles.ring} transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_8px_18px_rgba(20,30,60,0.10)] md:h-[72px] md:w-[72px]`}
      >
        <span className={`${styles.icon} [&_svg]:h-5 [&_svg]:w-5 md:[&_svg]:h-7 md:[&_svg]:w-7`}>
          <CategoryGlyph id={category.id} />
        </span>
      </span>
      <span className={`text-[11px] font-semibold ${styles.label} md:text-[14px]`}>
        {category.label}
      </span>
    </Link>
  );
}

function CategoryBadge({ post }: { post: BlogPost }) {
  const colorClass = post.categoryId
    ? CATEGORY_BADGE_COLORS[post.categoryId]
    : "bg-[#2F67F6] text-white";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${colorClass}`}
    >
      {toText(post.category, "Conteúdo")}
    </span>
  );
}

function FeaturedHeroBanner({
  badge,
  title,
  subtitle,
  image,
  readTime,
  href,
}: {
  badge?: string;
  title: string;
  subtitle: string;
  image: string;
  readTime?: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="relative block overflow-hidden rounded-[24px] border border-[#E7EAF3] shadow-[0_18px_40px_rgba(20,30,60,0.12)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_50px_rgba(20,30,60,0.16)]"
    >
      <div className="relative aspect-[1.6/1] w-full sm:aspect-[2/1] md:aspect-[2.4/1]">
        <img src={image} alt={title} className="h-full w-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/10 md:from-white/95 md:via-white/65 md:to-transparent" />
      </div>

      <div className="absolute inset-0 flex flex-col justify-center px-5 py-6 md:px-12 md:py-10">
        {badge ? (
          <span className="mb-3 inline-flex w-fit items-center rounded-md bg-[#2F67F6] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
            {badge}
          </span>
        ) : null}

        <h2 className="max-w-[260px] text-[22px] font-extrabold leading-[1.1] text-[#0F1A2E] sm:max-w-[460px] sm:text-[26px] sm:leading-[1.12] md:max-w-[520px] md:text-[40px] md:leading-[1.08]">
          {title}
        </h2>

        <p className="mt-3 max-w-[300px] text-[13px] leading-5 text-[#3D4660] sm:max-w-[460px] sm:text-[14px] sm:leading-6 md:max-w-[520px] md:text-[17px] md:leading-7">
          {subtitle}
        </p>

        {readTime ? (
          <p className="mt-3 inline-flex items-center gap-2 text-[12px] font-semibold text-[#5D667D] sm:text-[13px] md:mt-4 md:text-[14px]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            {readTime}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function ClockIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function readingMinutesLabel(value?: string) {
  const text = toText(value, "");
  if (!text) return "Ler artigo";
  if (/min/i.test(text)) return text;
  return `${text} de leitura`;
}

export function BlogPostCard({
  post,
  citySlug,
  featured: _featured,
}: {
  post: BlogPost;
  citySlug?: string;
  featured?: boolean;
}) {
  return <FeaturedPostCard post={post} citySlug={citySlug ?? DEFAULT_PUBLIC_CITY_SLUG} />;
}

function FeaturedPostCard({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  const href = normalizePostHref(post, citySlug);
  const title = toText(post.title, "Artigo automotivo");
  const coverImage = toSafeImage(post.coverImage, FALLBACK_POST_IMAGE);
  const readTime = toText(post.readTime, "");

  return (
    <article className="group overflow-hidden rounded-[20px] border border-[#E7EAF3] bg-white shadow-[0_10px_24px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,30,60,0.12)]">
      <Link href={href} className="block">
        <div className="relative aspect-[1.6/1] overflow-hidden">
          <img
            src={coverImage}
            alt={title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute left-3 top-3">
            <CategoryBadge post={post} />
          </div>
          <button
            type="button"
            aria-label="Salvar artigo"
            className="absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[#1D2440] shadow-[0_4px_12px_rgba(20,30,60,0.18)] transition hover:bg-white"
            onClick={(event) => event.preventDefault()}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
            </svg>
          </button>
        </div>

        <div className="px-3 pb-3 pt-3 md:px-5 md:pb-5 md:pt-4">
          <h3 className="line-clamp-2 text-[14px] font-extrabold leading-[1.22] text-[#1D2440] md:text-[18px]">
            {title}
          </h3>

          {readTime ? (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#7A8197] md:mt-3 md:gap-2 md:text-[13px]">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 md:h-4 md:w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              {readTime}
            </p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

function TrendingCard({ item }: { item: BlogTrendingItem }) {
  const href = normalizeHref(item.href, FALLBACK_BLOG_CITY_HREF);
  const image = toSafeImage(item.image, FALLBACK_POST_IMAGE);
  const title = toText(item.title, "Tendência da semana");

  return (
    <Link
      href={href}
      className="group flex shrink-0 flex-col gap-2 overflow-hidden rounded-[16px] bg-white shadow-[0_8px_20px_rgba(20,30,60,0.06)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(20,30,60,0.10)]"
      style={{ width: 168 }}
    >
      <div className="aspect-[1.46/1] overflow-hidden">
        <img
          src={image}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.05]"
          loading="lazy"
        />
      </div>
      <p className="line-clamp-2 px-3 pb-3 text-[13px] font-semibold leading-snug text-[#1D2440]">
        {title}
      </p>
    </Link>
  );
}

function PopularPostRow({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  const href = normalizePostHref(post, citySlug);
  const title = toText(post.title, "Artigo automotivo");
  const excerpt = toText(post.excerpt, "");
  const coverImage = toSafeImage(post.coverImage, FALLBACK_POST_IMAGE);

  return (
    <Link
      href={href}
      className="group flex gap-4 overflow-hidden rounded-[16px] border border-[#E7EAF3] bg-white p-3 shadow-[0_8px_20px_rgba(20,30,60,0.05)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(20,30,60,0.10)]"
    >
      <div className="aspect-square h-[88px] w-[88px] shrink-0 overflow-hidden rounded-[12px] md:h-[120px] md:w-[120px]">
        <img
          src={coverImage}
          alt={title}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <CategoryBadge post={post} />
        <h3 className="mt-2 line-clamp-2 text-[15px] font-extrabold leading-snug text-[#1D2440] md:text-[17px]">
          {title}
        </h3>
        {excerpt ? (
          <p className="mt-1 line-clamp-2 hidden text-[14px] text-[#636C82] md:block">{excerpt}</p>
        ) : null}
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#7A8197]">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          {toText(post.readTime, "Ler artigo")}
        </p>
      </div>
    </Link>
  );
}

export function BlogPageClient({ content }: BlogPageClientProps) {
  const citySlug = toText(content.citySlug, DEFAULT_PUBLIC_CITY_SLUG);
  const cityName = toText(content.cityName, "São Paulo");

  const heroBadge = toText(content.heroBanner?.badge, "DICA");
  const heroTitle = toText(
    content.heroBanner?.title,
    `Os carros que estão em alta em ${cityName}`
  );
  const heroSubtitle = toText(
    content.heroBanner?.subtitle,
    "Confira os modelos mais procurados, as tendências do mercado e dicas para fazer a melhor escolha."
  );
  const heroImage = toSafeImage(content.heroBanner?.image, FALLBACK_HERO_IMAGE);
  const heroReadTime = toText(content.heroBanner?.readTime, "6 min de leitura");
  const heroHref = `/blog/${citySlug}/categoria/mercado`;

  const bottomBannerTitle = toText(
    content.bottomBanner?.title,
    "Encontre o carro ideal na sua região"
  );
  const bottomBannerSubtitle = toText(
    content.bottomBanner?.subtitle,
    `Veículos verificados, vendedores confiáveis e as melhores oportunidades em ${cityName} e região.`
  );
  const bottomBannerHref = normalizeHref(
    content.bottomBanner?.ctaHref,
    `/comprar/cidade/${citySlug}`
  );
  const bottomBannerCta = toText(content.bottomBanner?.ctaLabel, `Ver carros em ${cityName}`);

  const safeCategories = useMemo(() => {
    return Array.isArray(content.categories) ? content.categories : [];
  }, [content.categories]);

  const safeFeatured = useMemo(() => {
    return Array.isArray(content.featuredPosts) ? content.featuredPosts.slice(0, 6) : [];
  }, [content.featuredPosts]);

  const safeTrending = useMemo(() => {
    return Array.isArray(content.trendingPosts) ? content.trendingPosts : [];
  }, [content.trendingPosts]);

  const safePopular = useMemo(() => {
    return Array.isArray(content.popularPosts) ? content.popularPosts : [];
  }, [content.popularPosts]);

  return (
    <main className="bg-[#F5F7FC]">
      <section className="border-b border-[#EDF1F8] bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-8 sm:px-6 md:pb-10 md:pt-12">
          <div className="max-w-3xl">
            <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#1D2440] md:text-[44px]">
              Blog automotivo
            </h1>
            <p className="mt-2 text-[15px] leading-7 text-[#5D667D] md:text-[18px]">
              Guias, dicas e notícias para comprar, vender e cuidar do seu carro.
            </p>
          </div>

          {safeCategories.length > 0 ? (
            <nav
              aria-label="Categorias do blog"
              className="-mx-4 mt-6 flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-6 sm:px-6 md:mx-0 md:mt-8 md:grid md:grid-cols-6 md:gap-5 md:overflow-visible md:px-0"
            >
              {safeCategories.map((category) => (
                <CategoryButton key={category.id} category={category} />
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 md:pt-8">
        <FeaturedHeroBanner
          badge={heroBadge}
          title={heroTitle}
          subtitle={heroSubtitle}
          image={heroImage}
          readTime={heroReadTime}
          href={heroHref}
        />
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 md:pt-10">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1D2440] md:text-[28px]">
            Destaques do blog
          </h2>
          <Link
            href={`/blog/${citySlug}/categoria/compra`}
            className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#2F67F6] transition hover:text-[#234EC1] md:text-[15px]"
          >
            Ver todos
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {safeFeatured.map((post) => (
            <FeaturedPostCard key={post.id} post={post} citySlug={citySlug} />
          ))}
        </div>
      </section>

      {safeTrending.length > 0 ? (
        <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 md:pt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="inline-flex items-center gap-2 text-[22px] font-extrabold tracking-[-0.01em] text-[#1D2440] md:text-[28px]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1FAE6A]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17 9 11l4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
              Tendências da semana
            </h2>
            <Link
              href={`/blog/${citySlug}/categoria/mercado`}
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#2F67F6] transition hover:text-[#234EC1] md:text-[15px]"
            >
              Ver mais
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </div>

          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:gap-4">
            {safeTrending.map((item) => (
              <TrendingCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {safePopular.length > 0 ? (
        <section className="mx-auto w-full max-w-7xl px-4 pt-8 sm:px-6 md:pt-10">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-[22px] font-extrabold tracking-[-0.01em] text-[#1D2440] md:text-[28px]">
              Mais lidos em {cityName}
            </h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {safePopular.map((post) => (
              <PopularPostRow key={post.id} post={post} citySlug={citySlug} />
            ))}
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
                  {bottomBannerTitle}
                </h2>
                <p className="mt-1 text-[14px] leading-6 text-[#4D5670] md:text-[15px]">
                  {bottomBannerSubtitle}
                </p>
              </div>
            </div>

            <Link
              href={bottomBannerHref}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#2F67F6] px-6 text-[16px] font-extrabold text-white transition hover:bg-[#2457DC] md:w-auto md:text-[17px]"
            >
              {bottomBannerCta}
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

export default BlogPageClient;
