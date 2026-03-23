import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Financiamento de veículos | Carros na Cidade",
  description:
    "Simule e compare o financiamento do seu próximo carro. Use nosso simulador gratuito para calcular parcelas, taxas e valor de entrada.",
  keywords: [
    "financiamento de carro",
    "simulador de financiamento",
    "financiar veículo",
    "parcelas de carro",
    "crédito automotivo",
  ],
  alternates: { canonical: "/financiamento" },
  openGraph: {
    title: "Financiamento de veículos | Carros na Cidade",
    description: "Simule gratuitamente o financiamento do seu próximo carro.",
    url: "/financiamento",
    type: "website",
    locale: "pt_BR",
  },
};

export const revalidate = 3600;

const STEPS = [
  { step: "01", title: "Escolha o veículo", body: "Encontre o carro nos anúncios ou informe o valor." },
  { step: "02", title: "Defina a entrada", body: "Informe quanto você pode dar de entrada (mínimo 20% recomendado)." },
  { step: "03", title: "Simule as parcelas", body: "Veja projeção de parcelas com diferentes prazos e taxas." },
  { step: "04", title: "Compare e decida", body: "Compare as opções e entre em contato com o vendedor." },
];

const FAQS = [
  {
    question: "Qual o prazo máximo de financiamento?",
    answer: "Em geral, o prazo máximo para financiamento de veículos no Brasil é de 60 meses (5 anos), com algumas instituições oferecendo até 72 meses.",
  },
  {
    question: "Qual a entrada mínima exigida?",
    answer: "A maioria dos bancos exige entrada mínima de 20% do valor do veículo. Entradas maiores reduzem o valor das parcelas e o custo total do financiamento.",
  },
  {
    question: "Quais documentos são necessários?",
    answer: "RG, CPF, comprovante de renda, comprovante de residência e CNH. Para veículos usados, também é necessário o CRLV.",
  },
  {
    question: "Posso financiar um carro usado?",
    answer: "Sim. A maioria dos bancos aceita financiar veículos com até 10 anos de fabricação. Veículos mais antigos têm taxas maiores ou não são aceitos.",
  },
];

export default function FinanciamentoPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Hero */}
      <section className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6 md:py-16">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">
            Simulador gratuito
          </p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538] sm:text-[44px]">
            Financiamento de veículos
          </h1>
          <p className="mt-4 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Simule o financiamento do seu próximo carro, calcule parcelas e compare as condições
            antes de tomar uma decisão.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/simulador-financiamento"
              className="inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[16px] font-bold text-white shadow-md transition hover:bg-[#0b54be]"
            >
              Simular financiamento
            </Link>
            <Link
              href="/comprar"
              className="inline-flex items-center justify-center rounded-xl border border-[#d4daea] bg-white px-7 py-3.5 text-[16px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
            >
              Ver carros disponíveis
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Como funciona */}
        <section>
          <h2 className="text-[24px] font-extrabold text-[#1d2538]">Como funciona o financiamento</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((item) => (
              <div key={item.step} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <span className="inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-xs font-black text-[#0e62d8]">
                  {item.step}
                </span>
                <h3 className="mt-3 text-[14px] font-extrabold text-[#1d2538]">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dicas */}
        <section className="mt-10 rounded-2xl border border-[#dfe4ef] bg-white p-6 shadow-sm">
          <h2 className="text-[22px] font-extrabold text-[#1d2538]">Dicas para financiar melhor</h2>
          <ul className="mt-4 space-y-3 text-[14px] leading-6 text-[#5c6881]">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[#0e62d8]">→</span>
              <span>Pesquise e compare taxas em pelo menos 3 instituições financeiras antes de fechar.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[#0e62d8]">→</span>
              <span>Quanto maior a entrada, menores serão as parcelas e o custo total do crédito.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[#0e62d8]">→</span>
              <span>Verifique o CET (Custo Efetivo Total), que inclui todos os encargos além dos juros.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[#0e62d8]">→</span>
              <span>Considere a tabela FIPE para saber se o preço pedido está dentro do mercado.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-[#0e62d8]">→</span>
              <span>Veículos com pendências de IPVA, multas ou restrições não podem ser transferidos.</span>
            </li>
          </ul>
        </section>

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="text-[24px] font-extrabold text-[#1d2538]">Dúvidas frequentes</h2>
          <div className="mt-5 space-y-3">
            {FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-xl border border-[#dfe4ef] bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                  <span className="text-[14px] font-bold text-[#1d2538]">{faq.question}</span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 shrink-0 text-[#72809a] transition-transform group-open:rotate-180">
                    <path d="M5 7l5 6 5-6H5Z" />
                  </svg>
                </summary>
                <div className="px-5 pb-4 text-[14px] leading-6 text-[#5c6881]">{faq.answer}</div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mb-10 mt-10 rounded-2xl bg-[#0e62d8] p-8 text-center text-white">
          <h2 className="text-[24px] font-extrabold">Pronto para simular?</h2>
          <p className="mt-2 text-[15px] opacity-90">Use nosso simulador gratuito e descubra as melhores condições.</p>
          <Link
            href="/simulador-financiamento"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-[15px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]"
          >
            Acessar simulador
          </Link>
        </section>
      </div>
    </main>
  );
}
