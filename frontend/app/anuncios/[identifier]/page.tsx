import type { Metadata } from "next";
import { fetchAdDetail } from "../../../lib/ads/ad-detail";

interface AdDetailPageProps {
  params: {
    identifier: string;
  };
}

export async function generateMetadata({
  params,
}: AdDetailPageProps): Promise<Metadata> {
  try {
    const ad = await fetchAdDetail(params.identifier);

    return {
      title:
        ad.title ||
        [ad.brand, ad.model, ad.year].filter(Boolean).join(" ") ||
        "Anúncio",
      description:
        ad.description ||
        `Veja detalhes do veículo ${[ad.brand, ad.model, ad.year]
          .filter(Boolean)
          .join(" ")} no Carros na Cidade.`,
      alternates: {
        canonical: `/anuncios/${ad.slug || ad.id}`,
      },
      openGraph: {
        title:
          ad.title ||
          [ad.brand, ad.model, ad.year].filter(Boolean).join(" ") ||
          "Anúncio",
        description:
          ad.description ||
          `Detalhes do veículo em ${ad.city || "sua cidade"}.`,
      },
    };
  } catch {
    return {
      title: "Anúncio | Carros na Cidade",
    };
  }
}

export default async function AdDetailPage({ params }: AdDetailPageProps) {
  const ad = await fetchAdDetail(params.identifier);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
          <div className="aspect-[16/10] w-full bg-zinc-100" />
        </div>

        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            {ad.below_fipe === true && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Abaixo da FIPE
              </span>
            )}

            {ad.highlight_until && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                Destaque
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-zinc-900">
            {ad.title || [ad.brand, ad.model, ad.year].filter(Boolean).join(" ")}
          </h1>

          <p className="mt-4 text-3xl font-extrabold text-zinc-900">
            {ad.price
              ? new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                }).format(Number(ad.price))
              : "Consulte"}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-zinc-600">
            <div>Ano: {ad.year || "-"}</div>
            <div>KM: {ad.mileage || "-"}</div>
            <div>Marca: {ad.brand || "-"}</div>
            <div>Modelo: {ad.model || "-"}</div>
            <div>Cidade: {ad.city || "-"}</div>
            <div>Estado: {ad.state || "-"}</div>
          </div>

          {ad.description ? (
            <div className="mt-6 border-t border-zinc-100 pt-6">
              <h2 className="text-lg font-semibold text-zinc-900">Descrição</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-600">
                {ad.description}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
