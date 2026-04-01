import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Vender meu carro | Carros na Cidade",
  description:
    "Anuncie seu carro grátis no Carros na Cidade. Alcance compradores na sua cidade, com verificação de CPF/CNPJ e contato direto via WhatsApp.",
  keywords: [
    "vender meu carro",
    "anunciar carro gratis",
    "vender carro usado",
    "vender carro por conta propria",
    "anuncio de veiculo",
  ],
  alternates: {
    canonical: "/vender-meu-carro",
  },
  openGraph: {
    title: "Vender meu carro | Carros na Cidade",
    description:
      "Anuncie grátis, alcance compradores locais e venda seu carro com mais segurança e visibilidade.",
    url: "/vender-meu-carro",
    type: "website",
    locale: "pt_BR",
  },
};

function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-[#0e62d8]" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconCar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-[#0e62d8]" aria-hidden="true">
      <path d="M3 12l2-5h14l2 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="12" width="18" height="6" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7.5" cy="18" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-[#0e62d8]" aria-hidden="true">
      <path d="M6.6 10.8a15.7 15.7 0 006.6 6.6l2.2-2.2a1 1 0 011-.25c1.1.37 2.3.57 3.5.57a1 1 0 011 1V17a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.2.2 2.4.57 3.5a1 1 0 01-.25 1L6.6 10.8z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-[#0e62d8]" aria-hidden="true">
      <path d="M12 3l7 3.5V11c0 4.1-2.8 7.9-7 9-4.2-1.1-7-4.9-7-9V6.5L12 3z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STEPS = [
  {
    step: "01",
    title: "Crie sua conta",
    body: "Cadastre-se com CPF ou CNPJ em menos de 2 minutos. Documento verificado, contato protegido.",
  },
  {
    step: "02",
    title: "Publique seu anúncio",
    body: "Preencha as informações do veículo, adicione fotos de qualidade e defina o preço pedido.",
  },
  {
    step: "03",
    title: "Receba contatos",
    body: "Compradores interessados entram em contato diretamente via WhatsApp ou telefone. Sem intermediários.",
  },
  {
    step: "04",
    title: "Feche negócio",
    body: "Negocie diretamente, sem comissão por parte do portal. O valor é 100% seu.",
  },
];

const BENEFITS = [
  "Anúncio gratuito para particulares (até 3 veículos ativos)",
  "Verificação de CPF ou CNPJ para maior segurança",
  "Contato direto via WhatsApp — sem intermediários",
  "Alcance compradores na sua cidade e região",
  "Opções de destaque premium para vender mais rápido",
  "Sem comissão sobre o valor da venda",
  "Fotos otimizadas para mobile e desktop",
  "Página do anúncio indexada no Google",
];

const FAQS = [
  {
    question: "Preciso pagar para anunciar?",
    answer:
      "Não. Particulares podem publicar até 3 anúncios ativos gratuitamente. Planos pagos com destaque premium e maior volume estão disponíveis para quem quiser mais visibilidade.",
  },
  {
    question: "Quanto tempo meu anúncio fica no ar?",
    answer:
      "Anúncios ativos ficam visíveis enquanto a conta estiver ativa. Você pode pausar ou remover a qualquer momento pelo dashboard.",
  },
  {
    question: "Como os compradores entram em contato?",
    answer:
      "O portal exibe o botão de WhatsApp e telefone diretamente na página do veículo. Não há intermediação — o contato é direto entre comprador e vendedor.",
  },
  {
    question: "Posso anunciar como lojista?",
    answer:
      "Sim. Lojas com CNPJ têm acesso a planos específicos com mais anúncios ativos, perfil de loja personalizado e destaque automático.",
  },
];

export default function VenderMeuCarroPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Hero */}
      <section className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">
            Anunciar é grátis
          </p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538] sm:text-[48px]">
            Venda seu carro com <br className="hidden sm:block" />
            mais visibilidade
          </h1>
          <p className="mt-4 mx-auto max-w-2xl text-[17px] leading-7 text-[#5c6881]">
            Publique seu anúncio gratuitamente, alcance compradores na sua cidade e feche negócio
            sem pagar comissão. Verificação de documento para mais segurança.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/cadastro"
              className="inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[16px] font-bold text-white shadow-md transition hover:bg-[#0b54be] focus:outline-none focus:ring-2 focus:ring-[#0e62d8] focus:ring-offset-2"
            >
              Criar conta grátis
            </Link>
            <Link
              href="/planos"
              className="inline-flex items-center justify-center rounded-xl border border-[#d4daea] bg-white px-7 py-3.5 text-[16px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
            >
              Ver planos
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Como funciona */}
        <section className="mt-12">
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Como funciona</h2>
          <p className="mt-1 text-[15px] text-[#6b7488]">
            Do cadastro à venda em 4 etapas simples.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm"
              >
                <span className="inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-xs font-black text-[#0e62d8]">
                  {item.step}
                </span>
                <h3 className="mt-3 text-[15px] font-extrabold text-[#1d2538]">{item.title}</h3>
                <p className="mt-1.5 text-[14px] leading-6 text-[#5c6881]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefícios */}
        <section className="mt-12">
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">
            Por que anunciar aqui?
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {BENEFITS.map((benefit) => (
              <div key={benefit} className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0">
                  <IconCheck />
                </span>
                <p className="text-[15px] leading-6 text-[#3d4761]">{benefit}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cards de destaque */}
        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <IconCar />,
              title: "Anúncio grátis",
              body: "Publique até 3 veículos ativos sem pagar nada como particular.",
            },
            {
              icon: <IconPhone />,
              title: "Contato direto",
              body: "WhatsApp e telefone visíveis no anúncio. Sem intermediários.",
            },
            {
              icon: <IconShield />,
              title: "Mais segurança",
              body: "CPF e CNPJ validados. Dados do vendedor verificados antes da publicação.",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#edf4ff]">
                {card.icon}
              </div>
              <h3 className="mt-4 text-[15px] font-extrabold text-[#1d2538]">{card.title}</h3>
              <p className="mt-1.5 text-[14px] leading-6 text-[#5c6881]">{card.body}</p>
            </div>
          ))}
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Perguntas frequentes</h2>
          <div className="mt-6 space-y-4">
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-xl border border-[#dfe4ef] bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                  <span className="text-[15px] font-bold text-[#1d2538]">{faq.question}</span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-5 w-5 shrink-0 text-[#72809a] transition-transform group-open:rotate-180"
                  >
                    <path d="M5 7l5 6 5-6H5Z" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-[14px] leading-6 text-[#5c6881]">{faq.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="mb-12 mt-12 rounded-2xl bg-[#0e62d8] p-8 text-center text-white shadow-md">
          <h2 className="text-[26px] font-extrabold">Pronto para anunciar?</h2>
          <p className="mt-2 text-[15px] opacity-90">
            Crie sua conta em minutos e publique seu primeiro anúncio gratuitamente.
          </p>
          <Link
            href="/cadastro"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-[16px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]"
          >
            Criar conta grátis
          </Link>
        </section>
      </div>
    </main>
  );
}
