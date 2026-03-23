import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Oportunidades abaixo da FIPE | Carros na Cidade",
  description:
    "Encontre veículos anunciados abaixo do valor da tabela FIPE. As melhores oportunidades de compra com desconto real.",
  keywords: [
    "carros abaixo da fipe",
    "oportunidades automotivas",
    "veículos com desconto",
    "carro barato",
  ],
  alternates: { canonical: "/oportunidades" },
  openGraph: {
    title: "Oportunidades abaixo da FIPE | Carros na Cidade",
    description: "Carros com desconto real em relação à tabela FIPE.",
    url: "/oportunidades",
    type: "website",
    locale: "pt_BR",
  },
};

export const revalidate = 300;

// Placeholder opportunities — replaced by real backend data when available
const OPPORTUNITIES = [
  {
    id: "op-1",
    title: "Honda Civic EXL 2020",
    price: 95000,
    fipe: 112000,
    discount: 15,
    km: 42000,
    city: "São Paulo",
    state: "SP",
  },
  {
    id: "op-2",
    title: "Toyota Corolla XEi 2019",
    price: 88000,
    fipe: 102000,
    discount: 14,
    km: 56000,
    city: "Campinas",
    state: "SP",
  },
  {
    id: "op-3",
    title: "Volkswagen T-Cross 2021",
    price: 104000,
    fipe: 119000,
    discount: 13,
    km: 28000,
    city: "Curitiba",
    state: "PR",
  },
  {
    id: "op-4",
    title: "Fiat Pulse Drive 2022",
    price: 75000,
    fipe: 86000,
    discount: 13,
    km: 18000,
    city: "Porto Alegre",
    state: "RS",
  },
  {
    id: "op-5",
    title: "Jeep Renegade Sport 2020",
    price: 89000,
    fipe: 103000,
    discount: 14,
    km: 38000,
    city: "Belo Horizonte",
    state: "MG",
  },
  {
    id: "op-6",
    title: "Hyundai HB20S 2021",
    price: 62000,
    fipe: 72000,
    discount: 14,
    km: 22000,
    city: "Recife",
    state: "PE",
  },
];

function formatPrice(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatKm(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value) + " km";
}

export default function OportunidadesPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Home</Link>
            <span className="mx-2">/</span>
            <span>Oportunidades</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Oportunidades abaixo da FIPE
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7488]">
            Veículos anunciados abaixo do valor de referência da tabela FIPE.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="mb-5 text-[14px] font-semibold text-[#3d4761]">
          {OPPORTUNITIES.length} oportunidades encontradas
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OPPORTUNITIES.map((op) => (
            <Link
              key={op.id}
              href={`/comprar/${op.id}`}
              className="group rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm transition hover:border-[#0e62d8] hover:shadow-md"
            >
              {/* Discount badge */}
              <span className="inline-flex items-center rounded-full bg-[#dcf5e8] px-2.5 py-0.5 text-[11px] font-black text-[#1a7a45]">
                -{op.discount}% abaixo da FIPE
              </span>

              <h2 className="mt-3 text-[16px] font-extrabold text-[#1d2538] group-hover:text-[#0e62d8]">
                {op.title}
              </h2>
              <p className="mt-1 text-[13px] text-[#6b7488]">
                {formatKm(op.km)} · {op.city}/{op.state}
              </p>

              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-[22px] font-extrabold text-[#0e62d8]">
                    {formatPrice(op.price)}
                  </p>
                  <p className="text-[12px] text-[#a0aec0] line-through">
                    FIPE {formatPrice(op.fipe)}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf4ff] transition group-hover:bg-[#0e62d8]">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#0e62d8] group-hover:text-white">
                    <path d="M5 10h10M11 6l4 4-4 4" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/comprar?ordenar=preco_fipe"
            className="rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver mais oportunidades
          </Link>
          <Link
            href="/tabela-fipe"
            className="rounded-xl border border-[#d4daea] bg-white px-6 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
          >
            Consultar tabela FIPE
          </Link>
        </div>
      </div>
    </main>
  );
}
