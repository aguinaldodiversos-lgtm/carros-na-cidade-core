"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { SellFaq, SellPageContent, SellProfile } from "@/lib/sell/sell-page";
import type { SellHeroAd } from "@/lib/sell/sell-hero-ad";

type Props = {
  content: SellPageContent;
  heroAd?: SellHeroAd | null;
};

/* ----------------------------------------------------------------------------
 * Ícones locais (stroke/fill currentColor). Específicos desta landing —
 * não compartilhados com cards globais de veículo.
 * ------------------------------------------------------------------------- */

type IconProps = { className?: string };

function IconCheck({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowRight({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBolt({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 3L5 13h6l-1 8 8-10h-6l1-8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStore({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 10l2-5h14l2 5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 14h6v7H9z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCar({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 15l1.8-5.2A2 2 0 018.68 8h6.64a2 2 0 011.88 1.3L19 15"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <rect x="3" y="12" width="18" height="6" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7" cy="18" r="1.5" fill="currentColor" />
      <circle cx="17" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconMapPin({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCamera({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function IconRocket({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 4c3 1 5 4 5 8 0 1.5-.5 3-1 4l-3-1-3-3-1-3 1-3c1-.5 1.6-1.2 3-1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.5 14.5L7 17m0 0l-1.5 3 3-1.5M7 17l-2-2 3-1.5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="14.5" cy="9.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

function IconChat({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H9l-4 4v-4H6a2 2 0 01-2-2V6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconHeart({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 20s-7-4.4-9.2-8.4C1.3 8.7 2.7 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.3 0 4.7 3.2 3.2 6.1C19 15.6 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBookmark({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 4h12a1 1 0 011 1v15l-7-4-7 4V5a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShield({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.4-3 8.2-7 10-4-1.8-7-5.6-7-10V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSparkle({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconWhatsapp({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16 3C8.8 3 3 8.6 3 15.5c0 2.4.7 4.6 1.9 6.5L3 29l7.3-1.9c1.8 1 3.8 1.5 5.7 1.5 7.2 0 13-5.6 13-12.5S23.2 3 16 3zm0 22.8c-1.8 0-3.5-.5-5-1.3l-.4-.2-4.3 1.1 1.2-4.1-.3-.4a10 10 0 01-1.6-5.4C5.3 9.9 10.1 5.3 16 5.3s10.7 4.6 10.7 10.2S21.9 25.8 16 25.8z" />
      <path d="M12.5 10.6c-.3-.7-.5-.7-.8-.7h-.7c-.2 0-.6.1-.9.4-.3.4-1.2 1.1-1.2 2.7s1.2 3.1 1.4 3.4c.2.2 2.4 3.8 5.9 5.1 2.9 1.1 3.5.9 4.1.8.6-.1 2-.8 2.2-1.6.3-.8.3-1.4.2-1.6-.1-.1-.3-.2-.7-.4l-2.2-1c-.3-.1-.5-.2-.8.2-.2.4-.9 1-1 1.2-.2.2-.4.2-.7.1-.4-.2-1.7-.6-3.2-2-1.2-1-2-2.3-2.2-2.7-.2-.4 0-.6.2-.7.2-.2.4-.4.5-.6.2-.2.2-.4.4-.6.1-.2.1-.4 0-.6l-1-2.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------------------- */

const brl = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

const km = (value: number) => `${value.toLocaleString("pt-BR")} km`;

/** Renderiza o título do hero com um trecho destacado em azul. */
function HeroTitle({ title, highlight }: { title: string; highlight: string }) {
  const index = highlight ? title.indexOf(highlight) : -1;
  if (index === -1) {
    return <>{title}</>;
  }
  const before = title.slice(0, index);
  const after = title.slice(index + highlight.length);
  return (
    <>
      {before}
      <span className="text-primary">{highlight}</span>
      {after}
    </>
  );
}

/** View-model unificado do card do hero (anúncio real OU prévia honesta). */
type HeroCardView = {
  isReal: boolean;
  badge: string;
  href: string | null;
  imageSrc: string;
  imageAlt: string;
  title: string;
  specs: string;
  price: string | null;
  location: string | null;
  belowFipe: boolean;
  highlight: boolean;
  fipeRef: string | null;
};

function buildHeroCard(content: SellPageContent, heroAd?: SellHeroAd | null): HeroCardView {
  if (heroAd) {
    const specsParts: string[] = [];
    if (heroAd.year) specsParts.push(String(heroAd.year));
    if (heroAd.transmission) specsParts.push(heroAd.transmission);
    if (heroAd.mileage != null) specsParts.push(km(heroAd.mileage));
    const location = heroAd.city
      ? `${heroAd.city}${heroAd.state ? `, ${heroAd.state}` : ""}`
      : null;

    return {
      isReal: true,
      badge: "Exemplo de anúncio real",
      href: heroAd.href,
      imageSrc: heroAd.imageSrc,
      imageAlt: heroAd.imageAlt,
      title: heroAd.title,
      specs: specsParts.join(" · "),
      price: heroAd.price != null ? brl(heroAd.price) : null,
      location,
      belowFipe: heroAd.belowFipe,
      highlight: heroAd.highlight,
      fipeRef: null,
    };
  }

  const { mockup } = content.hero;
  return {
    isReal: false,
    badge: "Prévia do anúncio",
    href: null,
    imageSrc: mockup.imageSrc,
    imageAlt: mockup.imageAlt,
    title: mockup.name,
    specs: mockup.specs,
    price: mockup.price,
    location: mockup.city,
    belowFipe: mockup.badges.some((b) => b.toLowerCase().includes("fipe")),
    highlight: mockup.badges.some((b) => b.toLowerCase().includes("destaque")),
    fipeRef: mockup.fipeRef,
  };
}

/**
 * Card do hero em formato de post/feed social. O elemento visual principal
 * da página: foto grande no topo, selos, ações sociais e preço. Quando há
 * anúncio real, o card inteiro linka para o veículo.
 */
function HeroAdCard({ view }: { view: HeroCardView }) {
  const body = (
    <div className="overflow-hidden rounded-[28px] border border-cnc-line bg-white shadow-premium-lg">
      <div className="relative aspect-[4/3] w-full bg-[#dbe3f0]">
        <Image
          src={view.imageSrc}
          alt={view.imageAlt}
          fill
          sizes="(max-width: 1024px) 100vw, 440px"
          className="object-cover"
          priority
        />

        {/* Selo de credibilidade (real vs prévia) */}
        <span
          className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shadow-sm backdrop-blur ${
            view.isReal ? "bg-cnc-success text-white" : "bg-white/90 text-cnc-text-strong"
          }`}
        >
          {view.isReal ? <IconCheck className="h-3.5 w-3.5" /> : <IconSparkle className="h-3.5 w-3.5" />}
          {view.badge}
        </span>

        {/* Selos do anúncio */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
          {view.highlight ? (
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-sm">
              Destaque
            </span>
          ) : null}
          {view.belowFipe ? (
            <span className="rounded-full bg-cnc-success px-3 py-1 text-xs font-bold text-white shadow-sm">
              Abaixo da FIPE
            </span>
          ) : null}
        </div>

        {/* Ação social: salvar (decorativo, ilustra o card real) */}
        <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-cnc-text-strong shadow-sm backdrop-blur">
          <IconBookmark className="h-[18px] w-[18px]" />
        </span>
      </div>

      <div className="p-5">
        {/* Barra de ações estilo feed */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-cnc-muted">
            <IconHeart className="h-[22px] w-[22px]" />
            <IconChat className="h-[22px] w-[22px]" />
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e9f8f1] text-cnc-success">
            <IconWhatsapp className="h-[22px] w-[22px]" />
          </span>
        </div>

        <h3 className="mt-3 text-[18px] font-bold leading-snug text-cnc-text-strong">{view.title}</h3>
        {view.specs ? <p className="mt-1 text-[13px] font-medium text-cnc-muted">{view.specs}</p> : null}

        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            {view.price ? (
              <div className="text-[24px] font-extrabold tracking-tight text-cnc-text-strong">
                {view.price}
              </div>
            ) : null}
            {view.fipeRef ? (
              <div className="text-xs font-medium text-cnc-success">{view.fipeRef}</div>
            ) : null}
          </div>
          {view.location ? (
            <div className="flex items-center gap-1 text-[13px] font-medium text-cnc-muted">
              <IconMapPin className="h-4 w-4 text-primary" />
              {view.location}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-[440px]">
      <div className="pointer-events-none absolute -right-6 -top-8 hidden h-40 w-40 rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 hidden h-44 w-44 rounded-full bg-cnc-success/10 blur-3xl lg:block" />
      {view.href ? (
        <Link
          href={view.href}
          className="relative block rounded-[28px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label={`Ver anúncio: ${view.title}`}
        >
          {body}
        </Link>
      ) : (
        <div className="relative">{body}</div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: SellProfile }) {
  const isLojista = profile.audience === "lojista";
  return (
    <div className="flex flex-col rounded-3xl border border-cnc-line bg-white p-7 shadow-card transition hover:border-cnc-line-strong hover:shadow-premium sm:p-8">
      <div
        className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
          isLojista ? "bg-primary-soft text-primary" : "bg-[#e9f8f1] text-cnc-success"
        }`}
      >
        {isLojista ? <IconStore className="h-6 w-6" /> : <IconCar className="h-6 w-6" />}
      </div>

      <h3 className="mt-5 text-[24px] font-extrabold tracking-tight text-cnc-text-strong">
        {profile.title}
      </h3>

      <ul className="mt-5 flex-1 space-y-3">
        {profile.bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-3 text-[15px] text-cnc-text">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
            {bullet}
          </li>
        ))}
      </ul>

      <Link
        href={profile.ctaHref}
        className={`mt-7 inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold transition ${
          isLojista
            ? "border border-cnc-line-strong bg-white text-cnc-text-strong hover:border-primary/40 hover:bg-[#f8faff]"
            : "bg-primary text-white shadow-[0_10px_24px_rgba(14,98,216,0.25)] hover:bg-primary-strong"
        }`}
      >
        {profile.ctaLabel}
        <IconArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function FaqItem({ item, open, onToggle }: { item: SellFaq; open: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-cnc-line bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#f8faff]"
      >
        <span className="text-[15px] font-semibold text-cnc-text-strong sm:text-[16px]">
          {item.question}
        </span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-semibold text-primary transition ${
            open ? "rotate-45" : ""
          }`}
          aria-hidden="true"
        >
          +
        </span>
      </button>
      {open ? (
        <div className="border-t border-cnc-line px-5 py-4 text-[14px] leading-7 text-cnc-muted">
          {item.answer}
        </div>
      ) : null}
    </div>
  );
}

const STEP_ICONS = [IconCar, IconCamera, IconRocket, IconChat];
const ASSURANCE_ICONS = [IconSparkle, IconBolt, IconShield, IconMapPin];

export default function SellPageClient({ content, heroAd }: Props) {
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(0);
  const { hero } = content;
  const heroCard = buildHeroCard(content, heroAd);

  return (
    <main className="min-h-screen bg-cnc-bg">
      {/* ----------------------------------------------------------------- *
       * HERO                                                               *
       * ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f5f8ff_55%,#f2f3f7_100%)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-10 sm:px-6 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-[600px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-cnc-line bg-white px-4 py-1.5 text-[13px] font-bold text-primary shadow-sm">
                <IconBolt className="h-4 w-4" />
                {hero.eyebrow}
              </span>

              <h1 className="mt-5 text-[34px] font-extrabold leading-[1.07] tracking-tight text-cnc-text-strong sm:text-[50px]">
                <HeroTitle title={hero.title} highlight={hero.titleHighlight} />
              </h1>

              <p className="mt-5 text-[16px] leading-7 text-cnc-muted sm:text-[18px]">
                {hero.subtitle}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={hero.primaryCtaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-7 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(14,98,216,0.28)] transition hover:bg-primary-strong"
                >
                  {hero.primaryCtaLabel}
                  <IconArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href={hero.secondaryCtaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cnc-line-strong bg-white px-7 py-4 text-base font-bold text-cnc-text-strong transition hover:border-primary/40 hover:bg-[#f8faff]"
                >
                  <IconStore className="h-5 w-5 text-primary" />
                  {hero.secondaryCtaLabel}
                </Link>
              </div>

              <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                {hero.microBenefits.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[14px] font-semibold text-cnc-text">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <IconCheck className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroAdCard view={heroCard} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-6">
        {/* --------------------------------------------------------------- *
         * FAIXA DE BENEFÍCIOS                                               *
         * --------------------------------------------------------------- */}
        <section className="-mt-10 sm:-mt-12">
          <div className="grid gap-px overflow-hidden rounded-3xl border border-cnc-line bg-cnc-line shadow-premium md:grid-cols-3">
            {content.benefits.map((benefit, i) => {
              const Icon = [IconMapPin, IconWhatsapp, IconBolt][i] ?? IconCheck;
              return (
                <div key={benefit.title} className="bg-white p-6 sm:p-7">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-[17px] font-bold text-cnc-text-strong">{benefit.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-6 text-cnc-muted">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * COMO FUNCIONA                                                     *
         * --------------------------------------------------------------- */}
        <section className="mt-20 text-center">
          <h2 className="text-[28px] font-extrabold tracking-tight text-cnc-text-strong sm:text-[38px]">
            Anunciar é simples e rápido
          </h2>

          <div className="relative mt-12">
            <div className="absolute left-[12%] right-[12%] top-7 hidden border-t border-dashed border-cnc-line-strong md:block" />
            <div className="relative grid gap-8 md:grid-cols-4">
              {content.steps.map((item, i) => {
                const Icon = STEP_ICONS[i] ?? IconCheck;
                return (
                  <div
                    key={item.step}
                    className="flex items-start gap-4 text-left md:flex-col md:items-center md:text-center"
                  >
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_8px_20px_rgba(14,98,216,0.25)]">
                      <Icon className="h-6 w-6" />
                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-cnc-text-strong text-[11px] font-bold">
                        {i + 1}
                      </span>
                    </div>
                    <div className="md:mt-4">
                      <h3 className="text-[17px] font-bold text-cnc-text-strong">{item.title}</h3>
                      <p className="mt-1 text-[14px] leading-6 text-cnc-muted">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * ESCOLHA SEU PERFIL                                                *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <div className="text-center">
            <h2 className="text-[28px] font-extrabold tracking-tight text-cnc-text-strong sm:text-[38px]">
              Escolha seu perfil
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-7 text-cnc-muted">
              Particular ou lojista — o caminho certo para o seu objetivo.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {content.profiles.map((profile) => (
              <ProfileCard key={profile.audience} profile={profile} />
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * CONFIANÇA (compacta)                                              *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <div className="rounded-[32px] border border-cnc-line bg-white p-7 shadow-card sm:p-10">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {content.assurance.map((item, i) => {
                const Icon = ASSURANCE_ICONS[i] ?? IconCheck;
                return (
                  <div key={item.title} className="flex flex-col items-start">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-[16px] font-bold text-cnc-text-strong">{item.title}</h3>
                    <p className="mt-1.5 text-[14px] leading-6 text-cnc-muted">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * FAQ (compacto)                                                    *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <div className="text-center">
            <h2 className="text-[28px] font-extrabold tracking-tight text-cnc-text-strong sm:text-[34px]">
              Perguntas frequentes
            </h2>
          </div>

          <div className="mx-auto mt-8 max-w-[760px] space-y-3">
            {content.faq.map((item, index) => (
              <FaqItem
                key={item.question}
                item={item}
                open={faqOpenIndex === index}
                onToggle={() => setFaqOpenIndex((prev) => (prev === index ? null : index))}
              />
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * CTA FINAL                                                         *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0c4fb0_0%,#0e62d8_55%,#3b82f6_100%)] p-8 text-center text-white shadow-premium-lg sm:p-14">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />

            <div className="relative mx-auto max-w-[680px]">
              <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[42px]">
                {content.bottomCta.title}
              </h2>
              <p className="mt-4 text-[16px] leading-7 text-white/85 sm:text-[18px]">
                {content.bottomCta.subtitle}
              </p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href={content.bottomCta.primaryCtaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-base font-bold text-primary-strong transition hover:bg-[#f4f7ff]"
                >
                  {content.bottomCta.primaryCtaLabel}
                  <IconArrowRight className="h-4 w-4" />
                </Link>

                <Link
                  href={content.bottomCta.secondaryCtaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-7 py-4 text-base font-bold text-white backdrop-blur transition hover:bg-white/20"
                >
                  <IconStore className="h-5 w-5" />
                  {content.bottomCta.secondaryCtaLabel}
                </Link>
              </div>

              <p className="mt-5 flex items-center justify-center gap-2 text-[14px] font-medium text-white/80">
                <IconShield className="h-4 w-4" />
                {content.bottomCta.microcopy}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
