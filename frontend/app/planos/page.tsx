import type { Metadata } from "next";
import Link from "next/link";

/**
 * /planos — landing pública de conversão (Fase 3A do alinhamento de planos).
 *
 * Política de copy desta fase:
 *   - SOMENTE benefícios já entregáveis hoje. Sem promessa de vídeo 360,
 *     créditos mensais, 15 fotos no Pro (wizard ainda limita 10), CRM,
 *     Banner Regional ou Evento Premium.
 *   - Mercado Pago NÃO é acionado nesta fase. CTAs apontam para fluxos
 *     existentes (/anunciar, /cadastro, /ajuda) — Fase 3B liga checkout.
 *   - Estrutura totalmente estática: zero fetch, zero dependência do
 *     /api/account/plans. Cards são copy de marketing, não billing.
 *
 * Travas de regressão em frontend/app/planos/page.test.tsx.
 */

export const revalidate = 900;

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
  benefits: ReadonlyArray<string>;
  cautions?: ReadonlyArray<string>;
  cta: { label: string; href: string };
  /**
   * Estilo do card — não afeta design system global, é só uma chave para
   * variantes locais visuais (cor da borda + cor do botão).
   *   highlight: Pro recomendado (borda primary, badge azul, sombra)
   *   accent:    Destaque 7 dias (borda warning, botão laranja forte)
   *   neutral:   demais
   */
  style: "highlight" | "accent" | "neutral";
};

/**
 * Ordem de exibição definida pelo produto:
 *   1. Destaque 7 dias (entry point de monetização rápida)
 *   2. Lojista Pro (recomendado)
 *   3. Lojista Start
 *   4. Grátis (entry point de aquisição)
 */
const PLANS: ReadonlyArray<PlanCardData> = [
  {
    id: "destaque-7-dias",
    name: "Destaque 7 dias",
    badge: "TOPO POR 7 DIAS",
    priceLabel: "R$ 39,90",
    periodLabel: "por anúncio",
    intro: "Coloque um anúncio no topo das listagens da sua cidade por 7 dias.",
    benefits: [
      "Posição de destaque no catálogo por 7 dias",
      "Disponível para CPF e CNPJ",
      "Compras repetidas prorrogam o tempo no topo",
    ],
    cautions: [
      "Não libera vídeo 360",
      "Não altera o limite de fotos",
      "Não altera o limite de anúncios",
    ],
    cta: { label: "Destacar agora", href: "/ajuda?assunto=destaque-7-dias" },
    style: "accent",
  },
  {
    id: "lojista-pro",
    name: "Lojista Pro",
    badge: "RECOMENDADO",
    priceLabel: "R$ 149,90",
    periodLabel: "/mês",
    intro: "Mais exposição para a loja, com prioridade comercial superior ao Start.",
    benefits: [
      "Mais exposição da loja nas listagens",
      "Mais anúncios ativos no lançamento, com limite operacional",
      "Prioridade comercial superior ao Start",
      "Perfil de loja com identidade visual",
    ],
    cta: { label: "Assinar Pro", href: "/anunciar?plano=pro" },
    style: "highlight",
  },
  {
    id: "lojista-start",
    name: "Lojista Start",
    priceLabel: "R$ 79,90",
    periodLabel: "/mês",
    intro: "Plano de entrada para lojas começarem a operação digital com presença consistente.",
    benefits: [
      "Até 20 anúncios ativos",
      "Mais presença nas listagens",
      "Ideal para lojas em início de operação digital",
      "Perfil de loja personalizado",
    ],
    cta: { label: "Assinar Start", href: "/anunciar?plano=start" },
    style: "neutral",
  },
  {
    id: "gratis",
    name: "Grátis",
    priceLabel: "R$ 0",
    periodLabel: "para sempre",
    intro: "Comece a anunciar sem custos respeitando os limites de CPF ou CNPJ.",
    benefits: [
      "Pessoa física: até 3 anúncios",
      "Loja com CNPJ: até 10 anúncios",
      "Até 8 fotos por anúncio",
      "CPF ou CNPJ validado",
    ],
    cta: { label: "Começar grátis", href: "/cadastro" },
    style: "neutral",
  },
];

const HERO_CHIPS = ["Sem comissão", "Mais visibilidade", "Cadastro simples"] as const;

const KEY_BENEFITS = [
  {
    title: "Mais confiança para o comprador",
    description:
      "Anúncios validados, com cidade clara e contato direto — comprador chega mais qualificado.",
  },
  {
    title: "Mais alcance local e regional",
    description:
      "O catálogo organiza estoque pela cidade do anúncio e aparece em buscas locais.",
  },
  {
    title: "Página com visual profissional",
    description:
      "Layout limpo, fotos em destaque e ficha técnica clara — sua vitrine digital pronta.",
  },
  {
    title: "Sem promessas confusas",
    description:
      "Cobramos apenas o que entregamos hoje. Sem letras pequenas, sem pegadinha.",
  },
] as const;

const FAQ = [
  {
    q: "O Destaque libera vídeo 360?",
    a: "Não. O Destaque apenas coloca o anúncio no topo das listagens por 7 dias.",
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
    q: "Quando começam os planos pagos?",
    a: "Os planos pagos serão liberados de forma gradual conforme validação do cadastro e disponibilidade de pagamento. Avisamos por e-mail quando estiver pronto para você.",
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
  // Variantes locais — nada novo no design system. Usa tokens cnc-* existentes.
  const styleByVariant: Record<PlanCardData["style"], { card: string; cta: string; badge: string }> = {
    highlight: {
      card: "border-primary/60 ring-2 ring-primary/30 shadow-premium bg-white",
      cta: "bg-primary text-white hover:bg-primary/90",
      badge: "bg-primary text-white",
    },
    accent: {
      card: "border-cnc-warning/60 ring-2 ring-cnc-warning/30 shadow-card bg-white",
      cta: "bg-cnc-warning text-white hover:bg-cnc-warning/90",
      badge: "bg-cnc-warning text-white",
    },
    neutral: {
      card: "border-cnc-line bg-white shadow-card",
      cta: "bg-cnc-text-strong text-white hover:bg-cnc-text-strong/90",
      badge: "bg-cnc-bg text-cnc-text-strong",
    },
  };
  const s = styleByVariant[plan.style];

  return (
    <article
      data-plan-id={plan.id}
      className={`relative flex flex-col rounded-2xl border p-5 transition hover:-translate-y-0.5 ${s.card}`}
    >
      {plan.badge ? (
        <span
          className={`absolute -top-3 left-5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${s.badge}`}
        >
          {plan.badge}
        </span>
      ) : null}

      <header>
        <h3 className="text-lg font-extrabold text-cnc-text-strong sm:text-xl">{plan.name}</h3>
        <p className="mt-1 text-xs text-cnc-muted sm:text-sm">{plan.intro}</p>
      </header>

      <p className="mt-4 flex items-baseline gap-1">
        <strong className="text-3xl font-extrabold tracking-tight text-cnc-text-strong sm:text-4xl">
          {plan.priceLabel}
        </strong>
        <span className="text-xs text-cnc-muted sm:text-sm">{plan.periodLabel}</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2 text-[13px] text-cnc-text-strong sm:text-sm">
        {plan.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span aria-hidden="true" className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cnc-success" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {plan.cautions && plan.cautions.length > 0 ? (
        <ul className="mt-3 space-y-1 text-[11px] text-cnc-muted sm:text-[12px]">
          {plan.cautions.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span aria-hidden="true" className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-cnc-muted" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        href={plan.cta.href}
        className={`mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-bold transition ${s.cta}`}
      >
        {plan.cta.label}
      </Link>
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

export default function PlanosPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero */}
      <section aria-labelledby="planos-hero-title" className="text-left">
        <h1
          id="planos-hero-title"
          className="text-3xl font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-4xl lg:text-5xl"
        >
          Escolha o plano ideal para anunciar seu veículo
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-cnc-muted sm:text-base">
          Venda com presença local e regional, mais confiança para o comprador e cadastro simples — sem
          comissão e sem promessas confusas.
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
        className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        {PLANS.map((plan) => (
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
            href="/cadastro"
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
