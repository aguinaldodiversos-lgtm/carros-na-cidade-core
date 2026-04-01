import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Para lojistas | Carros na Cidade",
  description:
    "Portal automotivo para lojas e revendedoras. Publique seu estoque, receba leads qualificados e aumente suas vendas com planos para CNPJ.",
  keywords: [
    "anunciar como lojista",
    "portal para lojistas automotivos",
    "plano cnpj",
    "anunciar estoque de loja",
    "revenda automotiva",
  ],
  alternates: { canonical: "/para-lojistas" },
};

export const revalidate = 3600;

const BENEFITS = [
  {
    icon: "🏪",
    title: "Perfil de loja verificado",
    desc: "CNPJ verificado, página de loja personalizada com estoque, contato e identidade visual.",
  },
  {
    icon: "📦",
    title: "Maior volume de anúncios",
    desc: "Planos a partir de 20 anúncios gratuitos até 350 ativos com destaque automático.",
  },
  {
    icon: "📍",
    title: "Presença local e regional",
    desc: "Anúncios aparecem nas páginas de cidade, marca e categoria para maior visibilidade.",
  },
  {
    icon: "📊",
    title: "Dashboard de performance",
    desc: "Veja visualizações, contatos e desempenho de cada anúncio no painel do lojista.",
  },
  {
    icon: "💬",
    title: "Leads qualificados",
    desc: "Compradores entram em contato diretamente pelo WhatsApp ou via formulário.",
  },
  {
    icon: "🔒",
    title: "Pagamento seguro",
    desc: "Assinaturas via Mercado Pago com renovação automática e webhook validado.",
  },
];

const PLANS = [
  {
    name: "Grátis",
    price: "R$ 0",
    period: "",
    ads: "20 anúncios",
    features: ["Perfil de loja", "CNPJ verificado", "Sem destaque"],
    cta: "Cadastrar gratuitamente",
    href: "/cadastro",
    highlight: false,
  },
  {
    name: "Start",
    price: "R$ 299",
    period: "/mês",
    ads: "80 anúncios",
    features: ["Tudo do gratuito", "Destaques configuráveis", "Prioridade de exibição"],
    cta: "Assinar Loja Start",
    href: "/planos",
    highlight: false,
  },
  {
    name: "Pro",
    price: "R$ 599",
    period: "/mês",
    ads: "200 anúncios",
    features: ["Tudo do Start", "Destaque automático", "Dashboard de performance"],
    cta: "Assinar Loja Pro",
    href: "/planos",
    highlight: true,
  },
  {
    name: "Evento Premium",
    price: "R$ 999",
    period: "/mês",
    ads: "350 anúncios",
    features: ["Tudo do Pro", "Banner regional na home", "Impulsionamento geolocalizado"],
    cta: "Falar com consultor",
    href: "/contato",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Como verificar meu CNPJ?",
    a: "Após criar a conta com CNPJ, nossa equipe realiza a verificação em até 24h úteis. Lojas verificadas têm acesso ao perfil público e ao plano gratuito.",
  },
  {
    q: "Posso cadastrar funcionários para gerenciar anúncios?",
    a: "A gestão de acesso multi-usuário está em desenvolvimento. Por ora, o acesso é pelo titular da conta.",
  },
  {
    q: "Como funciona o cancelamento da assinatura?",
    a: "Você pode cancelar a qualquer momento pelo dashboard. Os benefícios permanecem até o fim do período já pago.",
  },
  {
    q: "O portal aceita integração com estoque?",
    a: "A API de integração com sistemas de gestão de estoque está em desenvolvimento. Entre em contato para mais informações.",
  },
];

export default function ParaLojistasPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Hero */}
      <section className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 md:py-16">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Para revendedoras e lojas</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538] sm:text-[48px]">
            Expanda suas vendas com um <br className="hidden sm:block" /> perfil de loja verificado
          </h1>
          <p className="mt-4 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Publique seu estoque, receba leads qualificados e aumente a visibilidade da sua loja com
            planos especiais para CNPJ verificado.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/cadastro"
              className="inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[16px] font-bold text-white shadow-md transition hover:bg-[#0b54be]"
            >
              Criar conta de loja
            </Link>
            <Link
              href="/planos"
              className="inline-flex items-center justify-center rounded-xl border border-[#d4daea] bg-white px-7 py-3.5 text-[16px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]"
            >
              Ver planos para lojistas
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 space-y-12">
        {/* Benefits */}
        <section>
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Por que usar o Carros na Cidade?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <div className="text-2xl">{b.icon}</div>
                <h3 className="mt-3 text-[15px] font-extrabold text-[#1d2538]">{b.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{b.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Plans */}
        <section>
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Planos para lojistas</h2>
          <p className="mt-1 text-[14px] text-[#6b7488]">Comece gratuitamente e escale conforme seu volume de vendas.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl border p-5 shadow-sm ${
                  plan.highlight
                    ? "border-[#0e62d8] bg-[#edf4ff]"
                    : "border-[#dfe4ef] bg-white"
                }`}
              >
                {plan.highlight && (
                  <span className="inline-block rounded-full bg-[#0e62d8] px-2.5 py-0.5 text-[11px] font-black text-white mb-2">
                    Mais popular
                  </span>
                )}
                <h3 className="text-[17px] font-extrabold text-[#1d2538]">{plan.name}</h3>
                <p className="mt-1">
                  <span className="text-[24px] font-extrabold text-[#0e62d8]">{plan.price}</span>
                  <span className="text-[13px] text-[#6b7488]">{plan.period}</span>
                </p>
                <p className="mt-1 text-[13px] font-bold text-[#1d2538]">{plan.ads}</p>
                <ul className="mt-3 space-y-1.5 text-[12px] text-[#5c6881]">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5">
                      <span className="text-[#0e62d8]">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-4 block text-center rounded-xl px-4 py-2.5 text-[13px] font-bold transition ${
                    plan.highlight
                      ? "bg-[#0e62d8] text-white hover:bg-[#0b54be]"
                      : "border border-[#d4daea] text-[#333d54] hover:border-[#0e62d8] hover:text-[#0e62d8]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-[24px] font-extrabold text-[#1d2538]">Dúvidas de lojistas</h2>
          <div className="mt-5 space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.q} className="group rounded-xl border border-[#dfe4ef] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                  <span className="text-[14px] font-bold text-[#1d2538]">{faq.q}</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-[#72809a] transition-transform group-open:rotate-180">
                    <path d="M5 7l5 6 5-6H5Z" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-[14px] leading-6 text-[#5c6881]">{faq.a}</div>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="rounded-2xl bg-[#0e62d8] p-8 text-center text-white">
          <h2 className="text-[26px] font-extrabold">Pronto para crescer?</h2>
          <p className="mt-2 text-[15px] opacity-90">
            Cadastre sua loja hoje e comece a receber contatos qualificados gratuitamente.
          </p>
          <Link
            href="/cadastro"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-[15px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]"
          >
            Cadastrar loja agora
          </Link>
        </section>
      </div>
    </main>
  );
}
