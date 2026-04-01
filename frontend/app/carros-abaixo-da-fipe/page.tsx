import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Carros abaixo da FIPE | Carros na Cidade",
  description: "Encontre carros anunciados abaixo do valor da tabela FIPE. Compare preços e aproveite as melhores oportunidades com desconto real.",
  keywords: ["carros abaixo da fipe", "carro barato abaixo da fipe", "desconto fipe", "oportunidade carro"],
  alternates: { canonical: "/carros-abaixo-da-fipe" },
};

export const revalidate = 300;

// Placeholder data — real data comes from backend/search with FIPE comparison
const DEALS = [
  { id: "deal-1", title: "Honda Fit LX 2019", price: 58000, fipe: 68000, discount: 15, km: 48000, city: "São Paulo" },
  { id: "deal-2", title: "Toyota Corolla XEi 2018", price: 82000, fipe: 95000, discount: 14, km: 61000, city: "Campinas" },
  { id: "deal-3", title: "Fiat Argo Drive 2021", price: 63000, fipe: 73000, discount: 14, km: 27000, city: "Curitiba" },
  { id: "deal-4", title: "Chevrolet Onix 2020", price: 55000, fipe: 64000, discount: 14, km: 38000, city: "Porto Alegre" },
];

function formatPrice(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
function formatKm(v: number) {
  return new Intl.NumberFormat("pt-BR").format(v) + " km";
}

export default function CarrosAbaixoDaFipePage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Home</Link>
            <span className="mx-2">/</span>
            <span>Carros abaixo da FIPE</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Carros abaixo da FIPE
          </h1>
          <p className="mt-1.5 text-[15px] text-[#6b7488]">
            Anúncios com preço abaixo do valor de referência da tabela FIPE — desconto real.
          </p>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {DEALS.map((deal) => (
            <Link key={deal.id} href={`/comprar/${deal.id}`}
              className="group rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm transition hover:border-[#0e62d8] hover:shadow-md">
              <span className="inline-flex items-center rounded-full bg-[#dcf5e8] px-2.5 py-0.5 text-[11px] font-black text-[#1a7a45]">
                -{deal.discount}% FIPE
              </span>
              <h2 className="mt-3 text-[15px] font-extrabold text-[#1d2538] group-hover:text-[#0e62d8]">{deal.title}</h2>
              <p className="mt-1 text-[13px] text-[#6b7488]">{formatKm(deal.km)} · {deal.city}</p>
              <p className="mt-2 text-[20px] font-extrabold text-[#0e62d8]">{formatPrice(deal.price)}</p>
              <p className="text-[12px] text-[#a0aec0] line-through">FIPE {formatPrice(deal.fipe)}</p>
            </Link>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/oportunidades" className="rounded-xl bg-[#0e62d8] px-6 py-3 text-[14px] font-bold text-white transition hover:bg-[#0b54be]">
            Ver todas as oportunidades
          </Link>
          <Link href="/tabela-fipe" className="rounded-xl border border-[#d4daea] bg-white px-6 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Consultar tabela FIPE
          </Link>
        </div>
      </div>
    </main>
  );
}
