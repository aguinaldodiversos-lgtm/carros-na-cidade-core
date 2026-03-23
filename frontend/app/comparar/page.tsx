import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Comparar veículos | Carros na Cidade",
  description:
    "Compare dois veículos lado a lado por preço, ano, quilometragem, tabela FIPE e características. Tome a melhor decisão de compra.",
  keywords: ["comparar carros", "comparativo de veículos", "comparar modelos"],
  alternates: { canonical: "/comparar" },
  openGraph: {
    title: "Comparar veículos | Carros na Cidade",
    description: "Compare carros lado a lado e tome a melhor decisão.",
    url: "/comparar",
    type: "website",
    locale: "pt_BR",
  },
};

export const revalidate = 3600;

export default function CompararPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Home</Link>
            <span className="mx-2">/</span>
            <span>Comparar</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Comparar veículos
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7488]">
            Compare dois carros lado a lado por preço, ano, KM e tabela FIPE.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Seleção de veículos */}
        <div className="grid gap-4 sm:grid-cols-2">
          {["Veículo 1", "Veículo 2"].map((label, idx) => (
            <div
              key={label}
              className="rounded-2xl border-2 border-dashed border-[#d4daea] bg-white p-8 text-center"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#edf4ff]">
                <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-[#0e62d8]">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <p className="mt-3 text-[14px] font-bold text-[#1d2538]">{label}</p>
              <p className="mt-1 text-[13px] text-[#6b7488]">Clique para selecionar um anúncio</p>
              <Link
                href={`/comprar?selecionar=comparar&slot=${idx + 1}`}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-5 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#0b54be]"
              >
                Selecionar veículo
              </Link>
            </div>
          ))}
        </div>

        {/* Critérios de comparação */}
        <section className="mt-10">
          <h2 className="text-[22px] font-extrabold text-[#1d2538]">O que você pode comparar</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Preço pedido", desc: "Compare o preço anunciado com a tabela FIPE." },
              { label: "Ano e versão", desc: "Identifique variações entre versões do mesmo modelo." },
              { label: "Quilometragem", desc: "Quilometragem registrada pelo anunciante." },
              { label: "Cidade", desc: "Onde o veículo está localizado." },
              { label: "Valor FIPE", desc: "Referência de mercado para negociação." },
              { label: "Plano do vendedor", desc: "Particular, loja verificada ou destaque premium." },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-[#dfe4ef] bg-white p-4">
                <p className="text-[14px] font-bold text-[#1d2538]">{item.label}</p>
                <p className="mt-1 text-[13px] leading-5 text-[#6b7488]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Links relacionados */}
        <section className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/tabela-fipe"
            className="rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
          >
            Tabela FIPE
          </Link>
          <Link
            href="/simulador-financiamento"
            className="rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
          >
            Simulador de financiamento
          </Link>
          <Link
            href="/oportunidades"
            className="rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
          >
            Oportunidades abaixo da FIPE
          </Link>
          <Link
            href="/comprar"
            className="rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
          >
            Buscar veículos
          </Link>
        </section>
      </div>
    </main>
  );
}
