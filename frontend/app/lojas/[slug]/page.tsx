import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: { slug: string };
};

// Placeholder store data — replaced by real backend data when available
const STORES: Record<
  string,
  {
    slug: string;
    name: string;
    city: string;
    state: string;
    verified: boolean;
    cnpj: string;
    phone: string;
    whatsapp: string;
    description: string;
    address: string;
    plan: string;
    totalAds: number;
    since: string;
    specialties: string[];
    ads: Array<{
      id: string;
      title: string;
      year: number;
      price: number;
      km: number;
      city: string;
    }>;
  }
> = {
  "centro-car-sao-paulo": {
    slug: "centro-car-sao-paulo",
    name: "Centro Car",
    city: "São Paulo",
    state: "SP",
    verified: true,
    cnpj: "11.222.333/0001-81",
    phone: "(11) 98768-4221",
    whatsapp: "5511987684221",
    description:
      "Especialistas em seminovos premium com mais de 10 anos de mercado. Atendimento personalizado, laudo de procedência incluso e financiamento facilitado com as melhores taxas da praça.",
    address: "Av. Paulista, 1500 — Bela Vista, São Paulo/SP",
    plan: "Pro",
    totalAds: 48,
    since: "2014",
    specialties: ["Seminovos premium", "Financiamento", "Troca com troco"],
    ads: [
      { id: "ad-1", title: "Honda Civic EXL", year: 2022, price: 132000, km: 18000, city: "São Paulo" },
      { id: "ad-2", title: "Toyota Corolla XEi", year: 2021, price: 128000, km: 24000, city: "São Paulo" },
      { id: "ad-3", title: "Volkswagen Jetta", year: 2022, price: 119000, km: 12000, city: "São Paulo" },
    ],
  },
  "multimarcas-campinas": {
    slug: "multimarcas-campinas",
    name: "Multimarcas Campinas",
    city: "Campinas",
    state: "SP",
    verified: true,
    cnpj: "22.333.444/0001-92",
    phone: "(19) 99823-1100",
    whatsapp: "5519998231100",
    description:
      "Amplo estoque multimarcas com financiamento facilitado. Mais de 31 opções disponíveis em Campinas.",
    address: "Rua Barão de Jaguara, 800 — Centro, Campinas/SP",
    plan: "Start",
    totalAds: 31,
    since: "2017",
    specialties: ["Multimarcas", "Financiamento", "Veículos populares"],
    ads: [
      { id: "ad-4", title: "Fiat Cronos Drive", year: 2022, price: 72000, km: 22000, city: "Campinas" },
      { id: "ad-5", title: "Chevrolet Onix Plus", year: 2021, price: 68000, km: 31000, city: "Campinas" },
    ],
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const store = STORES[params.slug];

  if (!store) {
    return { title: "Loja não encontrada" };
  }

  return {
    title: `${store.name} — Loja em ${store.city} | Carros na Cidade`,
    description: `${store.description.slice(0, 160)}`,
    alternates: { canonical: `/lojas/${store.slug}` },
    openGraph: {
      title: `${store.name} | Carros na Cidade`,
      description: store.description.slice(0, 160),
      url: `/lojas/${store.slug}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

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

export default function LojaSlugPage({ params }: Props) {
  const store = STORES[params.slug];

  if (!store) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      {/* Header */}
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">
              Home
            </Link>
            <span className="mx-2">/</span>
            <Link href="/lojas" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">
              Lojas
            </Link>
            <span className="mx-2">/</span>
            <span>{store.name}</span>
          </nav>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#edf4ff] text-[28px] font-extrabold text-[#0e62d8]">
                {store.name.charAt(0)}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[28px] font-extrabold tracking-tight text-[#1d2538]">
                    {store.name}
                  </h1>
                  {store.verified && (
                    <span className="rounded-full bg-[#dcf5e8] px-2.5 py-0.5 text-[12px] font-bold text-[#1a7a45]">
                      ✓ CNPJ Verificado
                    </span>
                  )}
                </div>
                <p className="text-[14px] text-[#6b7488]">
                  {store.city} — {store.state} · Desde {store.since}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <a
                href={`https://wa.me/${store.whatsapp}?text=Oi, vi sua loja no Carros na Cidade e gostaria de mais informações.`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25d366] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#1fbc5c]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M17.5 14.5c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.7.1l-1 1.3c-.1.2-.3.2-.6.1-.7-.3-2.8-1.1-4.2-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4-.1-.5l-1-2.3c-.2-.5-.4-.5-.7-.5h-.6c-.2 0-.5.1-.7.4C6.4 8 5.9 9 5.9 10.4c0 1.4.9 2.8 1.1 3 .1.2 1.9 3 4.6 4.2C14 18.8 14 18 14.9 17.9c.9-.1 1.7-.7 2-1.4.2-.6.2-1.1 0-1.5l-.4-.5zM12 2C6.5 2 2 6.5 2 12c0 1.9.5 3.7 1.5 5.2L2 22l4.9-1.6C8.3 21.4 10.1 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2z" />
                </svg>
                WhatsApp
              </a>
              <a
                href={`tel:${store.phone.replace(/\D/g, "")}`}
                className="text-[13px] font-semibold text-[#0e62d8] hover:underline"
              >
                {store.phone}
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Conteúdo principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Sobre */}
            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h2 className="text-[18px] font-extrabold text-[#1d2538]">Sobre a loja</h2>
              <p className="mt-2 text-[14px] leading-6 text-[#5c6881]">{store.description}</p>
              {store.specialties.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {store.specialties.map((s) => (
                    <span key={s} className="rounded-full bg-[#f0f3fa] px-3 py-1 text-[12px] font-semibold text-[#5f6982]">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Anúncios */}
            {store.ads.length > 0 && (
              <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[18px] font-extrabold text-[#1d2538]">
                    Estoque ({store.totalAds} veículos)
                  </h2>
                  <Link
                    href={`/comprar?loja=${store.slug}`}
                    className="text-[13px] font-bold text-[#0e62d8] hover:underline"
                  >
                    Ver todos →
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {store.ads.map((ad) => (
                    <Link
                      key={ad.id}
                      href={`/comprar/${ad.id}`}
                      className="group rounded-xl border border-[#e4e8f2] bg-[#f8fafe] p-4 transition hover:border-[#0e62d8]"
                    >
                      <h3 className="text-[14px] font-bold text-[#1d2538] group-hover:text-[#0e62d8]">
                        {ad.title} {ad.year}
                      </h3>
                      <p className="mt-1 text-[13px] text-[#6b7488]">{formatKm(ad.km)} · {ad.city}</p>
                      <p className="mt-1.5 text-[16px] font-extrabold text-[#0e62d8]">
                        {formatPrice(ad.price)}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">Informações da loja</h3>
              <dl className="mt-3 space-y-2.5 text-[13px]">
                <div>
                  <dt className="font-semibold text-[#72809a]">CNPJ</dt>
                  <dd className="text-[#3d4761]">{store.cnpj}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#72809a]">Localização</dt>
                  <dd className="text-[#3d4761]">{store.address}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#72809a]">Plano ativo</dt>
                  <dd>
                    <span className="rounded-full bg-[#edf4ff] px-2 py-0.5 text-[12px] font-bold text-[#0e62d8]">
                      {store.plan}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#72809a]">Anúncios ativos</dt>
                  <dd className="text-[#3d4761]">{store.totalAds}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl bg-[#0e62d8] p-5 text-white">
              <p className="text-[14px] font-extrabold">Interessado nesta loja?</p>
              <p className="mt-1 text-[13px] opacity-90">Entre em contato diretamente pelo WhatsApp.</p>
              <a
                href={`https://wa.me/${store.whatsapp}?text=Oi, vi sua loja no Carros na Cidade e gostaria de mais informações.`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block rounded-xl bg-white py-2.5 text-center text-[14px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]"
              >
                Chamar no WhatsApp
              </a>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
