import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { fetchPlansFromAPI } from "@/lib/plans/plan-service";
import type { SubscriptionPlan } from "@/lib/plans/plan-store";
import { fetchPublicBoost, formatBoostPriceBRL } from "@/lib/commercial/public-boost";

/**
 * /planos — landing pública de conversão (Fase 3A do alinhamento de planos).
 *
 * Política de copy desta fase:
 *   - SOMENTE benefícios já entregáveis hoje. Sem promessa de vídeo 360,
 *     créditos mensais, 15 fotos no Pro (wizard ainda limita 10), CRM,
 *     Banner Regional ou Evento Premium.
 *   - Mercado Pago NÃO é acionado nesta fase. CTAs apontam para fluxos
 *     existentes (/anunciar, /cadastro, /ajuda) — Fase 3B liga checkout.
 *   - Cards de assinatura/grátis são copy de marketing estática (não billing).
 *   - O card "Destaque 7 dias" é a ÚNICA parte dinâmica: preço/duração vêm
 *     de platform_settings via o endpoint público GET
 *     /api/public/commercial/boost (mesma fonte do modal/checkout), com
 *     fallback centralizado e ISR — sem login, sem dado sensível, SEO-safe.
 *
 * Travas de regressão em frontend/app/planos/page.test.tsx.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Planos para anunciar veículos",
  description:
    "Anuncie seu veículo no Carros na Cidade — grátis, com plano para lojas ou destaque por 7 dias. Sem comissão, presença local e regional, cadastro simples.",
  alternates: { canonical: "/planos" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Planos para anunciar veículos | Carros na Cidade",
    description:
      "Grátis para CPF e CNPJ validados, planos Start e Pro para lojas, e Destaque 7 dias avulso.",
    url: "/planos",
    type: "website",
    locale: "pt_BR",
  },
};


type PlanCardData = {
  id: string;
  name: string;
  badge?: string;
  priceLabel: string;
  periodLabel: string;
  intro: string;
  benefits: readonly string[];
  note?: string;
  illustration?: string;
  cta: { label: string; href: string };
  style: "highlight" | "accent" | "neutral";
  disabled?: boolean;
  unavailableNote?: string;
};

function priceBRL(price: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(price);
}

/** Conteúdo livre vem do Admin; quantidades e prioridade vêm dos campos operacionais. */
function additionalBenefits(plan: SubscriptionPlan): string[] {
  return (plan.benefits || [])
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter((item) => !/v[ií]deo|360|cr[eé]dito|destaque mensal|destaques mensais|dashboard de performance|banner regional/i.test(item))
    .filter((item) => !/an[uú]ncios?|fotos?|prioridade|peso [1234]|perfil de loja|visibilidade|listagens/i.test(item))
    .slice(0, 2);
}

function buildSubscriptionCard(plan: SubscriptionPlan, tier: "pro" | "start"): PlanCardData {
  const pro = tier === "pro";
  const ranking = Number(plan.weight ?? (pro ? 3 : 2));
  const benefits = [
    pro && plan.ad_limit >= 1000 ? "Anúncios ilimitados*" : "Até " + plan.ad_limit + " anúncios ativos",
    "Até " + (plan.max_photos ?? (pro ? 15 : 12)) + " fotos por anúncio",
    (pro ? "Maior prioridade nas listagens" : "Prioridade nas listagens") + " (peso " + ranking + ")",
    ...(plan.has_store_profile ? ["Perfil de loja personalizado"] : []),
    ...additionalBenefits(plan),
  ];
  return {
    id: pro ? "lojista-pro" : "lojista-start",
    name: pro ? "Lojista Pro" : "Lojista Start",
    badge: plan.recommended ? "MAIS COMPLETO" : undefined,
    priceLabel: priceBRL(Number(plan.price)),
    periodLabel: "/mês",
    intro: plan.description || (pro ? "Mais visibilidade e oportunidades para sua loja." : "Sua loja com mais presença nas buscas locais."),
    benefits,
    illustration: pro ? "/images/dolphin.webp" : "/images/corolla.jpeg",
    cta: {
      label: pro ? "Assinar Pro" : "Assinar Start",
      href: pro ? "/login?next=/anunciar?plano=pro" : "/login?next=/anunciar?plano=start",
    },
    style: pro ? "highlight" : "neutral",
    disabled: plan.subscribable === false,
    unavailableNote: plan.subscribable === false ? "Contratações temporariamente indisponíveis." : undefined,
    note: pro && plan.ad_limit >= 1000 ? "*Sujeito à trava técnica de segurança." : undefined,
  };
}

function buildFreeCard(cpf: SubscriptionPlan | undefined, cnpj: SubscriptionPlan | undefined): PlanCardData {
  const pictures = Math.min(cpf?.max_photos ?? 8, cnpj?.max_photos ?? 8);
  return {
    id: "gratis",
    name: "Grátis",
    priceLabel: "R$ 0",
    periodLabel: "para sempre",
    intro: "Comece a anunciar sem custos, respeitando os limites de CPF ou CNPJ.",
    benefits: [
      "Até " + (cpf?.ad_limit ?? 3) + " anúncios (pessoa física)",
      "Até " + (cnpj?.ad_limit ?? 10) + " anúncios (loja com CNPJ)",
      "Até " + pictures + " fotos por anúncio",
      "Presença nas listagens locais e regionais",
      ...(cnpj?.has_store_profile ? ["Perfil básico da loja"] : []),
    ],
    illustration: "/images/civic.jpeg",
    cta: { label: "Começar grátis", href: "/login?next=/anunciar" },
    style: "neutral",
  };
}

function buildDestaqueCard(boost: Awaited<ReturnType<typeof fetchPublicBoost>>): PlanCardData {
  const days = boost.duration_days;
  return {
    id: "destaque-7-dias",
    name: boost.name,
    badge: "TOPO POR " + days + " DIAS",
    priceLabel: formatBoostPriceBRL(boost.price_cents),
    periodLabel: "por anúncio",
    intro: "Coloque seu anúncio no topo das listagens locais e regionais por " + days + " dias.",
    benefits: [
      "Topo das listagens por " + days + " dias (peso 4)",
      "Disponível para CPF e CNPJ",
      "Novas compras prolongam o destaque",
    ],
    note: "Mantém os limites de anúncios e fotos do seu plano.",
    cta: { label: "Destacar agora", href: "/login?next=/anunciar?acao=destaque" },
    style: "accent",
    disabled: !boost.active,
    unavailableNote: boost.active ? undefined : "Compra de destaque temporariamente indisponível.",
  };
}


const HERO_CHIPS = ["Sem comissão", "Mais visibilidade", "Cadastro simples"] as const;

const KEY_BENEFITS = [
  {
    title: "Mais confiança para o comprador",
    description:
      "Anúncios validados, com cidade clara e contato direto — comprador chega mais qualificado.",
  },
  {
    title: "Mais alcance local e regional",
    description: "O catálogo organiza estoque pela cidade do anúncio e aparece em buscas locais.",
  },
  {
    title: "Página com visual profissional",
    description:
      "Layout limpo, fotos em destaque e ficha técnica clara — sua vitrine digital pronta.",
  },
  {
    title: "Sem promessas confusas",
    description: "Cobramos apenas o que entregamos hoje. Sem letras pequenas, sem pegadinha.",
  },
] as const;

const FAQ = [
  {
    q: "O Destaque altera a quantidade de anúncios ou fotos?",
    a: "Não. O Destaque melhora a posição do anúncio sem alterar os limites contratados.",
  },
  {
    q: "Posso contratar o Destaque mais de uma vez?",
    a: "Sim. Compras repetidas prorrogam o período no topo — o anúncio segue destacado pelo tempo somado.",
  },
  {
    q: "Posso anunciar gratuitamente?",
    a: "Sim, respeitando os limites de CPF (até 3 anúncios) ou CNPJ validado (até 10 anúncios).",
  },
  {
    q: "Quais funcionalidades estão disponíveis durante o lançamento?",
    a: "O acesso a oportunidades para lojas pode estar liberado durante a fase de lançamento. As condições de cada plano serão aplicadas quando essa fase terminar.",
  },
] as const;

// ---------------------------------------------------------------------------
// Cards (subcomponentes locais — não exportar, não tocar design system global)
// ---------------------------------------------------------------------------

function HeroChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cnc-success/10 px-3 py-1 text-[12px] font-bold text-cnc-success ring-1 ring-cnc-success/30">
      <span aria-hidden="true">✓</span>
      {children}
    </span>
  );
}


function PlanCardView({ plan }: { plan: PlanCardData }) {
  const styleByVariant: Record<PlanCardData["style"], { card: string; cta: string; badge: string; check: string }> = {
    highlight: {
      card: "border-blue-500 bg-gradient-to-b from-blue-50/80 via-white to-white shadow-[0_14px_40px_rgba(29,78,216,0.08)]",
      cta: "bg-blue-600 text-white hover:bg-blue-700",
      badge: "bg-blue-600 text-white",
      check: "bg-blue-500 text-white",
    },
    accent: {
      card: "border-amber-400 bg-gradient-to-b from-amber-50/70 via-white to-white shadow-[0_14px_40px_rgba(217,119,6,0.07)]",
      cta: "bg-amber-500 text-white hover:bg-amber-600",
      badge: "bg-amber-500 text-white",
      check: "bg-amber-500 text-white",
    },
    neutral: {
      card: "border-slate-200 bg-white shadow-[0_8px_32px_rgba(15,23,42,0.04)]",
      cta: "bg-slate-900 text-white hover:bg-slate-800",
      badge: "bg-slate-900 text-white",
      check: "bg-emerald-500 text-white",
    },
  };
  const style = styleByVariant[plan.style];
  return (
    <article
      data-plan-id={plan.id}
      className={["relative flex h-full min-h-[540px] flex-col rounded-[22px] border p-5 transition hover:-translate-y-0.5 sm:p-6", style.card].join(" ")}
    >
      {plan.badge ? (
        <span className={["absolute -top-3 left-5 rounded-full px-3 py-1 text-[10px] font-extrabold tracking-wide", style.badge].join(" ")}>
          {plan.badge}
        </span>
      ) : null}
      {plan.illustration ? (
        <div aria-hidden="true" className="absolute right-4 top-5 h-[68px] w-[100px] overflow-hidden rounded-[22px] bg-slate-100/80 opacity-90">
          <Image src={plan.illustration} alt="" fill sizes="100px" className="object-cover" />
        </div>
      ) : plan.style === "accent" ? (
        <div aria-hidden="true" className="absolute right-5 top-6 grid h-12 w-12 place-items-center rounded-2xl bg-amber-100 text-3xl text-amber-500">♛</div>
      ) : null}
      <header className="min-h-[125px] pr-16">
        <h3 className="text-[21px] font-extrabold tracking-tight text-slate-950">{plan.name}</h3>
        <p className="mt-3 text-[13px] leading-6 text-slate-500">{plan.intro}</p>
      </header>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="text-[32px] font-extrabold tracking-tight text-slate-950">{plan.priceLabel}</strong>
        <span className="text-[12px] text-slate-500">{plan.periodLabel}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-3 text-[13px] leading-5 text-slate-900">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <span aria-hidden="true" className={["mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold", style.check].join(" ")}>✓</span>
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      {plan.note ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-500">{plan.note}</p> : null}
      {plan.disabled ? (
        <span aria-disabled="true" className="mt-5 flex h-12 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-500">Indisponível</span>
      ) : (
        <Link
          href={plan.cta.href}
          className={["mt-5 flex h-12 items-center justify-center gap-3 rounded-xl text-sm font-bold transition", style.cta].join(" ")}
        >
          {plan.cta.label} <span aria-hidden="true">→</span>
        </Link>
      )}
      {plan.disabled && plan.unavailableNote ? <p className="mt-2 text-center text-xs text-slate-500">{plan.unavailableNote}</p> : null}
    </article>
  );
}


function BenefitCard({ title, description }: { title: string; description: string }) {
  return (
    <article className="rounded-xl border border-cnc-line bg-white p-4 shadow-card">
      <h3 className="text-sm font-extrabold text-cnc-text-strong sm:text-base">{title}</h3>
      <p className="mt-1 text-xs text-cnc-muted sm:text-sm">{description}</p>
    </article>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  // <details> nativo evita JS adicional e é acessível por padrão.
  return (
    <details className="group rounded-xl border border-cnc-line bg-white p-4 transition hover:shadow-card">
      <summary className="cursor-pointer list-none text-sm font-bold text-cnc-text-strong sm:text-base">
        <span className="mr-2 inline-block transition group-open:rotate-90" aria-hidden="true">
          ▸
        </span>
        {question}
      </summary>
      <p className="mt-2 pl-5 text-sm text-cnc-muted">{answer}</p>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default async function PlanosPage() {
  const [boost, catalog] = await Promise.all([
    fetchPublicBoost(),
    fetchPlansFromAPI({ activeOnly: true }),
  ]);
  const publicPlans = catalog.filter((plan) => plan.is_active && plan.public_visible !== false);
  const find = (id: string) => publicPlans.find((plan) => plan.id === id);
  const pro = find("cnpj-store-pro");
  const start = find("cnpj-store-start");
  const freeCpf = find("cpf-free-essential");
  const freeCnpj = find("cnpj-free-store");
  const plans: PlanCardData[] = [
    buildDestaqueCard(boost),
    ...(pro ? [buildSubscriptionCard(pro, "pro")] : []),
    ...(start ? [buildSubscriptionCard(start, "start")] : []),
    ...(freeCpf || freeCnpj ? [buildFreeCard(freeCpf, freeCnpj)] : []),
  ];

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero */}
      <section aria-labelledby="planos-hero-title" className="text-left">
        <h1
          id="planos-hero-title"
          className="text-3xl font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-4xl lg:text-[54px]"
        >
          Escolha o plano ideal para anunciar seu veículo
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-cnc-muted sm:text-base">
          Venda com presença local e regional, mais confiança para o comprador e cadastro simples —
          sem comissão e sem promessas confusas.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {HERO_CHIPS.map((chip) => (
            <HeroChip key={chip}>{chip}</HeroChip>
          ))}
        </div>
      </section>

      {/* Cards */}
      <section
        aria-label="Planos disponíveis"
        className="mt-10 grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {plans.map((plan) => (
          <PlanCardView key={plan.id} plan={plan} />
        ))}
      </section>

      {/* Benefícios */}
      <section aria-labelledby="planos-beneficios-title" className="mt-14">
        <h2
          id="planos-beneficios-title"
          className="text-2xl font-extrabold text-cnc-text-strong sm:text-3xl"
        >
          Por que escolher o Carros na Cidade
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {KEY_BENEFITS.map((b) => (
            <BenefitCard key={b.title} title={b.title} description={b.description} />
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="planos-faq-title" className="mt-14 max-w-3xl">
        <h2
          id="planos-faq-title"
          className="text-2xl font-extrabold text-cnc-text-strong sm:text-3xl"
        >
          Perguntas frequentes
        </h2>
        <div className="mt-5 space-y-2">
          {FAQ.map((item) => (
            <FaqItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section
        aria-labelledby="planos-cta-title"
        className="mt-14 rounded-2xl border border-cnc-line bg-cnc-bg p-6 text-center sm:p-10"
      >
        <h2
          id="planos-cta-title"
          className="text-2xl font-extrabold text-cnc-text-strong sm:text-3xl"
        >
          Comece a anunciar hoje
        </h2>
        <p className="mt-2 text-sm text-cnc-muted sm:text-base">
          Cadastro grátis em poucos minutos, com suporte humano se precisar.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login?next=/anunciar"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-bold text-white transition hover:bg-primary/90"
          >
            Criar conta grátis
          </Link>
          <Link
            href="/ajuda"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-cnc-line bg-white px-6 text-sm font-bold text-cnc-text-strong transition hover:bg-cnc-bg"
          >
            Falar com o suporte
          </Link>
        </div>
      </section>
    </main>
  );
}
