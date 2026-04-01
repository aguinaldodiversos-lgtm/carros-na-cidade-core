import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Como funciona | Carros na Cidade",
  description:
    "Entenda como o portal Carros na Cidade funciona para compradores, vendedores e lojistas. Anúncio simples, seguro e sem comissão.",
  alternates: { canonical: "/como-funciona" },
};

export const revalidate = 3600;

const BUYER_STEPS = [
  { step: "01", title: "Busque por modelo ou cidade", desc: "Use os filtros para encontrar o veículo certo por marca, modelo, ano, preço ou localização." },
  { step: "02", title: "Compare e consulte a FIPE", desc: "Veja se o preço pedido está dentro do mercado usando a tabela FIPE integrada." },
  { step: "03", title: "Entre em contato direto", desc: "Fale pelo WhatsApp ou telefone diretamente com o vendedor, sem intermediários." },
  { step: "04", title: "Feche negócio com segurança", desc: "Negocie pessoalmente, faça vistoria e transfira o documento em segurança." },
];

const SELLER_STEPS = [
  { step: "01", title: "Crie sua conta", desc: "Cadastre-se com CPF ou CNPJ. Verificação de documento inclusa." },
  { step: "02", title: "Publique o anúncio", desc: "Preencha as informações do veículo, adicione fotos e defina o preço." },
  { step: "03", title: "Receba contatos", desc: "Compradores interessados entram em contato pelo portal." },
  { step: "04", title: "Venda sem comissão", desc: "O valor da venda é 100% seu — sem taxa de intermediação." },
];

export default function ComoFuncionaPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Hero */}
      <section className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Plataforma</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538] sm:text-[44px]">
            Como funciona o Carros na Cidade
          </h1>
          <p className="mt-4 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Um portal automotivo criado para conectar compradores, vendedores e lojistas com foco
            em transparência, segurança e descoberta local.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 space-y-12">
        {/* Para compradores */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-[12px] font-black uppercase tracking-wide text-[#0e62d8]">
              Para compradores
            </span>
          </div>
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Encontre e compre com segurança</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BUYER_STEPS.map((item) => (
              <div key={item.step} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <span className="inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-xs font-black text-[#0e62d8]">{item.step}</span>
                <h3 className="mt-3 text-[14px] font-extrabold text-[#1d2538]">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Link href="/comprar" className="inline-flex items-center gap-2 rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]">
              Buscar veículos
            </Link>
          </div>
        </section>

        {/* Para vendedores */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="rounded-full bg-[#edf4ff] px-3 py-1 text-[12px] font-black uppercase tracking-wide text-[#0e62d8]">
              Para vendedores
            </span>
          </div>
          <h2 className="text-[26px] font-extrabold text-[#1d2538]">Anuncie e venda sem comissão</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SELLER_STEPS.map((item) => (
              <div key={item.step} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <span className="inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-xs font-black text-[#0e62d8]">{item.step}</span>
                <h3 className="mt-3 text-[14px] font-extrabold text-[#1d2538]">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/cadastro" className="inline-flex items-center gap-2 rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]">
              Criar conta grátis
            </Link>
            <Link href="/planos" className="inline-flex items-center gap-2 rounded-xl border border-[#d4daea] bg-white px-6 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
              Ver planos
            </Link>
          </div>
        </section>

        {/* Para lojistas */}
        <section className="rounded-2xl bg-[#0e62d8] p-8 text-white">
          <p className="text-xs font-black uppercase tracking-wide opacity-80">Para lojistas</p>
          <h2 className="mt-2 text-[24px] font-extrabold">CNPJ verificado, mais credibilidade</h2>
          <p className="mt-2 text-[14px] opacity-90 max-w-2xl">
            Lojas com CNPJ verificado têm acesso a planos com mais anúncios, destaque automático,
            perfil de loja personalizado e geração de leads qualificados.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/para-lojistas" className="rounded-xl bg-white px-6 py-3 text-[14px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]">
              Saiba mais para lojistas
            </Link>
            <Link href="/planos" className="rounded-xl border border-white/40 px-6 py-3 text-[14px] font-semibold text-white transition hover:bg-white/10">
              Ver planos para loja
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
