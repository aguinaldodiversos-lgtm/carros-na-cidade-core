// frontend/components/blog/BlogPageClient.tsx
//
// PR L — /blog/[cidade] redesenhada como LISTAGEM editorial premium
// alinhada com a mockup blog.png (estilo Instagram/app, mobile-first).
//
// Estrutura:
//   - H1 "Blog automotivo" + subtitle curto.
//   - Chips horizontais de categorias (scroll horizontal no mobile).
//   - Hero card editorial (1 destaque com badge categoria + título + tempo).
//   - Section "Destaques do blog" com grid 2x2 de cards.
//   - Section "Mais lidos" (popularPosts) — opcional 2x2.
//   - CTA azul "Encontre o carro ideal na sua região" → /comprar/cidade/{slug}.
//   - Banner "Anuncie grátis" (preserva sidebarSaleCta).
//   - SiteBottomNav (mobile fixa).
//
// Tudo via componentes oficiais do DS (Card, Badge, Button via classes
// equivalentes) e tokens. Nenhum <img> cru — usa next/image (editorial).
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import type { BlogPageContent, BlogPost } from "@/lib/blog/blog-page";

interface BlogPageClientProps {
  content: BlogPageContent;
}

const PLACEHOLDER_IMAGE = "/images/vehicle-placeholder.svg";

const CATEGORY_LABELS = [
  "Compra",
  "Venda",
  "Manutenção",
  "Mercado",
  "Financiamento",
  "Cidades",
] as const;

export function readingMinutesLabel(rawLabel: string | undefined): string {
  if (!rawLabel) return "5 min de leitura";
  const cleaned = rawLabel.replace(/^Ver\s+/i, "").trim();
  if (/leitura/i.test(cleaned)) return cleaned;
  if (/min/i.test(cleaned)) return `${cleaned} de leitura`;
  return cleaned;
}

export function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon() {
  return (
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
  );
}

function CategoryChip({ label, href, active }: { label: string; href: string; active?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
        active
          ? "bg-primary text-white shadow-card"
          : "bg-cnc-surface text-cnc-text-strong ring-1 ring-cnc-line hover:ring-primary/40"
      }`}
    >
      {label}
    </Link>
  );
}

function HeroFeaturedCard({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  return (
    <Link
      href={`/blog/${citySlug}/${post.slug}`}
      className="group relative block overflow-hidden rounded-2xl shadow-card transition hover:shadow-premium"
    >
      <div className="relative aspect-[16/10] w-full bg-cnc-bg">
        <Image
          src={post.coverImage || PLACEHOLDER_IMAGE}
          alt={post.title}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 720px"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white sm:p-6">
        <span className="inline-flex w-fit items-center rounded-full bg-cnc-warning px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
          {post.category || "GUIA"}
        </span>
        <h2 className="line-clamp-2 text-[18px] font-extrabold leading-tight sm:text-[22px] md:text-[26px]">
          {post.title}
        </h2>
        <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/90">
          <ClockIcon /> {readingMinutesLabel(post.readTime)}
        </p>
      </div>
    </Link>
  );
}

export function BlogPostCard({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  return (
    <Link
      href={`/blog/${citySlug}/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-cnc-line bg-cnc-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-premium"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-cnc-bg">
        <Image
          src={post.coverImage || PLACEHOLDER_IMAGE}
          alt={post.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          className="object-cover transition duration-300 group-hover:scale-[1.04]"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-primary">
          {post.category || "BLOG"}
        </span>
        <h3 className="line-clamp-2 text-[14px] font-extrabold leading-tight text-cnc-text-strong sm:text-[15px]">
          {post.title}
        </h3>
        <p className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[12px] text-cnc-muted">
          <ClockIcon /> {readingMinutesLabel(post.readTime)}
        </p>
      </div>
    </Link>
  );
}

function MarketplaceCta({ cityName, citySlug }: { cityName: string; citySlug: string }) {
  return (
    <section
      aria-label="Encontre carros na sua região"
      className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary-strong p-5 text-white shadow-card sm:p-6"
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
            Explore ofertas reais com filtros, abaixo da FIPE e contato direto com o anunciante.
          </p>
        </div>

        <Link
          href={`/comprar/cidade/${citySlug}`}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-[13px] font-extrabold text-primary shadow-card transition hover:bg-white/90"
        >
          Ver carros em {cityName}
          <ArrowRightIcon />
        </Link>
      </div>
    </section>
  );
}

function ToolsRow({ citySlug }: { citySlug: string }) {
  const tools = [
    { label: "Tabela FIPE", href: `/tabela-fipe/${citySlug}`, hint: "Consulta valor de mercado" },
    {
      label: "Simulador",
      href: `/simulador-financiamento/${citySlug}`,
      hint: "Calcule sua parcela",
    },
    { label: "Anunciar", href: "/anunciar", hint: "Publique seu carro" },
  ];

  return (
    <section aria-label="Ferramentas relacionadas" className="grid gap-3 sm:grid-cols-3">
      {tools.map((tool) => (
        <Link
          key={tool.href}
          href={tool.href}
          className="flex items-center justify-between rounded-xl border border-cnc-line bg-cnc-surface p-4 shadow-card transition hover:border-primary/40 hover:shadow-premium"
        >
          <div className="min-w-0">
            <p className="text-[13px] font-extrabold text-cnc-text-strong">{tool.label}</p>
            <p className="text-[12px] text-cnc-muted">{tool.hint}</p>
          </div>
          <span className="text-primary">
            <ArrowRightIcon />
          </span>
        </Link>
      ))}
    </section>
  );
}

export function BlogPageClient({ content }: BlogPageClientProps) {
  const cityName = content.cityName;
  const citySlug = content.citySlug;

  const heroPost: BlogPost | null = useMemo(() => {
    return content.featuredPosts?.[0] ?? content.popularPosts?.[0] ?? null;
  }, [content.featuredPosts, content.popularPosts]);

  const gridPosts: BlogPost[] = useMemo(() => {
    const featured = content.featuredPosts ?? [];
    const popular = content.popularPosts ?? [];
    const skipFirst = featured.length > 0 ? featured.slice(1) : popular.slice(0, 0);
    const combined = [...skipFirst, ...popular];
    const seen = new Set<string>();
    const unique: BlogPost[] = [];
    for (const post of combined) {
      if (!post?.id || seen.has(post.id)) continue;
      seen.add(post.id);
      unique.push(post);
      if (unique.length >= 6) break;
    }
    return unique;
  }, [content.featuredPosts, content.popularPosts]);

  const chipsHrefBase = `/blog/${citySlug}`;

  return (
    <>
      <main className="bg-cnc-bg pb-24 md:pb-12">
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6 sm:pt-6 lg:px-8">
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
              <li className="font-semibold text-cnc-text-strong">Blog</li>
            </ol>
          </nav>

          <header className="mt-3 sm:mt-4">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[34px] md:text-[40px]">
              Blog automotivo
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-snug text-cnc-muted sm:text-[15px]">
              Guias, dicas e notícias para comprar, vender e cuidar do seu carro em {cityName}.
            </p>
          </header>

          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:mt-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Categorias do blog"
          >
            {CATEGORY_LABELS.map((label, index) => (
              <CategoryChip
                key={label}
                label={label}
                href={`${chipsHrefBase}?categoria=${encodeURIComponent(label.toLowerCase())}`}
                active={index === 0}
              />
            ))}
          </div>

          {heroPost ? (
            <div className="mt-5 sm:mt-6">
              <HeroFeaturedCard post={heroPost} citySlug={citySlug} />
            </div>
          ) : null}

          <section className="mt-7" aria-label="Destaques do blog">
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-extrabold text-cnc-text-strong sm:text-[20px]">
                Destaques do blog
              </h2>
              <Link
                href={`/blog/${citySlug}?categoria=destaques`}
                className="text-[13px] font-bold text-primary transition hover:text-primary-strong"
              >
                Ver todos
              </Link>
            </div>

            {gridPosts.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
                {gridPosts.map((post) => (
                  <BlogPostCard key={post.id} post={post} citySlug={citySlug} />
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-cnc-line bg-cnc-surface p-5 text-[13px] text-cnc-muted">
                Em breve novos artigos para {cityName}. Volte em alguns dias.
              </p>
            )}
          </section>

          <div className="mt-7">
            <MarketplaceCta cityName={cityName} citySlug={citySlug} />
          </div>

          <div className="mt-6">
            <ToolsRow citySlug={citySlug} />
          </div>

          <section
            aria-label="Anuncie seu carro"
            className="mt-7 flex flex-col gap-4 rounded-2xl border border-cnc-line bg-cnc-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cnc-muted">
                {content.sidebarSaleCta?.title ? "Loja parceira" : "Vender carro"}
              </p>
              <h3 className="mt-1 text-[16px] font-extrabold leading-tight text-cnc-text-strong sm:text-[18px]">
                {content.bottomBanner?.title ?? "Quer vender seu carro rápido e seguro?"}
              </h3>
              <p className="mt-1 text-[13px] leading-snug text-cnc-muted sm:text-[14px]">
                {content.bottomBanner?.subtitle ?? `Anuncie grátis em ${cityName}.`}
              </p>
            </div>

            <Link
              href={content.bottomBanner?.ctaHref ?? "/anunciar"}
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-[13px] font-extrabold text-white shadow-card transition hover:bg-primary-strong"
            >
              {content.bottomBanner?.ctaLabel ?? "Anunciar grátis"}
            </Link>
          </section>
        </div>
      </main>

      <SiteBottomNav />
    </>
  );
}

export default BlogPageClient;
