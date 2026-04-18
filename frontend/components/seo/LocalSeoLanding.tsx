import Image from "next/image";
import Link from "next/link";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export interface LocalSeoLandingProps {
  model: LocalSeoLandingModel;
}

export function LocalSeoLanding({ model }: LocalSeoLandingProps) {
  const { h1, paragraphs, sampleAds, topBrands, paths, hubHref, comprarHref } = model;

  return (
    <div className="min-h-screen bg-[#f6f7fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-10 sm:px-6">
          <nav className="text-sm text-slate-600" aria-label="Trilha">
            <Link href="/" className="hover:text-[#0e62d8]">
              Início
            </Link>
            <span className="mx-2 text-slate-400">/</span>
            <Link href={hubHref} className="hover:text-[#0e62d8]">
              {model.cityName}
            </Link>
          </nav>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{h1}</h1>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <dt className="text-xs font-medium uppercase text-slate-500">Anúncios (recorte)</dt>
              <dd className="text-lg font-semibold text-slate-900">{model.totalAds}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <dt className="text-xs font-medium uppercase text-slate-500">Na cidade (catálogo)</dt>
              <dd className="text-lg font-semibold text-slate-900">{model.catalogTotalAds}</dd>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <dt className="text-xs font-medium uppercase text-slate-500">
                Preço médio (amostra)
              </dt>
              <dd className="text-lg font-semibold text-slate-900">
                {model.avgPrice !== null ? formatMoney(model.avgPrice) : "—"}
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <article className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <section className="prose prose-slate max-w-none prose-p:text-slate-700 prose-p:leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </section>

        {topBrands.length > 0 ? (
          <section aria-labelledby="marcas-heading">
            <h2 id="marcas-heading" className="text-lg font-semibold text-slate-900">
              Marcas com mais anúncios
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {topBrands.map((b) => (
                <li key={b.brand}>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800">
                    {b.brand}
                    <span className="ml-2 text-slate-500">({b.total})</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sampleAds.length > 0 ? (
          <section aria-labelledby="destaques-heading">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h2 id="destaques-heading" className="text-lg font-semibold text-slate-900">
                Destaques em {model.cityName}
              </h2>
              <Link
                href={comprarHref}
                className="text-sm font-medium text-[#0e62d8] hover:underline"
              >
                Ver todos no catálogo →
              </Link>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sampleAds.map((ad) => {
                const href = buildAdHref(ad);
                const img =
                  ad.image_url ||
                  (Array.isArray(ad.images) && ad.images[0]) ||
                  "/images/vehicle-placeholder.svg";
                const title =
                  ad.title || [ad.brand, ad.model, ad.year].filter(Boolean).join(" ") || "Veículo";
                return (
                  <li key={ad.id}>
                    <Link
                      href={href}
                      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-[#0e62d8]/40 hover:shadow-md"
                    >
                      <div className="relative aspect-[16/10] w-full bg-slate-100">
                        <Image
                          src={img}
                          alt={title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <span className="line-clamp-2 font-medium text-slate-900 group-hover:text-[#0e62d8]">
                          {title}
                        </span>
                        {ad.price ? (
                          <span className="text-sm font-semibold text-slate-800">
                            {formatMoney(ad.price)}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section
          className={cx(
            "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm",
            model.isEmptyVariant || model.isEmptyCity ? "border-amber-200 bg-amber-50/40" : ""
          )}
        >
          <h2 className="text-lg font-semibold text-slate-900">Continue explorando</h2>
          <p className="mt-2 text-sm text-slate-600">
            Rotas irmãs para a mesma cidade — conteúdo único e dados atualizados do território.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
            <li>
              <Link className="font-medium text-[#0e62d8] hover:underline" href={paths.em}>
                Carros em {model.cityName}
              </Link>
            </li>
            <li>
              <Link className="font-medium text-[#0e62d8] hover:underline" href={paths.baratos}>
                Carros baratos (abaixo da FIPE)
              </Link>
            </li>
            <li>
              <Link className="font-medium text-[#0e62d8] hover:underline" href={paths.automaticos}>
                Carros automáticos
              </Link>
            </li>
            <li>
              <Link className="font-medium text-[#0e62d8] hover:underline" href={hubHref}>
                Hub da cidade
              </Link>
            </li>
            <li>
              <Link className="font-medium text-[#0e62d8] hover:underline" href={comprarHref}>
                Catálogo filtrado
              </Link>
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
