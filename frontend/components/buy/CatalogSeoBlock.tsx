import Link from "next/link";

import type { BrandFacet, BuyCityContext } from "@/lib/buy/catalog-helpers";

type CatalogSeoBlockProps = {
  city: BuyCityContext;
  brands: BrandFacet[];
  popularModels?: Array<{ label: string; slug?: string }>;
  stateCities?: Array<{ name: string; slug: string }>;
};

type SeoColumn = {
  title: string;
  intro?: string;
  items: Array<{ label: string; href?: string }>;
};

function buildColumns(city: BuyCityContext, data: CatalogSeoBlockProps): SeoColumn[] {
  const brandLinks = (data.brands || []).slice(0, 6).map((b) => ({
    label: b.brand,
    href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&brand=${encodeURIComponent(b.brand)}`,
  }));

  const fallbackBrands = ["Volkswagen", "Chevrolet", "Fiat", "Hyundai", "Toyota", "Honda"];
  const brandItems =
    brandLinks.length > 0
      ? brandLinks
      : fallbackBrands.map((brand) => ({
          label: brand,
          href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&brand=${encodeURIComponent(brand)}`,
        }));

  const modelItems =
    data.popularModels && data.popularModels.length > 0
      ? data.popularModels.map((m) => ({
          label: m.label,
          href: m.slug || `/comprar?city_slug=${encodeURIComponent(city.slug)}&model=${encodeURIComponent(m.label)}`,
        }))
      : [
          { label: "Volkswagen T-Cross", slug: "Volkswagen T-Cross" },
          { label: "Honda Civic", slug: "Honda Civic" },
          { label: "Toyota Corolla", slug: "Toyota Corolla" },
          { label: "Hyundai HB20", slug: "Hyundai HB20" },
          { label: "Jeep Compass", slug: "Jeep Compass" },
        ].map((item) => ({
          label: item.label,
          href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&q=${encodeURIComponent(item.slug)}`,
        }));

  const cityItems =
    data.stateCities && data.stateCities.length > 0
      ? data.stateCities.slice(0, 6).map((c) => ({
          label: c.name,
          href: `/cidade/${encodeURIComponent(c.slug)}`,
        }))
      : [
          { label: "São Paulo", slug: "sao-paulo-sp" },
          { label: "Campinas", slug: "campinas-sp" },
          { label: "Santos", slug: "santos-sp" },
          { label: "Ribeirão Preto", slug: "ribeirao-preto-sp" },
          { label: "São José dos Campos", slug: "sao-jose-dos-campos-sp" },
          { label: "Sorocaba", slug: "sorocaba-sp" },
        ].map((item) => ({
          label: item.label,
          href: `/cidade/${encodeURIComponent(item.slug)}`,
        }));

  return [
    {
      title: "Você vai encontrar",
      intro: `Anúncios verificados de carros seminovos e usados em ${city.name}, com contexto local em cada oferta.`,
      items: brandItems,
    },
    {
      title: "Modelos populares",
      intro: `Os modelos mais buscados por quem compra em ${city.name}.`,
      items: modelItems,
    },
    {
      title: "Top cidades do estado",
      intro: `Principais polos de oferta em ${city.state} — navegue pelo catálogo regional.`,
      items: cityItems,
    },
    {
      title: "Tipos de veículos",
      intro: "Filtre o catálogo pela carroceria que faz sentido pra você.",
      items: [
        { label: "SUV", href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&body_type=SUV` },
        { label: "Sedã", href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&body_type=Sedan` },
        { label: "Hatch", href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&body_type=Hatch` },
        { label: "Picape", href: `/comprar?city_slug=${encodeURIComponent(city.slug)}&body_type=Picape` },
      ],
    },
    {
      title: "Serviços para você",
      intro: "Ferramentas que ajudam na decisão de compra e na negociação.",
      items: [
        { label: "Simulador de financiamento", href: "/simulador-financiamento" },
        { label: "Tabela FIPE", href: "/tabela-fipe" },
        { label: "Dicas de segurança", href: "/seguranca" },
        { label: "Central de ajuda", href: "/ajuda" },
      ],
    },
  ];
}

export function CatalogSeoBlock(props: CatalogSeoBlockProps) {
  const { city } = props;
  const columns = buildColumns(city, props);

  return (
    <section
      aria-labelledby="catalog-seo-title"
      className="border-t border-slate-200/80 bg-white"
    >
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-14 lg:px-8">
        <header className="mb-8 max-w-3xl">
          <h2
            id="catalog-seo-title"
            className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900 md:text-[26px]"
          >
            Comprar carros usados em {city.name} é fácil e seguro
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            O Carros na Cidade é o portal regional para quem compra e vende veículos em {city.name} e
            nas principais cidades de {city.state}. Aqui você encontra ofertas atualizadas, filtros
            inteligentes por território e contexto local em cada anúncio — tudo para você negociar
            com segurança e decidir com informação.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-slate-900">
                {col.title}
              </h3>
              {col.intro ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">{col.intro}</p>
              ) : null}
              <ul className="mt-3 space-y-1.5">
                {col.items.map((item) => (
                  <li key={`${col.title}-${item.label}`} className="text-[13.5px] leading-relaxed">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="font-medium text-slate-700 transition hover:text-blue-700"
                      >
                        {item.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-600">{item.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
