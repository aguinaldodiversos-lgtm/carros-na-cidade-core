"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { SellFaq, SellPageContent, SellProfile } from "@/lib/sell/sell-page";

type Props = {
  content: SellPageContent;
};

/* ----------------------------------------------------------------------------
 * Ícones locais (stroke currentColor para herdar a cor do contexto).
 * Mantidos no próprio componente: são específicos desta landing e não
 * compartilhados com cards globais de veículo.
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

function IconTag({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 11.5V5a1 1 0 011-1h6.5a2 2 0 011.4.6l6.5 6.5a2 2 0 010 2.8l-6.6 6.6a2 2 0 01-2.8 0L4.6 12.9A2 2 0 014 11.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function IconSparkle({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
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
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 12l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "left",
  invert = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  invert?: boolean;
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[760px] text-center" : "max-w-[720px]"}>
      {eyebrow ? (
        <div
          className={`mb-3 text-[13px] font-bold uppercase tracking-[0.16em] ${
            invert ? "text-white/80" : "text-primary"
          }`}
        >
          {eyebrow}
        </div>
      ) : null}
      <h2
        className={`text-[28px] font-extrabold leading-[1.1] tracking-tight sm:text-[38px] ${
          invert ? "text-white" : "text-cnc-text-strong"
        }`}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={`mt-4 text-[15px] leading-7 sm:text-[17px] ${
            invert ? "text-white/85" : "text-cnc-muted"
          }`}
        >
          {subtitle}
        </p>
      ) : null}
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
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-[#f8faff] sm:px-6"
      >
        <span className="text-[16px] font-semibold text-cnc-text-strong sm:text-[17px]">
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
        <div className="border-t border-cnc-line px-5 py-5 text-[15px] leading-7 text-cnc-muted sm:px-6">
          {item.answer}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mockup do anúncio exibido no hero. Reproduz a aparência de um card de
 * veículo real (selos, foto, preço, FIPE, CTA + WhatsApp) para o visitante
 * visualizar como o anúncio dele será apresentado ao comprador. NÃO usa o
 * card global de veículo — é uma ilustração local desta landing.
 */
function AdMockup({ mockup }: { mockup: SellPageContent["hero"]["mockup"] }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -right-6 -top-8 hidden h-40 w-40 rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="pointer-events-none absolute -bottom-10 -left-6 hidden h-44 w-44 rounded-full bg-cnc-success/10 blur-3xl lg:block" />

      <div className="relative mx-auto max-w-[420px] overflow-hidden rounded-[26px] border border-cnc-line bg-white shadow-premium-lg">
        <div className="relative aspect-[16/10] w-full bg-[#dbe3f0]">
          <Image
            src={mockup.imageSrc}
            alt={mockup.imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 420px"
            className="object-cover"
            priority
          />
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {mockup.badges.map((badge, i) => (
              <span
                key={badge}
                className={`rounded-full px-3 py-1 text-xs font-bold text-white shadow-sm ${
                  i === 0 ? "bg-primary" : "bg-cnc-success"
                }`}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>

        <div className="p-5">
          <h3 className="text-[18px] font-bold leading-snug text-cnc-text-strong">{mockup.name}</h3>
          <p className="mt-1 text-[13px] font-medium text-cnc-muted">{mockup.specs}</p>

          <div className="mt-2 flex items-center gap-1.5 text-[13px] text-cnc-muted">
            <IconMapPin className="h-4 w-4 text-primary" />
            {mockup.city}
          </div>

          <div className="mt-4 flex items-end justify-between gap-3">
            <div>
              <div className="text-[24px] font-extrabold tracking-tight text-cnc-text-strong">
                {mockup.price}
              </div>
              <div className="text-xs font-medium text-cnc-success">{mockup.fipeRef}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e9f8f1] text-cnc-success">
              <IconWhatsapp className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white">
            Ver oferta
            <IconArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileCard({ profile }: { profile: SellProfile }) {
  const isLojista = profile.audience === "lojista";
  return (
    <div className="flex flex-col rounded-3xl border border-cnc-line bg-white p-6 shadow-card transition hover:border-cnc-line-strong hover:shadow-premium sm:p-7">
      <div
        className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${
          isLojista ? "bg-primary-soft text-primary" : "bg-[#e9f8f1] text-cnc-success"
        }`}
      >
        {isLojista ? <IconStore className="h-6 w-6" /> : <IconCar className="h-6 w-6" />}
      </div>

      <h3 className="mt-5 text-[24px] font-extrabold tracking-tight text-cnc-text-strong sm:text-[26px]">
        {profile.title}
      </h3>
      <p className="mt-3 text-[15px] leading-7 text-cnc-muted">{profile.description}</p>

      <ul className="mt-5 space-y-3">
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
        className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_rgba(14,98,216,0.25)] transition hover:bg-primary-strong"
      >
        {profile.ctaLabel}
        <IconArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

const REASON_ICONS = [IconMapPin, IconSparkle, IconTag, IconWhatsapp, IconCheck, IconStore];

export default function SellPageClient({ content }: Props) {
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(0);
  const { hero } = content;

  return (
    <main className="min-h-screen bg-cnc-bg">
      {/* ----------------------------------------------------------------- *
       * HERO — gradiente claro institucional, duas colunas no desktop.     *
       * ----------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#eef4ff_0%,#f5f8ff_55%,#f2f3f7_100%)]">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-[1200px] px-4 pb-14 pt-10 sm:px-6 sm:pt-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.04fr_0.96fr]">
            <div className="max-w-[640px]">
              <span className="inline-flex items-center gap-2 rounded-full border border-cnc-line bg-white px-4 py-1.5 text-[13px] font-bold text-primary shadow-sm">
                <IconSparkle className="h-4 w-4" />
                {hero.eyebrow}
              </span>

              <h1 className="mt-5 text-[34px] font-extrabold leading-[1.06] tracking-tight text-cnc-text-strong sm:text-[50px]">
                {hero.title}
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

              <p className="mt-4 flex items-center gap-2 text-[13px] font-medium text-cnc-muted">
                <IconShield className="h-4 w-4 text-cnc-success" />
                {hero.microcopy}
              </p>

              <ul className="mt-7 grid gap-2.5 sm:grid-cols-1">
                {hero.highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-[15px] font-medium text-cnc-text"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <AdMockup mockup={hero.mockup} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 pb-20 sm:px-6">
        {/* --------------------------------------------------------------- *
         * BARRA DE BENEFÍCIOS RÁPIDOS                                       *
         * --------------------------------------------------------------- */}
        <section className="-mt-8 sm:-mt-10">
          <div className="grid gap-px overflow-hidden rounded-3xl border border-cnc-line bg-cnc-line shadow-premium sm:grid-cols-2 lg:grid-cols-4">
            {content.benefits.map((benefit, i) => {
              const Icon = [IconSparkle, IconMapPin, IconWhatsapp, IconTag][i] ?? IconCheck;
              return (
                <div key={benefit.title} className="bg-white p-5 sm:p-6">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-[16px] font-bold text-cnc-text-strong">{benefit.title}</h3>
                  <p className="mt-1.5 text-[14px] leading-6 text-cnc-muted">{benefit.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * POR QUE ANUNCIAR                                                  *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <SectionTitle
            eyebrow="Por que anunciar aqui"
            title="Por que anunciar no Carros na Cidade?"
            subtitle="Tudo o que o seu anúncio ganha em um só lugar: mais gente da sua região, boa apresentação e contato direto com quem quer comprar."
            align="center"
          />

          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {content.reasons.map((item, i) => {
              const Icon = REASON_ICONS[i] ?? IconCheck;
              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-cnc-line bg-white p-6 shadow-card transition hover:border-cnc-line-strong hover:shadow-premium"
                >
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-[19px] font-bold tracking-tight text-cnc-text-strong">
                    {item.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-7 text-cnc-muted">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * ESCOLHA SEU PERFIL (consolida vantagens particular/lojista)      *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <SectionTitle
            eyebrow="Para cada perfil"
            title="Escolha seu perfil e comece"
            subtitle="Particular ou lojista: o caminho certo para o seu objetivo, sem confusão."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {content.profiles.map((profile) => (
              <ProfileCard key={profile.audience} profile={profile} />
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * COMO FUNCIONA                                                     *
         * --------------------------------------------------------------- */}
        <section className="mt-20 overflow-hidden rounded-[32px] border border-cnc-line bg-[linear-gradient(135deg,#f4f8ff_0%,#eef4ff_100%)] p-6 shadow-card sm:p-10">
          <SectionTitle
            eyebrow="Como funciona"
            title="Do cadastro ao primeiro contato"
            subtitle="Quatro passos simples para colocar seu veículo no ar e começar a receber interessados."
          />

          <div className="mt-12 grid gap-5 lg:grid-cols-4">
            {content.steps.map((item, i) => (
              <div key={item.step} className="relative rounded-2xl border border-cnc-line bg-white p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-white">
                    {item.step}
                  </span>
                  {i < content.steps.length - 1 ? (
                    <span className="hidden h-px flex-1 bg-cnc-line lg:block" />
                  ) : null}
                </div>
                <h3 className="mt-4 text-[18px] font-bold tracking-tight text-cnc-text-strong">
                  {item.title}
                </h3>
                <p className="mt-2 text-[14px] leading-6 text-cnc-muted">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * PRESENÇA LOCAL QUE GERA RESULTADO                                 *
         * --------------------------------------------------------------- */}
        <section className="mt-20 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionTitle
              eyebrow="Presença local"
              title="Presença local que gera resultado"
              subtitle="O Carros na Cidade não é só mais um formulário de anúncio. Ele conecta o seu veículo a páginas locais, com compradores que estão procurando carro perto de você."
            />

            <ul className="mt-7 grid gap-3 sm:grid-cols-2">
              {content.localPresence.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-3 rounded-2xl border border-cnc-line bg-white px-4 py-3 text-[15px] font-medium text-cnc-text shadow-card"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                    <IconMapPin className="h-4 w-4" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-7">
              <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-cnc-muted">
                Buscas que levam até o seu anúncio
              </div>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {content.localPresence.chips.map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cnc-line bg-white px-3.5 py-2 text-[13px] font-semibold text-cnc-text shadow-sm"
                  >
                    <IconMapPin className="h-3.5 w-3.5 text-primary" />
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Mini mockup de busca regional (desktop + mobile) */}
          <div className="relative">
            <div className="pointer-events-none absolute -right-6 -top-6 hidden h-40 w-40 rounded-full bg-primary/10 blur-3xl lg:block" />
            <div className="relative rounded-[28px] border border-cnc-line bg-white p-5 shadow-premium-lg">
              <div className="flex items-center gap-2 rounded-xl border border-cnc-line bg-cnc-bg px-4 py-3">
                <IconMapPin className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-cnc-text">Carros na sua cidade</span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((n) => (
                  <div key={n} className="overflow-hidden rounded-xl border border-cnc-line">
                    <div className="aspect-[16/10] w-full bg-[linear-gradient(135deg,#e6edfb_0%,#dbe6f7_100%)]">
                      <div className="flex h-full items-center justify-center text-primary/40">
                        <IconCar className="h-8 w-8" />
                      </div>
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <div className="h-2 w-3/4 rounded-full bg-cnc-line" />
                      <div className="h-2.5 w-1/2 rounded-full bg-primary/30" />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-primary-soft px-4 py-3">
                <span className="text-sm font-semibold text-primary">Resultados perto de você</span>
                <IconArrowRight className="h-4 w-4 text-primary" />
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- *
         * CONFIANÇA E MODERAÇÃO                                             *
         * --------------------------------------------------------------- */}
        <section className="mt-20" aria-label="Confiança e moderação">
          {content.testimonials.length > 0 ? (
            <>
              <SectionTitle
                eyebrow="Depoimentos"
                title="O que vendedores reais já contaram sobre o portal"
                subtitle="Casos compartilhados publicamente por anunciantes do Carros na Cidade."
                align="center"
              />

              <div className="mt-12 grid gap-5 lg:grid-cols-3">
                {content.testimonials.map((item) => (
                  <div
                    key={item.name}
                    className="rounded-3xl border border-cnc-line bg-white p-6 shadow-card"
                  >
                    <p className="text-[16px] leading-8 text-cnc-text">“{item.text}”</p>
                    <div className="mt-6">
                      <div className="text-[16px] font-bold text-cnc-text-strong">{item.name}</div>
                      <div className="text-sm text-cnc-muted">{item.role}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <SectionTitle
                eyebrow="Confiança e moderação"
                title="Um ambiente mais seguro para anunciar e negociar"
                subtitle="Anúncios podem passar por revisão antes de aparecer. Não fazemos consulta Detran nem vistoria física, mas removemos sinais óbvios de risco e aceitamos denúncia pública — para proteger quem compra e quem vende."
                align="center"
              />

              <div className="mt-12 grid gap-5 lg:grid-cols-3">
                {content.trust.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl border border-cnc-line bg-white p-6 shadow-card"
                  >
                    <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e9f8f1] text-cnc-success">
                      <IconShield className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-[17px] font-bold leading-snug text-cnc-text-strong">
                      {item.title}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-7 text-cnc-muted">{item.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* --------------------------------------------------------------- *
         * FAQ                                                               *
         * --------------------------------------------------------------- */}
        <section className="mt-20">
          <SectionTitle
            eyebrow="Perguntas frequentes"
            title="Dúvidas comuns antes de começar"
            subtitle="Respostas diretas sobre como anunciar, receber contatos e o que esperar do fluxo."
            align="center"
          />

          <div className="mx-auto mt-10 max-w-[860px] space-y-3.5">
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
          <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#0c4fb0_0%,#0e62d8_55%,#3b82f6_100%)] p-8 text-white shadow-premium-lg sm:p-12">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />

            <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="max-w-[720px]">
                <h2 className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-white sm:text-[42px]">
                  {content.bottomCta.title}
                </h2>
                <p className="mt-4 text-[16px] leading-7 text-white/85 sm:text-[18px]">
                  {content.bottomCta.subtitle}
                </p>
                <p className="mt-4 flex items-center gap-2 text-[14px] font-medium text-white/80">
                  <IconSparkle className="h-4 w-4" />
                  {content.bottomCta.microcopy}
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
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
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
