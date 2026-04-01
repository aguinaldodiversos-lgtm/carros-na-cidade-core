import type { Metadata } from "next";
import Link from "next/link";

type Props = {
  params: { marca: string };
};

function decodeMarca(slug: string) {
  return decodeURIComponent(slug).replace(/-/g, " ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const marca = decodeMarca(params.marca);
  const marcaLabel = marca.charAt(0).toUpperCase() + marca.slice(1);

  return {
    title: `Carros ${marcaLabel} usados e seminovos | Carros na Cidade`,
    description: `Encontre carros ${marcaLabel} usados e seminovos com os melhores preços. Compare modelos, veja tabela FIPE e compre com segurança.`,
    alternates: { canonical: `/carros/${params.marca}` },
    openGraph: {
      title: `Carros ${marcaLabel} | Carros na Cidade`,
      description: `Compare e encontre ${marcaLabel} usados e seminovos na sua cidade.`,
      url: `/carros/${params.marca}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

// Placeholder models per brand
const BRAND_MODELS: Record<string, string[]> = {
  honda: ["Civic", "HR-V", "CR-V", "Fit", "City", "Accord", "WR-V"],
  toyota: ["Corolla", "Hilux", "Yaris", "RAV4", "Camry", "SW4", "Etios"],
  volkswagen: ["Gol", "Polo", "T-Cross", "Virtus", "Amarok", "Tiguan", "Jetta"],
  chevrolet: ["Onix", "Cruze", "Tracker", "S10", "Equinox", "Montana", "Cobalt"],
  fiat: ["Argo", "Cronos", "Pulse", "Fastback", "Toro", "Mobi", "Strada"],
  hyundai: ["HB20", "Creta", "Tucson", "ix35", "Santa Fe", "Elantra"],
  ford: ["Ka", "EcoSport", "Ranger", "Territory", "Bronco", "Maverick"],
  jeep: ["Renegade", "Compass", "Commander", "Gladiator", "Wrangler"],
  nissan: ["Kicks", "Versa", "Frontier", "Sentra", "March"],
  renault: ["Kwid", "Sandero", "Duster", "Logan", "Captur", "Stepway"],
};

export default function CarrosMarcaPage({ params }: Props) {
  const marcaSlug = params.marca.toLowerCase();
  const marcaLabel =
    decodeMarca(params.marca).charAt(0).toUpperCase() +
    decodeMarca(params.marca).slice(1);
  const models = BRAND_MODELS[marcaSlug] ?? [];

  return (
    <main className="min-h-screen bg-[#f4f6fa]">
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
            <span>{marcaLabel}</span>
          </nav>
          <h1 className="text-[32px] font-extrabold tracking-tight text-[#1d2538]">
            Carros {marcaLabel}
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7488]">
            Usados e seminovos com melhor custo-benefício.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {models.length > 0 ? (
          <>
            <h2 className="text-[20px] font-extrabold text-[#1d2538]">
              Modelos {marcaLabel}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {models.map((model) => (
                <Link
                  key={model}
                  href={`/carros/${params.marca}/${model.toLowerCase().replace(/\s+/g, "-")}`}
                  className="group flex items-center justify-between rounded-xl border border-[#dfe4ef] bg-white px-4 py-3.5 shadow-sm transition hover:border-[#0e62d8] hover:shadow-md"
                >
                  <span className="text-[15px] font-bold text-[#1d2538] group-hover:text-[#0e62d8]">
                    {marcaLabel} {model}
                  </span>
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-[#a0aec0] group-hover:text-[#0e62d8]">
                    <path d="M7 4l6 6-6 6" />
                  </svg>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-[#dfe4ef] bg-white p-8 text-center">
            <p className="text-[15px] text-[#6b7488]">
              Nenhum modelo encontrado para <strong>{marcaLabel}</strong>.
            </p>
            <Link
              href="/comprar"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-5 py-2.5 text-[14px] font-bold text-white transition hover:bg-[#0b54be]"
            >
              Ver todos os carros
            </Link>
          </div>
        )}

        {/* Ver anúncios */}
        <div className="mt-8">
          <Link
            href={`/comprar?marca=${params.marca}`}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0e62d8] px-6 py-3 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver todos os anúncios de {marcaLabel}
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M5 10h10M11 6l4 4-4 4" />
            </svg>
          </Link>
        </div>

        {/* Link FIPE */}
        <div className="mt-6">
          <Link
            href={`/tabela-fipe?marca=${params.marca}`}
            className="text-[14px] font-semibold text-[#0e62d8] hover:underline"
          >
            Ver tabela FIPE para {marcaLabel} →
          </Link>
        </div>
      </div>
    </main>
  );
}
