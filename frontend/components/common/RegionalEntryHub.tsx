import Link from "next/link";
import PageBreadcrumbs from "@/components/common/PageBreadcrumbs";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import { getCityProfile, getStaticCitySlugs } from "@/services/marketService";

type RegionalEntryHubProps = {
  eyebrow: string;
  title: string;
  description: string;
  basePath: "/blog" | "/tabela-fipe" | "/simulador-financiamento";
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta: {
    label: string;
    href: string;
  };
  highlights: string[];
};

const CITY_LIMIT = 12;

export default function RegionalEntryHub({
  eyebrow,
  title,
  description,
  basePath,
  primaryCta,
  secondaryCta,
  highlights,
}: RegionalEntryHubProps) {
  const cities = getStaticCitySlugs(CITY_LIMIT).map((slug) => getCityProfile(slug));
  const breadcrumbItems = [{ name: "Home", href: "/" }, { name: title }];
  const pageSchema = buildWebPageJsonLd({
    title,
    description,
    path: basePath,
    type: "CollectionPage",
    about: title,
  });

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <PageBreadcrumbs items={breadcrumbItems} className="mb-4" />

        <section className="overflow-hidden rounded-[28px] border border-[#dfe4ef] bg-white p-6 shadow-[0_16px_36px_rgba(15,23,42,0.08)] md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5a6781]">{eyebrow}</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-extrabold tracking-tight text-[#1d2538] md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#5e6982] md:text-lg">
            {description}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={primaryCta.href}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#0e62d8] px-6 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              {primaryCta.label}
            </Link>
            <Link
              href={secondaryCta.href}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#d9e2ef] px-6 text-sm font-bold text-[#31405d] transition hover:bg-[#f8fafc]"
            >
              {secondaryCta.label}
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-[#e4ebf4] bg-[#f8fbff] px-4 py-4 text-sm font-medium text-[#42506a]"
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight text-[#1d2538]">
                Entradas locais prioritárias
              </h2>
              <p className="mt-1 text-sm text-[#637089]">
                Escolha uma cidade estratégica para navegar direto pela jornada local.
              </p>
            </div>
            <Link
              href="/anuncios"
              className="text-sm font-bold text-[#0e62d8] hover:text-[#0c4fb0]"
            >
              Ver catálogo nacional
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cities.map((city) => (
              <article
                key={city.slug}
                className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#5d6983]">
                  {city.uf}
                </p>
                <h3 className="mt-2 text-xl font-extrabold text-[#1d2538]">{city.displayName}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5a6781]">
                  Explore o fluxo local ligado ao inventário, intenção e descoberta orgânica.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`${basePath}/${city.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
                  >
                    Abrir página local
                  </Link>
                  <Link
                    href={`/anuncios?city_slug=${city.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-[#d9e2ef] px-4 text-sm font-bold text-[#31405d] transition hover:bg-[#f8fafc]"
                  >
                    Ver anúncios
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
    </>
  );
}
