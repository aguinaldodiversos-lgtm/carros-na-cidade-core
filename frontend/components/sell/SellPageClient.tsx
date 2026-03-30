"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SellFaq, SellPageContent } from "@/lib/sell/sell-page";

type Props = {
  content: SellPageContent;
};

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconArrowRight({ className = "h-4 w-4" }: { className?: string }) {
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

function IconStore({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 10h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3 10l2-5h14l2 5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 14h6v7H9z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconCar({ className = "h-5 w-5" }: { className?: string }) {
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

function IconMap({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M9 5l6-2 4 2v14l-4-2-6 2-4-2V3l4 2z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 5v14M15 3v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconWhatsapp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 4C9.4 4 4 9.1 4 15.4c0 2.2.7 4.3 1.9 6L4 28l6.9-1.8c1.7.9 3.3 1.2 5.1 1.2 6.6 0 12-5.1 12-11.4S22.6 4 16 4z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M16 5.5c-5.8 0-10.5 4.4-10.5 9.9 0 2 .6 3.8 1.7 5.3L6 26l5.5-1.4c1.4.7 2.9 1 4.5 1 5.8 0 10.5-4.4 10.5-9.9S21.8 5.5 16 5.5z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12.6 11.5c-.3-.7-.6-.7-.8-.7h-.7c-.2 0-.6.1-.9.5-.3.4-1.1 1.1-1.1 2.6 0 1.5 1.1 2.9 1.3 3.1.2.2 2.3 3.5 5.6 4.8 2.7 1.1 3.3.9 3.9.9.6-.1 1.8-.7 2-1.5.3-.8.3-1.4.2-1.5-.1-.1-.4-.2-.9-.5s-1.8-.9-2.1-1-.5-.2-.8.2c-.2.4-.9 1-1.1 1.2-.2.2-.5.2-.9 0-.5-.2-2-.7-3.7-2.2-1.4-1.2-2.3-2.7-2.5-3.2-.3-.5 0-.7.2-1 .2-.2.4-.5.6-.8.2-.3.2-.6.4-.9.1-.3.1-.6 0-.8-.1-.2-.7-1.8-.9-2.4z"
        fill="currentColor"
      />
    </svg>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[780px] text-center" : "max-w-[760px]"}>
      {eyebrow ? (
        <div className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[#2F67F6]">
          {eyebrow}
        </div>
      ) : null}
      <h2 className="text-[32px] font-extrabold tracking-[-0.04em] text-[#1D2440] sm:text-[42px]">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-4 text-[16px] leading-8 text-[#5C647C] sm:text-[17px]">{subtitle}</p>
      ) : null}
    </div>
  );
}

function FaqItem({ item, open, onToggle }: { item: SellFaq; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-[24px] border border-[#E5E9F2] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
      >
        <span className="text-[17px] font-semibold text-[#1D2440]">{item.question}</span>
        <span className="text-[24px] font-semibold text-[#6E748A]">{open ? "−" : "+"}</span>
      </button>

      {open ? (
        <div className="border-t border-[#EEF2F7] px-5 py-5 text-[15px] leading-7 text-[#5C647C] sm:px-6">
          {item.answer}
        </div>
      ) : null}
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[#DCE6F7] bg-[linear-gradient(145deg,#FFFFFF_0%,#F3F7FF_48%,#ECF2FF_100%)] p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-7">
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[#2F67F6]/10 blur-2xl" />
      <div className="absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-[#FF8A1D]/10 blur-2xl" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between rounded-[24px] border border-[#E5E9F2] bg-white p-4 shadow-sm">
          <div>
            <div className="text-sm font-semibold text-[#6E748A]">
              Seu anúncio no padrão premium
            </div>
            <div className="mt-1 text-[22px] font-extrabold text-[#1D2440]">Carros na Cidade</div>
          </div>
          <div className="rounded-full bg-[#EEF4FF] p-3 text-[#2F67F6]">
            <IconCar className="h-6 w-6" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[24px] border border-[#E5E9F2] bg-white p-5 shadow-sm">
            <div className="mb-3 inline-flex rounded-full bg-[#EEF4FF] p-3 text-[#2F67F6]">
              <IconMap className="h-5 w-5" />
            </div>
            <div className="text-[18px] font-bold text-[#1D2440]">Foco regional</div>
            <p className="mt-2 text-sm leading-7 text-[#5C647C]">
              Seu veículo aparece com força nas páginas de cidade, catálogo e contextos locais.
            </p>
          </div>

          <div className="rounded-[24px] border border-[#E5E9F2] bg-white p-5 shadow-sm">
            <div className="mb-3 inline-flex rounded-full bg-[#FFF1E6] p-3 text-[#FF8A1D]">
              <IconWhatsapp className="h-5 w-5" />
            </div>
            <div className="text-[18px] font-bold text-[#1D2440]">Contato rápido</div>
            <p className="mt-2 text-sm leading-7 text-[#5C647C]">
              O comprador encontra preço, contexto e CTA claros para entrar em contato com mais
              intenção.
            </p>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#D9E5FF] bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_100%)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-[#6E748A]">Fluxo de anúncio</div>
              <div className="mt-1 text-[20px] font-extrabold text-[#1D2440]">
                Particular ou lojista
              </div>
            </div>
            <div className="rounded-full bg-[#2F67F6] px-4 py-2 text-sm font-bold text-white">
              Pronto para escalar
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            {[
              "Cadastro do veículo",
              "Fotos e diferenciais",
              "Preço com contexto FIPE",
              "Publicação e geração de leads",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/80 px-4 py-3"
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF4FF] text-[#2F67F6]">
                  <IconCheck className="h-4 w-4" />
                </span>
                <span className="text-sm font-semibold text-[#1D2440]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SellPageClient({ content }: Props) {
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(0);

  const quickCards = useMemo(
    () => [
      {
        title: "Para particulares",
        description:
          "Publique com simplicidade, apresente melhor seu carro e receba contatos mais qualificados.",
        icon: <IconCar className="h-5 w-5" />,
        ctaLabel: "Quero anunciar meu carro",
        ctaHref: content.hero.primaryCtaHref,
      },
      {
        title: "Para lojistas",
        description:
          "Ganhe presença regional, destaque comercial e base pronta para operar estoque com mais profissionalismo.",
        icon: <IconStore className="h-5 w-5" />,
        ctaLabel: "Quero anunciar como lojista",
        ctaHref: content.hero.secondaryCtaHref,
      },
    ],
    [content.hero.primaryCtaHref, content.hero.secondaryCtaHref]
  );

  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <div className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:pt-8">
        <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-[680px]">
            <div className="mb-4 inline-flex rounded-full border border-[#DCE6F7] bg-white px-4 py-2 text-sm font-bold text-[#2F67F6] shadow-sm">
              {content.hero.eyebrow}
            </div>

            <h1 className="text-[38px] font-extrabold leading-[1.03] tracking-[-0.05em] text-[#1D2440] sm:text-[56px]">
              {content.hero.title}
            </h1>

            <p className="mt-5 text-[16px] leading-8 text-[#5C647C] sm:text-[18px]">
              {content.hero.subtitle}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={content.hero.primaryCtaHref}
                className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-[#2F67F6] px-6 py-4 text-base font-bold text-white shadow-[0_12px_30px_rgba(47,103,246,0.24)] transition hover:bg-[#1F66E5]"
              >
                {content.hero.primaryCtaLabel}
                <IconArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href={content.hero.secondaryCtaHref}
                className="inline-flex items-center justify-center gap-2 rounded-[20px] border border-[#E5E9F2] bg-white px-6 py-4 text-base font-bold text-[#1D2440] transition hover:border-[#D3DCEC] hover:bg-[#F9FBFF]"
              >
                {content.hero.secondaryCtaLabel}
              </Link>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {content.hero.stats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[22px] border border-[#E5E9F2] bg-white p-4 shadow-sm"
                >
                  <div className="text-[22px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                    {item.value}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-[#6E748A]">{item.label}</div>
                </div>
              ))}
            </div>

            <div className="mt-7 grid gap-3">
              {content.hero.highlights.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[18px] border border-[#E5E9F2] bg-white px-4 py-3 shadow-sm"
                >
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#EEF4FF] text-[#2F67F6]">
                    <IconCheck className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold text-[#1D2440]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <HeroIllustration />
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-2">
          {quickCards.map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="inline-flex rounded-full bg-[#EEF4FF] p-3 text-[#2F67F6]">
                {card.icon}
              </div>
              <h2 className="mt-4 text-[28px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
                {card.title}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[#5C647C]">{card.description}</p>

              <Link
                href={card.ctaHref}
                className="mt-6 inline-flex items-center gap-2 rounded-[18px] bg-[#2F67F6] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1F66E5]"
              >
                {card.ctaLabel}
                <IconArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </section>

        <section className="mt-20">
          <SectionTitle
            eyebrow="Por que anunciar aqui"
            title="Uma página feita para vender o valor do portal antes mesmo do cadastro"
            subtitle="A proposta aqui não é só captar um anúncio. É mostrar para particular e lojista por que vale a pena entrar em uma vitrine regional premium."
            align="center"
          />

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {content.reasons.map((item) => (
              <div
                key={item.title}
                className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
              >
                <div className="inline-flex rounded-full bg-[#EEF4FF] p-3 text-[#2F67F6]">
                  <IconCheck className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-[23px] font-bold tracking-[-0.03em] text-[#1D2440]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#5C647C]">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 rounded-[32px] border border-[#DCE6F7] bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FF_60%,#FFF5EA_100%)] p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-8">
          <SectionTitle
            eyebrow="Como funciona"
            title="Poucos passos para colocar seu veículo no ar"
            subtitle="Uma estrutura simples para publicar melhor, valorizar o veículo e transformar visualização em contato."
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-4">
            {content.steps.map((item) => (
              <div
                key={item.step}
                className="rounded-[28px] border border-white/70 bg-white/80 p-6 backdrop-blur"
              >
                <div className="text-[14px] font-extrabold tracking-[0.18em] text-[#2F67F6]">
                  {item.step}
                </div>
                <h3 className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-[#1D2440]">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-7 text-[#5C647C]">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-6 xl:grid-cols-2">
          <div className="rounded-[32px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7">
            <div className="inline-flex rounded-full bg-[#EEF4FF] p-3 text-[#2F67F6]">
              <IconStore className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-[32px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
              Vantagens para lojistas
            </h2>
            <div className="mt-6 space-y-4">
              {content.dealerBenefits.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-5"
                >
                  <div className="text-[19px] font-bold text-[#1D2440]">{item.title}</div>
                  <p className="mt-2 text-[15px] leading-7 text-[#5C647C]">{item.description}</p>
                </div>
              ))}
            </div>

            <Link
              href={content.hero.secondaryCtaHref}
              className="mt-6 inline-flex items-center gap-2 rounded-[18px] bg-[#2F67F6] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1F66E5]"
            >
              Começar como lojista
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="rounded-[32px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-7">
            <div className="inline-flex rounded-full bg-[#FFF1E6] p-3 text-[#FF8A1D]">
              <IconCar className="h-5 w-5" />
            </div>
            <h2 className="mt-5 text-[32px] font-extrabold tracking-[-0.04em] text-[#1D2440]">
              Vantagens para particulares
            </h2>
            <div className="mt-6 space-y-4">
              {content.privateSellerBenefits.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[22px] border border-[#E5E9F2] bg-[#FBFCFF] p-5"
                >
                  <div className="text-[19px] font-bold text-[#1D2440]">{item.title}</div>
                  <p className="mt-2 text-[15px] leading-7 text-[#5C647C]">{item.description}</p>
                </div>
              ))}
            </div>

            <Link
              href={content.hero.primaryCtaHref}
              className="mt-6 inline-flex items-center gap-2 rounded-[18px] bg-[#2F67F6] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1F66E5]"
            >
              Começar meu anúncio
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-20">
          <SectionTitle
            eyebrow="Prova social"
            title="Confiança e percepção comercial importam muito na decisão de anunciar"
            subtitle="Mesmo antes da operação completa de reviews, a página já pode sustentar credibilidade com depoimentos e narrativa correta."
            align="center"
          />

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {content.testimonials.map((item) => (
              <div
                key={item.name}
                className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]"
              >
                <div className="mb-4 flex gap-1 text-[#FFB648]">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <span key={index}>★</span>
                  ))}
                </div>

                <p className="text-[16px] leading-8 text-[#4B536A]">“{item.text}”</p>

                <div className="mt-6">
                  <div className="text-[17px] font-bold text-[#1D2440]">{item.name}</div>
                  <div className="text-sm text-[#6E748A]">{item.role}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <SectionTitle
            eyebrow="Perguntas frequentes"
            title="Dúvidas comuns antes de começar"
            subtitle="Aqui entramos com objeções comerciais básicas para reduzir atrito antes do cadastro."
            align="center"
          />

          <div className="mx-auto mt-10 max-w-[920px] space-y-4">
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

        <section className="mt-20 rounded-[34px] border border-[#DCE6F7] bg-[linear-gradient(135deg,#1F66E5_0%,#2F67F6_55%,#5A8BFF_100%)] p-7 text-white shadow-[0_18px_40px_rgba(47,103,246,0.26)] sm:p-10">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="max-w-[780px]">
              <h2 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[46px]">
                {content.bottomCta.title}
              </h2>
              <p className="mt-4 text-[16px] leading-8 text-white/85">
                {content.bottomCta.subtitle}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link
                href={content.bottomCta.primaryCtaHref}
                className="inline-flex items-center justify-center gap-2 rounded-[20px] bg-white px-6 py-4 text-base font-bold text-[#1F66E5] transition hover:bg-[#F7F9FF]"
              >
                {content.bottomCta.primaryCtaLabel}
                <IconArrowRight className="h-4 w-4" />
              </Link>

              <Link
                href={content.bottomCta.secondaryCtaHref}
                className="inline-flex items-center justify-center rounded-[20px] border border-white/25 bg-white/10 px-6 py-4 text-base font-bold text-white backdrop-blur transition hover:bg-white/15"
              >
                {content.bottomCta.secondaryCtaLabel}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
