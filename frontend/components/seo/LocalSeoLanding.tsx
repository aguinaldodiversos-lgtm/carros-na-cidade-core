import Image from "next/image";
import Link from "next/link";
import { buildAdHref } from "@/lib/ads/build-ad-href";
import { formatPricePublic } from "@/lib/public-contracts";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";
import { CityInventoryStats } from "@/components/seo/CityInventoryStats";

/**
 * Wrapper sobre formatPricePublic para a landing SEO local. P3-B
 * 2026-05-25: substitui o `formatMoney` local — usa o contrato público
 * único e elimina risco de "R$ 0" em variantes /carros-baratos-em/ e
 * /carros-automaticos-em/ se backend mandar price=0.
 */
function formatMoney(value: number) {
  return formatPricePublic(value, { whenAbsent: "null" }) ?? "—";
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export interface LocalSeoLandingProps {
  model: LocalSeoLandingModel;
  /**
   * Modo "abaixo do catálogo": esconde o hero (breadcrumb + H1 + stats)
   * porque a página de cidade canônica (`/carros-em/[slug]`) já renderiza
   * esses elementos no `CatalogPageHeader` acima. Mantém parágrafos SEO,
   * marcas, destaques e bloco "Continue explorando" — esses sinais
   * complementam o catálogo sem competir visualmente com ele.
   *
   * Quando false (default), o componente continua sendo a landing SEO
   * stand-alone usada pelas variantes `/carros-baratos-em/` e
   * `/carros-automaticos-em/`.
   */
  compactBelow?: boolean;
}

export function LocalSeoLanding({ model, compactBelow = false }: LocalSeoLandingProps) {
  const { h1, paragraphs, sampleAds, topBrands, paths, hubHref, comprarHref } = model;

  return (
    <div className={compactBelow ? "bg-[#f6f7fb]" : "min-h-screen bg-[#f6f7fb]"}>
      {compactBelow ? null : (
        <header className="border-b border-slate-200/80 bg-white">
          {/* Topo mobile mais enxuto (py-5) — auditoria 2026-05-11
            relatou hero alto demais no celular. Desktop preserva
            py-10 para a aparência institucional. */}
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-5 sm:gap-4 sm:px-6 sm:py-10">
            {/*
            Breadcrumb visível com 3 níveis (Início > UF > Cidade).
            Auditoria 2026-05-11 detectou que a rota canônica
            /carros-em/[slug] não tinha breadcrumb visível nem
            BreadcrumbList JSON-LD apesar de ser `index,follow`. O
            JSON-LD complementar é emitido no createLocalSeoPage.
            Quando `model.state` está ausente, cai para o formato
            antigo de 2 níveis (defesa contra payload legado).
          */}
            <nav className="text-sm text-slate-600" aria-label="Trilha">
              <Link href="/" className="hover:text-[#0e62d8]">
                Início
              </Link>
              <span className="mx-2 text-slate-400">/</span>
              {model.state ? (
                <>
                  <Link
                    href={`/comprar/estado/${model.state.toLowerCase()}`}
                    className="hover:text-[#0e62d8]"
                  >
                    {model.state}
                  </Link>
                  <span className="mx-2 text-slate-400">/</span>
                </>
              ) : null}
              <Link href={hubHref} className="hover:text-[#0e62d8]">
                {model.cityName}
              </Link>
            </nav>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
              {h1}
            </h1>
            {/*
              Estatísticas locais reais do recorte (nº, preço médio, faixa de
              preço) + "Dados atualizados em". Substitui o dl genérico anterior;
              conteúdo único por cidade. Para cidade/recorte sem inventário,
              `CityInventoryStats` renderiza null (não inventa dado — a página
              já é noindex,follow nesse caso) e os parágrafos abaixo explicam.
            */}
            <CityInventoryStats model={model} />
          </div>
        </header>
      )}

      <article
        className={
          compactBelow
            ? "mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"
            : "mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6"
        }
      >
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

        {!compactBelow && sampleAds.length > 0 ? (
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
            {/*
              Cards mobile-first (auditoria 2026-05-11): layout
              horizontal no mobile (imagem 38% à esquerda + texto à
              direita) para 2-3 anúncios visíveis por tela, alinhado
              ao padrão do AdCard que Estado/Regional já usam.
              sm+: grid 2-3 colunas verticais clássicas.
            */}
            <ul className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
                      className="group flex h-full flex-row overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-[#0e62d8]/40 hover:shadow-md sm:flex-col"
                    >
                      <div className="relative aspect-[4/3] w-[38%] shrink-0 bg-slate-100 sm:aspect-[16/10] sm:w-full">
                        <Image
                          src={img}
                          alt={title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 40vw, (max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3 sm:p-4">
                        <span className="line-clamp-2 text-[13px] font-medium text-slate-900 group-hover:text-[#0e62d8] sm:text-base">
                          {title}
                        </span>
                        {ad.price ? (
                          <span className="mt-auto text-sm font-semibold text-slate-800">
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
