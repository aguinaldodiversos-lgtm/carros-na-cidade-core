// frontend/components/blog/BlogPageClient.tsx
//
// Página pilar do blog (rota /blog/[cidade]).
//
// Papel estratégico:
// - Funciona como PILLAR PAGE de SEO local, com tráfego orgânico direcionado para
//   páginas comerciais (/comprar, /tabela-fipe, /simulador-financiamento, /planos,
//   /veiculo/*).
// - O artigo é um "financiamento / simulador" localizado na cidade ativa. O conteúdo
//   textual tem placeholders {cityName} / {cityLabel} que podem ser enriquecidos por
//   um agente editorial de IA (ver observações no rodapé deste arquivo).
// - Sidebar mantém CTAs de conversão (criar anúncio) e vitrine de ofertas reais da
//   cidade (vindas de fetchAdsSearch no Server Component).
"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { BlogPageContent, BlogPost } from "@/lib/blog/blog-page";
import { HomeVehicleCard } from "@/components/home/HomeVehicleCard";

type OfferItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

interface BlogPageClientProps {
  content: BlogPageContent;
  offers: OfferItem[];
}

const HERO_IMAGE = "/images/blog.png";
const RELATED_THUMB_FALLBACK = "/images/blog.png";

type FaqItem = { question: string; answer: string };

function buildFaqItems(cityName: string): FaqItem[] {
  return [
    {
      question: "Qual o valor mínimo de entrada para financiar um carro?",
      answer: `A maioria dos bancos e financeiras em ${cityName} pede entre 10% e 20% do valor do veículo como entrada. Quanto maior a entrada, menores as parcelas e o total de juros pagos.`,
    },
    {
      question: "Posso financiar 100% do valor do veículo?",
      answer: `É possível em algumas instituições, mas exige análise de crédito mais rigorosa. Em ${cityName}, costuma ter taxa maior e parcela mais alta; compare CET antes de fechar.`,
    },
    {
      question: "O que é CET e por que ele é importante?",
      answer: "CET (Custo Efetivo Total) é a soma de juros, tarifas, seguros e impostos do financiamento. É o número que permite comparar propostas de forma justa entre bancos.",
    },
    {
      question: "Quanto tempo leva para aprovar um financiamento?",
      answer: `A aprovação online costuma sair em minutos. Em ${cityName}, lojas parceiras fecham contrato no mesmo dia quando a documentação está completa (CNH, comprovante de renda e residência).`,
    },
  ];
}

function formatDateLabel(dateIso: string | undefined) {
  if (!dateIso) return "15 de maio de 2024";
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "15 de maio de 2024";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function AuthorAvatar() {
  return (
    <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef4ff] text-[22px] font-extrabold text-[#0e62d8]">
      LA
    </div>
  );
}

function PillIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
      {children}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#1f9d6a]" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0e62d8] text-[13px] font-extrabold text-white">
      {n}
    </span>
  );
}

function SummaryCheck() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-[#0e62d8]" fill="none" stroke="currentColor" strokeWidth="2.3">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function MegaphoneArt() {
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20" fill="none" aria-hidden>
      <path d="M12 32l18-6v20l-18-6V32z" fill="#0e62d8" />
      <path d="M30 24l20-8v32l-20-8V24z" fill="#0e62d8" opacity="0.85" />
      <circle cx="14" cy="44" r="2" fill="#f7a400" />
      <circle cx="52" cy="14" r="2" fill="#f7a400" />
      <circle cx="56" cy="34" r="2.5" fill="#f7a400" />
      <circle cx="10" cy="18" r="1.5" fill="#f7a400" />
      <path d="M48 10l2 4 4 0-3 3 1 4-4-2-4 2 1-4-3-3 4 0 2-4z" fill="#f7a400" />
    </svg>
  );
}

function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="divide-y divide-[#e6ebf3] rounded-[14px] border border-[#e6ebf3] bg-white">
      {items.map((item, index) => {
        const isOpen = openIndex === index;

        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-[15px] font-semibold text-[#17213a] md:text-[16px]">
                {item.question}
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`h-5 w-5 shrink-0 text-[#6f7a90] transition ${isOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isOpen ? (
              <div className="px-5 pb-5 text-[15px] leading-7 text-[#5c6781]">{item.answer}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function BlogPageClient({ content, offers }: BlogPageClientProps) {
  const cityName = content.cityName;
  const cityLabel = content.cityLabel;
  const citySlug = content.citySlug;

  const articleTitle = `Simulador de Financiamento de Carros: como usar e encontrar as melhores condições em ${cityName}`;
  const articleSubtitle =
    "Aprenda a simular seu financiamento, entenda cada taxa e descubra como economizar na compra do seu carro.";
  const publishedAt = "2024-05-15";
  const readTime = "8 min de leitura";
  const faqItems = buildFaqItems(cityName);

  const relatedPosts: BlogPost[] = (content.featuredPosts || []).slice(0, 3);
  const fallbackRelated: BlogPost[] = [
    {
      id: "rel-1",
      slug: "taxas-de-juros-financiamento-carros",
      title: "Taxas de juros: como funcionam no financiamento de carros",
      excerpt: "",
      coverImage: RELATED_THUMB_FALLBACK,
      publishedAt,
      readTime: "7 min de leitura",
      category: "Financiamento",
      cityLabel,
    },
    {
      id: "rel-2",
      slug: "financiamento-ou-consorcio-qual-vale-mais",
      title: "Financiamento ou consórcio: qual vale mais a pena?",
      excerpt: "",
      coverImage: RELATED_THUMB_FALLBACK,
      publishedAt,
      readTime: "6 min de leitura",
      category: "Financiamento",
      cityLabel,
    },
    {
      id: "rel-3",
      slug: "documentos-necessarios-financiar-carro",
      title: "Documentos necessários para financiar seu carro",
      excerpt: "",
      coverImage: RELATED_THUMB_FALLBACK,
      publishedAt,
      readTime: "5 min de leitura",
      category: "Financiamento",
      cityLabel,
    },
  ];
  const sidebarRelated = relatedPosts.length >= 3 ? relatedPosts : fallbackRelated;

  return (
    <main className="bg-white">
      <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 pt-6 sm:px-6 md:pt-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[#6f7a90]">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="transition hover:text-[#0e62d8]">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-[#b7bfd0]">›</li>
            <li>
              <Link href={`/blog/${citySlug}`} className="transition hover:text-[#0e62d8]">
                Blog
              </Link>
            </li>
            <li aria-hidden className="text-[#b7bfd0]">›</li>
            <li>
              <Link href={`/blog/${citySlug}?categoria=financiamento`} className="transition hover:text-[#0e62d8]">
                Financiamento
              </Link>
            </li>
            <li aria-hidden className="text-[#b7bfd0]">›</li>
            <li className="font-semibold text-[#0e62d8]">Simulador de Financiamento</li>
          </ol>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article>
            <span className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#0e62d8]">
              Financiamento
            </span>

            <h1 className="mt-3 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#17213a] md:text-[40px]">
              {articleTitle}
            </h1>

            <p className="mt-4 max-w-[640px] text-[17px] leading-7 text-[#5c6781] md:text-[18px]">
              {articleSubtitle}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-5 text-[14px] text-[#6f7a90]">
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0e62d8]" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M3 9h18M8 3v4M16 3v4" />
                </svg>
                {formatDateLabel(publishedAt)}
              </span>
              <span className="inline-flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#0e62d8]" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {readTime}
              </span>
              <button type="button" className="inline-flex items-center gap-2 transition hover:text-[#0e62d8]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 3h12v18l-6-4-6 4V3z" />
                </svg>
                Salvar artigo
              </button>
            </div>

            <div className="mt-6 overflow-hidden rounded-[16px]">
              <div className="relative aspect-[16/8]">
                <Image
                  src={HERO_IMAGE}
                  alt={`Simulador de financiamento de carros em ${cityName}`}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 880px"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="mt-7 space-y-4 text-[16px] leading-8 text-[#41506b]">
              <p>
                O simulador de financiamento de carros é uma ferramenta indispensável para quem
                deseja comprar um veículo com planejamento e segurança. Com ele, você compara taxas,
                prazos e valores de entrada para escolher a opção que cabe no seu bolso.
              </p>
              <p>
                Neste guia completo, você vai entender como funciona o financiamento, quais fatores
                influenciam nas parcelas e como usar nosso simulador para encontrar as melhores
                condições em {cityName}.
              </p>
            </div>

            <aside className="mt-7 rounded-[16px] bg-[#eef4ff] px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0e62d8] text-white">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M12 2l2.39 7.36H22l-6.18 4.49L18.18 21 12 16.27 5.82 21l2.36-7.15L2 9.36h7.61L12 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-[15px] font-extrabold text-[#17213a]">
                    Resumo do que você vai encontrar neste guia:
                  </p>
                  <ul className="mt-3 space-y-2 text-[15px] text-[#41506b]">
                    <li className="flex items-start gap-2">
                      <SummaryCheck /> Como funciona o financiamento de veículos
                    </li>
                    <li className="flex items-start gap-2">
                      <SummaryCheck /> Como usar o simulador passo a passo
                    </li>
                    <li className="flex items-start gap-2">
                      <SummaryCheck /> Dicas para conseguir as melhores taxas
                    </li>
                    <li className="flex items-start gap-2">
                      <SummaryCheck /> Perguntas frequentes sobre financiamento
                    </li>
                  </ul>
                </div>
              </div>
            </aside>

            <section className="mt-10">
              <h2 className="text-[22px] font-extrabold text-[#17213a] md:text-[26px]">
                Como funciona o financiamento de veículos?
              </h2>
              <p className="mt-3 text-[16px] leading-8 text-[#41506b]">
                No financiamento, o banco ou financeira paga o valor do carro para você e você
                devolve esse valor em parcelas mensais, acrescidas de juros e tarifas. Os principais
                pontos que influenciam no valor das parcelas são:
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[14px] border border-[#e3e8f1] bg-white p-5 text-center shadow-[0_6px_18px_rgba(14,30,66,0.05)]">
                  <PillIcon>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 19 19 5" />
                      <circle cx="7.5" cy="7.5" r="2.5" />
                      <circle cx="16.5" cy="16.5" r="2.5" />
                    </svg>
                  </PillIcon>
                  <h3 className="text-[16px] font-extrabold text-[#17213a]">Taxa de juros</h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#5c6781]">
                    Quanto menor a taxa, menor será o valor final do financiamento.
                  </p>
                </div>

                <div className="rounded-[14px] border border-[#e3e8f1] bg-white p-5 text-center shadow-[0_6px_18px_rgba(14,30,66,0.05)]">
                  <PillIcon>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M3 9h18M8 3v4M16 3v4" />
                    </svg>
                  </PillIcon>
                  <h3 className="text-[16px] font-extrabold text-[#17213a]">Prazo de pagamento</h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#5c6781]">
                    Prazos maiores diminuem a parcela, mas aumentam o custo total.
                  </p>
                </div>

                <div className="rounded-[14px] border border-[#e3e8f1] bg-white p-5 text-center shadow-[0_6px_18px_rgba(14,30,66,0.05)]">
                  <PillIcon>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5c0 3 6 1.5 6 4.5 0 1.38-1.34 2.5-3 2.5s-3-1.12-3-2.5M12 6v12" />
                    </svg>
                  </PillIcon>
                  <h3 className="text-[16px] font-extrabold text-[#17213a]">Entrada</h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#5c6781]">
                    Quanto maior a entrada, menor o valor financiado e das parcelas.
                  </p>
                </div>

                <div className="rounded-[14px] border border-[#e3e8f1] bg-white p-5 text-center shadow-[0_6px_18px_rgba(14,30,66,0.05)]">
                  <PillIcon>
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 13l2-6h14l2 6v6H3v-6z" />
                      <circle cx="7" cy="16" r="1.5" />
                      <circle cx="17" cy="16" r="1.5" />
                    </svg>
                  </PillIcon>
                  <h3 className="text-[16px] font-extrabold text-[#17213a]">Valor do veículo</h3>
                  <p className="mt-2 text-[14px] leading-6 text-[#5c6781]">
                    Carros mais caros resultam em parcelas mais altas.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-[22px] font-extrabold text-[#17213a] md:text-[26px]">
                Como usar o simulador de financiamento
              </h2>

              <ol className="mt-4 space-y-3 text-[16px] leading-7 text-[#41506b]">
                <li className="flex items-start gap-3">
                  <StepNumber n={1} />
                  <span>Informe o valor do veículo que pretende comprar.</span>
                </li>
                <li className="flex items-start gap-3">
                  <StepNumber n={2} />
                  <span>Defina o valor da entrada que você pode dar.</span>
                </li>
                <li className="flex items-start gap-3">
                  <StepNumber n={3} />
                  <span>Escolha o prazo de pagamento ideal para o seu orçamento.</span>
                </li>
                <li className="flex items-start gap-3">
                  <StepNumber n={4} />
                  <span>Veja na hora o valor das parcelas e o custo total do financiamento.</span>
                </li>
              </ol>

              <div className="mt-5 rounded-[14px] border border-[#c8ecd7] bg-[#effaf3] px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1f9d6a] text-white">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="m5 12 4.5 4.5L19 7" />
                    </svg>
                  </div>
                  <p className="text-[15px] leading-7 text-[#2d5f42]">
                    <strong className="font-extrabold text-[#1f9d6a]">Dica:</strong> experimente
                    diferentes combinações de entrada, prazo e taxa para encontrar a melhor condição
                    para o seu perfil.
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-10">
              <h2 className="text-[22px] font-extrabold text-[#17213a] md:text-[26px]">
                Dicas para conseguir as melhores condições
              </h2>

              <ul className="mt-4 space-y-3 text-[16px] leading-7 text-[#41506b]">
                <li className="flex items-start gap-3">
                  <CheckIcon />
                  <span>Dê uma entrada maior para reduzir o valor financiado.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon />
                  <span>Prefira prazos menores para pagar menos juros.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon />
                  <span>Compare propostas de diferentes bancos e financeiras.</span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckIcon />
                  <span>Mantenha seu nome limpo e score alto para ter acesso às melhores taxas.</span>
                </li>
              </ul>
            </section>

            <section className="mt-10">
              <h2 className="text-[22px] font-extrabold text-[#17213a] md:text-[26px]">
                Perguntas frequentes
              </h2>
              <div className="mt-4">
                <FaqAccordion items={faqItems} />
              </div>
            </section>

            <section className="mt-10 rounded-[16px] border border-[#e3e8f1] bg-white p-6 shadow-[0_10px_26px_rgba(14,30,66,0.06)] md:p-7">
              <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="text-[18px] font-extrabold text-[#17213a] md:text-[20px]">
                    Pronto para encontrar o carro ideal para você?
                  </p>
                  <p className="mt-2 text-[14px] leading-6 text-[#5c6781]">
                    Use nosso simulador e veja as melhores condições de financiamento em {cityName}.
                  </p>
                </div>

                <Link
                  href={`/simulador-financiamento/${citySlug}`}
                  className="inline-flex h-[44px] items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-[14px] font-extrabold text-white shadow-[0_10px_20px_rgba(14,98,216,0.22)] transition hover:bg-[#0b52b8]"
                >
                  Simular agora
                </Link>
              </div>
            </section>
          </article>

          <aside className="space-y-6">
            <section className="rounded-[16px] border border-[#e3e8f1] bg-white p-5 shadow-[0_10px_26px_rgba(14,30,66,0.06)]">
              <h3 className="text-[15px] font-extrabold text-[#17213a]">Sobre o autor</h3>
              <div className="mt-3 flex items-start gap-3">
                <AuthorAvatar />
                <div>
                  <p className="text-[15px] font-extrabold text-[#17213a]">Lucas Andrade</p>
                  <p className="mt-1 text-[13px] leading-5 text-[#5c6781]">
                    Especialista em mercado automotivo com mais de 8 anos de experiência ajudando
                    pessoas a realizarem o sonho do carro próprio.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-[16px] border border-[#e3e8f1] bg-white p-5 shadow-[0_10px_26px_rgba(14,30,66,0.06)]">
              <h3 className="text-[15px] font-extrabold text-[#17213a]">Artigos relacionados</h3>
              <div className="mt-4 space-y-4">
                {sidebarRelated.map((post) => (
                  <Link
                    key={post.id}
                    href={`/blog/${citySlug}/${post.slug}`}
                    className="flex gap-3 transition hover:opacity-90"
                  >
                    <div className="relative h-[56px] w-[80px] shrink-0 overflow-hidden rounded-[8px] bg-[#f2f5fa]">
                      <Image
                        src={post.coverImage || RELATED_THUMB_FALLBACK}
                        alt={post.title}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-[13px] font-extrabold leading-[1.25] text-[#17213a]">
                        {post.title}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#6f7a90]">
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                        {post.readTime || "5 min de leitura"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              <Link
                href={`/blog/${citySlug}`}
                className="mt-5 inline-flex h-[40px] w-full items-center justify-center rounded-[10px] border border-[#dbe3f0] bg-white px-4 text-[13px] font-extrabold text-[#0e62d8] transition hover:bg-[#f5f8fc]"
              >
                Ver todos os artigos
              </Link>
            </section>

            <section className="rounded-[16px] border border-[#e3e8f1] bg-white p-5 shadow-[0_10px_26px_rgba(14,30,66,0.06)]">
              <div className="flex h-[140px] w-full items-center justify-center rounded-[12px] bg-[#eef4ff]">
                <MegaphoneArt />
              </div>
              <h3 className="mt-4 text-[20px] font-extrabold leading-tight text-[#17213a]">
                Anuncie seu
                <br />
                carro grátis!
              </h3>
              <p className="mt-3 text-[13px] leading-6 text-[#5c6781]">
                Venda o seu carro rapidamente! Anuncie grátis na maior vitrine de veículos usados da
                sua cidade. Cadastro simples, anúncio rápido e contato direto com compradores em
                {" "}
                {cityName}.
              </p>
              <Link
                href="/planos"
                className="mt-4 inline-flex h-[44px] w-full items-center justify-center rounded-[10px] bg-[#0e62d8] px-4 text-[14px] font-extrabold text-white shadow-[0_10px_20px_rgba(14,98,216,0.22)] transition hover:bg-[#0b52b8]"
              >
                Anunciar Grátis
              </Link>
            </section>

            {offers.length > 0 ? (
              <section className="rounded-[16px] border border-[#e3e8f1] bg-white p-5 shadow-[0_10px_26px_rgba(14,30,66,0.06)]">
                <h3 className="text-[15px] font-extrabold text-[#17213a]">Ofertas em destaque</h3>
                <div className="mt-4 space-y-4">
                  {offers.slice(0, 3).map((offer) => (
                    <HomeVehicleCard
                      key={`offer-${offer.id}`}
                      item={offer}
                      variant="highlight"
                    />
                  ))}
                </div>
                <Link
                  href={`/comprar/${citySlug}`}
                  className="mt-5 inline-flex h-[40px] w-full items-center justify-center rounded-[10px] border border-[#dbe3f0] bg-white px-4 text-[13px] font-extrabold text-[#0e62d8] transition hover:bg-[#f5f8fc]"
                >
                  Ver mais ofertas
                </Link>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

export default BlogPageClient;

// ── Nota para a integração futura com agente editorial de IA ────────────────
//
// Esta pillar page é estruturada para receber enriquecimento por IA em dois
// níveis, sem perder controle editorial:
//
// 1) Localização semântica (camada mais barata, 100% automatizável):
//    - Placeholders `{cityName}` / `{cityLabel}` já injetados no conteúdo.
//    - O agente recebe uma notícia-base nacional + cityName e produz apenas
//      parágrafos de contexto local (mercado, preço médio, bairros, clima de
//      mobilidade). A saída substitui blocos `contextLocal` em BlogPageContent.
//    - FAQs também são reescritas por cidade (ver `buildFaqItems`).
//
// 2) Pauta editorial adaptada (camada de curadoria):
//    - Notícias nacionais chegam do backend (`tryFetchRemoteContent`) em
//      featuredPosts/popularPosts. Cada post tem slug nacional + campos
//      localizados (title, excerpt, cityLabel). O agente de IA gera a versão
//      localizada; revisão humana antes de publicar.
//
// O que NÃO deve ser feito:
//    - Gerar artigos inteiros com IA sem curadoria (spam / penalização Google).
//    - Duplicar conteúdo nacional em cada cidade sem mudança local real
//      (thin content / canibalização).
//
// Para evoluir: criar uma tabela `blog_posts_localized(post_id, city_slug, title,
// excerpt, body, generated_by)` e um pipeline que faz:
//    fetch-base-article → ai-localize(cityName) → human-review → publish.
//
// Interlinking automático esperado da IA: ao mencionar "financiamento", "FIPE"
// ou "anúncio", inserir link para /simulador-financiamento/{citySlug},
// /tabela-fipe/{citySlug} ou /planos — sempre com slug da cidade ativa.
