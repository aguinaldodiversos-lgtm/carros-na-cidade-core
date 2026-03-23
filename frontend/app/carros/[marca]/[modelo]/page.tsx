import type { Metadata } from "next";
import Link from "next/link";

type Props = {
  params: { marca: string; modelo: string };
};

function decodeSlug(slug: string) {
  return decodeURIComponent(slug).replace(/-/g, " ");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const marca = capitalize(decodeSlug(params.marca));
  const modelo = capitalize(decodeSlug(params.modelo));

  return {
    title: `${marca} ${modelo} usado e seminovo | Carros na Cidade`,
    description: `Encontre ${marca} ${modelo} usados e seminovos. Compare preços, veja tabela FIPE e compre na sua cidade com segurança.`,
    alternates: { canonical: `/carros/${params.marca}/${params.modelo}` },
    openGraph: {
      title: `${marca} ${modelo} | Carros na Cidade`,
      description: `Compre ou venda ${marca} ${modelo} com segurança no Carros na Cidade.`,
      url: `/carros/${params.marca}/${params.modelo}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

// Placeholder years and trim levels
const YEARS = [2024, 2023, 2022, 2021, 2020, 2019, 2018];

export default function CarrosMarcaModeloPage({ params }: Props) {
  const marca = capitalize(decodeSlug(params.marca));
  const modelo = capitalize(decodeSlug(params.modelo));

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
            <Link href="/comprar" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">
              Comprar
            </Link>
            <span className="mx-2">/</span>
            <Link
              href={`/carros/${params.marca}`}
              className="font-semibold text-[#0e62d8] hover:text-[#0b54be]"
            >
              {marca}
            </Link>
            <span className="mx-2">/</span>
            <span>{modelo}</span>
          </nav>

          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            {marca} {modelo}
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7488]">
            Usados e seminovos — compare preços por ano e versão.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            {/* Por ano */}
            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h2 className="text-[18px] font-extrabold text-[#1d2538]">
                {marca} {modelo} por ano
              </h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {YEARS.map((year) => (
                  <Link
                    key={year}
                    href={`/comprar?marca=${params.marca}&modelo=${params.modelo}&ano=${year}`}
                    className="group flex items-center justify-between rounded-xl border border-[#e4e8f2] bg-[#f8fafe] px-4 py-3 transition hover:border-[#0e62d8]"
                  >
                    <div>
                      <span className="text-[14px] font-bold text-[#1d2538] group-hover:text-[#0e62d8]">
                        {marca} {modelo} {year}
                      </span>
                    </div>
                    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-[#a0aec0] group-hover:text-[#0e62d8]">
                      <path d="M7 4l6 6-6 6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </section>

            {/* Anúncios disponíveis */}
            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h2 className="text-[18px] font-extrabold text-[#1d2538]">
                Anúncios disponíveis
              </h2>
              <p className="mt-2 text-[14px] text-[#6b7488]">
                Veja todos os anúncios de {marca} {modelo} no portal.
              </p>
              <Link
                href={`/comprar?marca=${params.marca}&modelo=${params.modelo}`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0e62d8] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
              >
                Ver anúncios de {marca} {modelo}
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M5 10h10M11 6l4 4-4 4" />
                </svg>
              </Link>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">Tabela FIPE</h3>
              <p className="mt-1.5 text-[13px] text-[#6b7488]">
                Consulte o valor de referência {marca} {modelo} na tabela FIPE.
              </p>
              <Link
                href={`/tabela-fipe?marca=${params.marca}&modelo=${params.modelo}`}
                className="mt-3 block text-center rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-bold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
              >
                Consultar FIPE
              </Link>
            </div>

            <div className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">Quer vender?</h3>
              <p className="mt-1.5 text-[13px] text-[#6b7488]">
                Anuncie seu {marca} {modelo} gratuitamente.
              </p>
              <Link
                href="/anunciar"
                className="mt-3 block text-center rounded-xl bg-[#0e62d8] px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-[#0b54be]"
              >
                Anunciar grátis
              </Link>
            </div>

            <div className="rounded-2xl border border-[#dfe4ef] bg-white p-5">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">Financiamento</h3>
              <p className="mt-1.5 text-[13px] text-[#6b7488]">
                Simule o financiamento do seu {marca} {modelo}.
              </p>
              <Link
                href="/simulador-financiamento"
                className="mt-3 block text-center rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-bold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
              >
                Simular financiamento
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
