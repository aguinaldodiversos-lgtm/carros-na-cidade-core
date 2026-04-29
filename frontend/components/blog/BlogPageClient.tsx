// frontend/components/blog/BlogPageClient.tsx
//
// /blog/[cidade] — listagem editorial premium mobile-first.
// Contrato visual oficial em frontend/public/images/blog.png:
//
//   1. Page header: h1 "Blog automotivo" + sub
//   2. Chips de categoria (com ícones, scroll horizontal mobile)
//   3. Hero card editorial (1 destaque com pill GUIA + título + tempo)
//   4. Section "Destaques do blog" + "Ver todos →" + grid 2x2 de cards
//      (chip de categoria colorido por tipo: DICAS=violet, MERCADO=success,
//      MANUTENÇÃO=warning, FINANCIAMENTO=primary, CIDADES=info, GUIA=warning)
//   5. Promo card "Encontre o carro ideal na sua região" → /comprar
//   6. SiteBottomNav (fora do <main>)
//
// Removido vs versão anterior:
//   - Breadcrumb (header já cobre navegação)
//   - MarketplaceCta gradient blue (substituído por promo card uniforme,
//     mesma linguagem visual da página FIPE — anti-divergência)
//
// Conteúdo dos posts vem de `frontend/lib/blog/blog-page.ts`. O fallback
// local serve enquanto o backend admin de blog não estiver pronto. Para
// produção: gerenciamento via /admin/blog (backlog).
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

/* ----------------------------------------------------------------------
 * Categorias (label + ícone + cor) — UI catálogo do mockup blog.png
 * ---------------------------------------------------------------------- */

type CategoryChipDef = {
  id: string;
  label: string;
  icon: () => JSX.Element;
};

const CATEGORY_CHIPS: ReadonlyArray<CategoryChipDef> = [
  { id: "compra", label: "Compra", icon: () => <CartIcon /> },
  { id: "venda", label: "Venda", icon: () => <TagIcon /> },
  { id: "manutencao", label: "Manutenção", icon: () => <WrenchIcon /> },
  { id: "mercado", label: "Mercado", icon: () => <BarsIcon /> },
  { id: "financiamento", label: "Financiamento", icon: () => <DollarIcon /> },
  { id: "cidades", label: "Cidades", icon: () => <PinIcon /> },
];

/**
 * Cor do chip de categoria nos cards do grid (e do hero). Mapeamento
 * lowercase do `category` do post para tom DS. Defaults para `info` se
 * desconhecido.
 */
type ChipTone = "primary" | "success" | "warning" | "violet" | "info" | "neutral";

function categoryTone(category: string | undefined): ChipTone {
  const c = (category || "").toLowerCase();
  if (c === "dicas" || c === "venda") return "violet";
  if (c === "mercado") return "success";
  if (c === "manutenção" || c === "manutencao") return "warning";
  if (c === "financiamento") return "primary";
  if (c === "cidades") return "info";
  if (c === "guia" || c === "compra") return "warning";
  return "neutral";
}

const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  primary: "bg-primary-soft text-primary ring-primary/30",
  success: "bg-cnc-success/10 text-cnc-success ring-cnc-success/30",
  warning: "bg-cnc-warning/15 text-cnc-warning ring-cnc-warning/35",
  violet: "bg-violet-100 text-violet-700 ring-violet-300/60",
  info: "bg-sky-100 text-sky-700 ring-sky-300/60",
  neutral: "bg-cnc-bg text-cnc-text ring-cnc-line",
};

/* ----------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

export function readingMinutesLabel(rawLabel: string | undefined): string {
  if (!rawLabel) return "5 min de leitura";
  const cleaned = rawLabel.replace(/^Ver\s+/i, "").trim();
  if (/leitura/i.test(cleaned)) return cleaned;
  if (/min/i.test(cleaned)) return `${cleaned} de leitura`;
  return cleaned;
}

/* ----------------------------------------------------------------------
 * Ícones inline (lucide-style, stroke 1.8)
 * ---------------------------------------------------------------------- */

function svgBase(extra: string = "h-3.5 w-3.5") {
  return {
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    className: extra,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

export function ClockIcon() {
  return (
    <svg {...svgBase()}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg {...svgBase(className)} strokeWidth={2.2}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M3 4h2l2.5 11.5a2 2 0 0 0 2 1.5h7.5a2 2 0 0 0 2-1.5L21 7H6" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <path d="M3 12V4h8l10 10-8 8L3 12Z" />
      <circle cx="8" cy="8" r="1.6" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <path d="M14.7 6.3a4 4 0 0 1 5 5l-2.5 2.5-3-3 .5-4.5Z" />
      <path d="m11 9-7 7a2.1 2.1 0 1 0 3 3l7-7" />
    </svg>
  );
}
function BarsIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <path d="M5 21V11M12 21V5M19 21v-7" />
    </svg>
  );
}
function DollarIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M15 9.5C15 8 13.7 7 12 7s-3 1-3 2.5 1.3 2.2 3 2.5c1.7.3 3 1 3 2.5S13.7 17 12 17s-3-1-3-2.5" />
    </svg>
  );
}
function PinIcon() {
  return (
    <svg {...svgBase("h-4 w-4")}>
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}
function MapPinSmallIcon() {
  return (
    <svg {...svgBase("h-5 w-5")}>
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}

/* ----------------------------------------------------------------------
 * Sub-componentes
 * ---------------------------------------------------------------------- */

function CategoryChip({
  chip,
  href,
  active,
}: {
  chip: CategoryChipDef;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition sm:px-3.5 sm:text-[13px] ${
        active
          ? "bg-primary text-white shadow-card"
          : "bg-cnc-surface text-cnc-text-strong ring-1 ring-cnc-line hover:ring-primary/40"
      }`}
    >
      <span className={active ? "text-white" : "text-primary"}>{chip.icon()}</span>
      {chip.label}
    </Link>
  );
}

function CategoryPill({ category, tone }: { category: string; tone: ChipTone }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.1em] ring-1 ring-inset ${CHIP_TONE_CLASS[tone]}`}
    >
      {category}
    </span>
  );
}

function HeroFeaturedCard({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  return (
    <Link
      href={`/blog/${citySlug}/${post.slug}`}
      className="group relative block overflow-hidden rounded-2xl shadow-card transition hover:shadow-premium"
    >
      <div className="relative aspect-[16/10] w-full bg-cnc-bg sm:aspect-[16/9]">
        <Image
          src={post.coverImage || PLACEHOLDER_IMAGE}
          alt={post.title}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 720px"
          className="object-cover transition duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 text-white sm:p-6">
        <span className="inline-flex w-fit items-center rounded-md bg-primary/90 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">
          {post.category || "GUIA"}
        </span>
        <h2 className="line-clamp-3 text-[18px] font-extrabold leading-[1.15] tracking-tight sm:text-[22px] md:text-[26px]">
          {post.title}
        </h2>
        <p className="inline-flex items-center gap-1.5 text-[12px] font-medium text-white/90">
          <ClockIcon /> {readingMinutesLabel(post.readTime)}
        </p>
      </div>

      {/* Carousel dots decorativos (mockup blog.png) */}
      <div
        aria-hidden="true"
        className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5"
      >
        <span className="h-1.5 w-6 rounded-full bg-white/90" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
        <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
      </div>
    </Link>
  );
}

export function BlogPostCard({ post, citySlug }: { post: BlogPost; citySlug: string }) {
  const tone = categoryTone(post.category);
  return (
    <Link
      href={`/blog/${citySlug}/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-cnc-line bg-cnc-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-premium"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-cnc-bg">
        <Image
          src={post.coverImage || PLACEHOLDER_IMAGE}
          alt={post.title}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          className="object-cover transition duration-300 group-hover:scale-[1.04]"
        />
        {/* Pill de categoria sobreposta no canto inferior-esquerdo */}
        {post.category ? (
          <span className="absolute bottom-2 left-2">
            <CategoryPill category={post.category} tone={tone} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-[14px] font-extrabold leading-tight text-cnc-text-strong sm:text-[15px]">
          {post.title}
        </h3>
        <p className="mt-auto inline-flex items-center gap-1.5 pt-1 text-[12px] text-cnc-muted">
          <ClockIcon /> {readingMinutesLabel(post.readTime)}
        </p>
      </div>
    </Link>
  );
}

function BottomPromoCard({ cityName, citySlug }: { cityName: string; citySlug: string }) {
  return (
    <section
      aria-label="Encontre carros na sua região"
      className="rounded-2xl border border-primary/20 bg-primary-soft px-4 py-3.5 sm:px-5 sm:py-4"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <MapPinSmallIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-extrabold leading-tight text-cnc-text-strong sm:text-[15px]">
            Encontre o carro ideal na sua região
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-cnc-muted sm:text-[13px]">
            Explore ofertas de veículos em {cityName} e região.
          </p>
        </div>
        <Link
          href={`/comprar/cidade/${citySlug}`}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3 text-[12.5px] font-bold text-white transition hover:bg-primary-strong sm:h-10 sm:px-4 sm:text-[13.5px]"
        >
          Ver carros em {cityName}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------
 * Página
 * ---------------------------------------------------------------------- */

export function BlogPageClient({ content }: BlogPageClientProps) {
  const cityName = content.cityName;
  const citySlug = content.citySlug;

  const heroPost: BlogPost | null = useMemo(() => {
    return content.featuredPosts?.[0] ?? content.popularPosts?.[0] ?? null;
  }, [content.featuredPosts, content.popularPosts]);

  // Cards do grid: pula o hero post (já em destaque) e mostra 4-6 abaixo.
  const gridPosts: BlogPost[] = useMemo(() => {
    const featured = content.featuredPosts ?? [];
    const popular = content.popularPosts ?? [];
    const skipFirst = featured.length > 0 ? featured.slice(1) : [];
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
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6 lg:max-w-5xl lg:px-8">
          {/* Page header */}
          <header>
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[28px] md:text-[34px]">
              Blog automotivo
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-cnc-muted sm:mt-2 sm:text-[14.5px]">
              Guias, dicas e notícias para comprar, vender e cuidar do seu carro.
            </p>
          </header>

          {/* Chips de categoria com ícones (scroll horizontal mobile) */}
          <div
            className="mt-3.5 flex gap-2 overflow-x-auto pb-1 sm:mt-5 sm:gap-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Categorias do blog"
          >
            {CATEGORY_CHIPS.map((chip) => (
              <CategoryChip
                key={chip.id}
                chip={chip}
                href={`${chipsHrefBase}?categoria=${chip.id}`}
              />
            ))}
          </div>

          {/* Hero post em destaque */}
          {heroPost ? (
            <div className="mt-4 sm:mt-5">
              <HeroFeaturedCard post={heroPost} citySlug={citySlug} />
            </div>
          ) : null}

          {/* Grid de destaques */}
          <section className="mt-6 sm:mt-7" aria-label="Destaques do blog">
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-extrabold leading-tight text-cnc-text-strong sm:text-[18px]">
                Destaques do blog
              </h2>
              <Link
                href={`/blog/${citySlug}?categoria=destaques`}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary transition hover:text-primary-strong"
              >
                Ver todos
                <ArrowRightIcon className="h-3.5 w-3.5" />
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

          {/* Promo único no rodapé do blog (mockup blog.png).
              Anti-duplicação: ToolsRow (FIPE/Simulador/Anunciar) e o banner
              extra "Anunciar grátis" foram removidos — esses destinos já
              são canônicos em HomePrimaryActions, no atalho "Vender" da
              home, no header desktop e no FAB do SiteBottomNav. */}
          <div className="mt-6 sm:mt-7">
            <BottomPromoCard cityName={cityName} citySlug={citySlug} />
          </div>
        </div>
      </main>

      <SiteBottomNav />
    </>
  );
}

export default BlogPageClient;
