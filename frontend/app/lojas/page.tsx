import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Lojas | Carros na Cidade",
  description:
    "Encontre lojas de veículos verificadas por cidade no Carros na Cidade. Consulte estoque, perfil e contato de lojistas automotivos.",
  keywords: [
    "lojas de carros",
    "concessionárias",
    "lojista automotivo",
    "estoque de veículos",
    "lojas de veículos por cidade",
  ],
  alternates: {
    canonical: "/lojas",
  },
  openGraph: {
    title: "Lojas de veículos | Carros na Cidade",
    description:
      "Lojas automotivas verificadas com CNPJ, estoque e contato direto.",
    url: "/lojas",
    type: "website",
    locale: "pt_BR",
  },
};

export const revalidate = 300;

// Placeholder stores — replaced by real backend data when available
const FEATURED_STORES = [
  {
    slug: "centro-car-sao-paulo",
    name: "Centro Car",
    city: "São Paulo",
    state: "SP",
    verified: true,
    totalAds: 48,
    plan: "Pro",
    description: "Especialistas em seminovos premium com mais de 10 anos de mercado.",
  },
  {
    slug: "multimarcas-campinas",
    name: "Multimarcas Campinas",
    city: "Campinas",
    state: "SP",
    verified: true,
    totalAds: 31,
    plan: "Start",
    description: "Amplo estoque multimarcas com financiamento facilitado.",
  },
  {
    slug: "auto-sul-porto-alegre",
    name: "Auto Sul",
    city: "Porto Alegre",
    state: "RS",
    verified: true,
    totalAds: 22,
    plan: "Start",
    description: "Referência no Sul do Brasil em veículos populares e econômicos.",
  },
  {
    slug: "premium-motors-curitiba",
    name: "Premium Motors",
    city: "Curitiba",
    state: "PR",
    verified: true,
    totalAds: 67,
    plan: "Pro",
    description: "Importados e nacionais de alto padrão, com garantia e revisão inclusa.",
  },
  {
    slug: "belo-auto-bh",
    name: "Belo Auto",
    city: "Belo Horizonte",
    state: "MG",
    verified: true,
    totalAds: 19,
    plan: "Start",
    description: "Veículos usados confiáveis com laudo de procedência e financiamento.",
  },
  {
    slug: "nordeste-motors-recife",
    name: "Nordeste Motors",
    city: "Recife",
    state: "PE",
    verified: false,
    totalAds: 11,
    plan: "Grátis",
    description: "Estoque regional com foco em veículos econômicos e de trabalho.",
  },
];

function StoreCard({
  store,
}: {
  store: (typeof FEATURED_STORES)[number];
}) {
  return (
    <Link
      href={`/lojas/${store.slug}`}
      className="group block rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm transition hover:border-[#0e62d8] hover:shadow-md"
    >
      {/* Avatar placeholder */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#edf4ff] text-[20px] font-extrabold text-[#0e62d8]">
          {store.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-extrabold text-[#1d2538] group-hover:text-[#0e62d8]">
              {store.name}
            </h2>
            {store.verified && (
              <span
                title="CNPJ verificado"
                className="inline-flex items-center rounded-full bg-[#dcf5e8] px-2 py-0.5 text-[11px] font-bold text-[#1a7a45]"
              >
                ✓ Verificada
              </span>
            )}
          </div>
          <p className="text-[13px] text-[#6b7488]">
            {store.city} — {store.state}
          </p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-[#5c6881]">
        {store.description}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <span className="rounded-full bg-[#f0f3fa] px-2.5 py-0.5 text-[12px] font-semibold text-[#5f6982]">
          {store.totalAds} anúncios
        </span>
        <span className="rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-[12px] font-semibold text-[#0e62d8]">
          Plano {store.plan}
        </span>
      </div>
    </Link>
  );
}

export default function LojasPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">
              Home
            </Link>
            <span className="mx-2">/</span>
            <span>Lojas</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Lojas de veículos
          </h1>
          <p className="mt-1.5 text-[15px] text-[#6b7488]">
            Lojas automotivas verificadas com CNPJ, estoque e contato direto.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Filter hint */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="text-[14px] font-semibold text-[#3d4761]">
            {FEATURED_STORES.length} lojas encontradas
          </span>
          <span className="rounded-full bg-[#dcf5e8] px-3 py-1 text-[12px] font-bold text-[#1a7a45]">
            ✓ CNPJ verificado
          </span>
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED_STORES.map((store) => (
            <StoreCard key={store.slug} store={store} />
          ))}
        </div>

        {/* CTA para lojistas */}
        <section className="mt-12 rounded-2xl bg-[#0e62d8] p-8 text-center text-white">
          <h2 className="text-[24px] font-extrabold">Sua loja ainda não está aqui?</h2>
          <p className="mt-2 text-[15px] opacity-90">
            Cadastre sua loja com CNPJ, publique seu estoque e receba contatos qualificados.
          </p>
          <Link
            href="/cadastro"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-white px-7 py-3.5 text-[15px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]"
          >
            Cadastrar loja gratuitamente
          </Link>
        </section>
      </div>
    </main>
  );
}
