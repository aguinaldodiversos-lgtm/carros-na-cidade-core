// frontend/components/home/HomePageClient.tsx
import Link from "next/link";
import { HeroCarousel } from "@/components/home/HeroCarousel";
import { HomeSearchSection } from "@/components/search/HomeSearchSection";
import { HomeVehicleCard } from "@/components/home/HomeVehicleCard";
import {
  DEFAULT_PUBLIC_CITY_LABEL,
  DEFAULT_PUBLIC_CITY_SLUG,
  REGIONAL_BRAND_TAGLINE,
  REGIONAL_VALUE_PROPOSITION,
} from "@/lib/site/public-config";

type FeaturedCity = {
  id: number;
  name: string;
  slug: string;
  demand_score?: number;
};

type HomeAdItem = {
  id: number | string;
  slug?: string;
  title?: string;
  brand?: string;
  model?: string;
  year?: number | string;
  mileage?: number | string;
  city?: string;
  state?: string;
  price?: number | string;
  below_fipe?: boolean;
  highlight_until?: string | null;
  image_url?: string | null;
  images?: string[] | null;
};

type HomeStats = {
  total_ads?: number | string;
  total_cities?: number | string;
  total_advertisers?: number | string;
  total_users?: number | string;
};

interface HomePageClientProps {
  data: {
    featuredCities: FeaturedCity[];
    highlightAds: HomeAdItem[];
    opportunityAds: HomeAdItem[];
    recentAds?: HomeAdItem[];
    stats: HomeStats;
  };
  /** Território ativo (cookie / query / City Engine) */
  activeCitySlug: string;
  activeCityName: string;
}

type HeroSlide = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
};

function buildHeroSlides(cityName: string, citySlug: string): HeroSlide[] {
  const catalogHref = `/comprar?city_slug=${encodeURIComponent(citySlug)}`;

  return [
    {
      id: "main",
      image: "/images/hero.jpeg",
      title: `Seu próximo carro em ${cityName}`,
      subtitle:
        "O catálogo é regional: você escolhe a cidade e negocia com contexto de preço e deslocamento reais.",
      ctaLabel: `Ver carros em ${cityName}`,
      href: catalogHref,
    },
    {
      id: "banner-home",
      image: "/images/hero.jpeg",
      title: "Venda com presença na região",
      subtitle:
        "Planos para lojistas e particulares que querem ser vistos onde o carro circula — na cidade certa.",
      ctaLabel: "Conhecer planos",
      href: "/planos",
    },
    {
      id: "banner-otimizado",
      image: "/images/hero.jpeg",
      title: `Oportunidades em ${cityName} e arredores`,
      subtitle: "De seminovos a usados, com filtros que respeitam o território que você escolheu.",
      ctaLabel: "Explorar ofertas",
      href: catalogHref,
    },
  ];
}

function resolveCurrentCityName(featuredCities: FeaturedCity[]) {
  return featuredCities?.[0]?.name || DEFAULT_PUBLIC_CITY_LABEL;
}

function resolveCurrentCitySlug(featuredCities: FeaturedCity[]) {
  return featuredCities?.[0]?.slug || DEFAULT_PUBLIC_CITY_SLUG;
}

function normalizeCityLabel(item?: Pick<HomeAdItem, "city" | "state">) {
  const city = item?.city || "São Paulo";
  const state = item?.state || "SP";
  return `${city} - ${state}`;
}

export function HomePageClient({ data, activeCitySlug, activeCityName }: HomePageClientProps) {
  const currentCity = activeCityName || resolveCurrentCityName(data.featuredCities || []);
  const currentCitySlug = activeCitySlug || resolveCurrentCitySlug(data.featuredCities || []);
  const heroSlides = buildHeroSlides(currentCity, currentCitySlug);

  const highlightAll = (data.highlightAds || []).slice(0, 12);
  const highlightTop = highlightAll.slice(0, 4);
  const highlightCarousel = highlightAll.slice(4);
  const opportunityAds = (data.opportunityAds || []).slice(0, 4);

  return (
    <main className="bg-[#f2f3f7]">
      <section className="mx-auto w-full max-w-7xl px-4 pb-3 pt-5 sm:px-6 sm:pt-6 xl:px-8">
        <p className="mb-3 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-[#0e62d8] md:text-left">
          {REGIONAL_BRAND_TAGLINE}
        </p>
        <HeroCarousel slides={heroSlides} />
      </section>

      <section className="cnc-stack-section mx-auto w-full max-w-7xl px-4 sm:px-6 xl:px-8">
        <div className="mb-6 max-w-3xl">
          <h2 className="text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[#1b2436] md:text-[28px]">
            Busque pelo território, depois pelo carro
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6a7388]">
            {REGIONAL_VALUE_PROPOSITION}
          </p>
        </div>
        <HomeSearchSection
          featuredCities={data.featuredCities || []}
          defaultCitySlug={currentCitySlug}
          defaultCityLabel={currentCity}
        />
      </section>

      <section className="cnc-stack-section mx-auto w-full max-w-7xl px-4 sm:px-6 xl:px-8">
        <div className="mb-6">
          <h2 className="text-[24px] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#1b2436] md:text-[30px]">
            Em destaque em {currentCity}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6a7388]">
            Anúncios com mais visibilidade na região — para quem quer ver o carro antes de fechar
          </p>
        </div>

        {highlightTop.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {highlightTop.map((item, index) => (
                <HomeVehicleCard
                  key={`highlight-${item.id}-${index}`}
                  item={item}
                  variant="highlight"
                />
              ))}
            </div>
            {highlightCarousel.length > 0 ? (
              <div className="mt-6">
                <p className="mb-3 text-[14px] font-semibold text-[#5f6982]">
                  Mais anúncios em destaque na região
                </p>
                <div className="-mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-3 [scrollbar-width:thin] touch-pan-x md:gap-5">
                  {highlightCarousel.map((item, index) => (
                    <div
                      key={`highlight-strip-${item.id}-${index}`}
                      className="w-[min(280px,82vw)] shrink-0 snap-start sm:w-[260px]"
                    >
                      <HomeVehicleCard item={item} variant="highlight" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="cnc-empty-state">
            <p className="cnc-empty-state__title">Nenhum destaque no momento</p>
            <p className="cnc-empty-state__desc">
              Quando houver veículos em destaque na sua região, eles aparecerão nesta área.
            </p>
            <Link
              href={`/comprar?city_slug=${encodeURIComponent(currentCitySlug)}`}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              Ver catálogo em {currentCity}
            </Link>
          </div>
        )}
      </section>

      <section className="cnc-stack-section mx-auto w-full max-w-7xl px-4 sm:px-6 xl:px-8">
        <div className="mb-6">
          <h2 className="text-[24px] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#1b2436] md:text-[30px]">
            Abaixo da FIPE na sua região
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6a7388]">
            Ofertas com preço atrativo frente à referência — sempre com cidade e estado no contexto
          </p>
        </div>

        {opportunityAds.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {opportunityAds.map((item, index) => (
              <HomeVehicleCard
                key={`opportunity-${item.id}-${index}`}
                item={item}
                variant="opportunity"
              />
            ))}
          </div>
        ) : (
          <div className="cnc-empty-state">
            <p className="cnc-empty-state__title">Nenhuma oportunidade abaixo da FIPE agora</p>
            <p className="cnc-empty-state__desc">
              Explore o catálogo ou ajuste filtros para encontrar o melhor negócio na sua região.
            </p>
            <Link
              href={`/comprar?city_slug=${encodeURIComponent(currentCitySlug)}&below_fipe=true`}
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              Buscar abaixo da FIPE na região
            </Link>
          </div>
        )}
      </section>

      <section className="cnc-stack-section mx-auto w-full max-w-7xl px-4 sm:px-6 xl:px-8">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 md:gap-5">
          <div className="rounded-[22px] border border-[#e6eaf2] bg-white px-5 py-6 shadow-[0_8px_28px_rgba(16,28,58,0.06)] md:px-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M12 3l7 3v5c0 5-3.3 8.8-7 10-3.7-1.2-7-5-7-10V6l7-3Z" />
                <path d="m9.5 12 1.7 1.7 3.6-3.9" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Negociação consciente</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Dicas e rotas para visitar o carro e conferir documentação antes de pagar
            </p>
          </div>

          <div className="rounded-[22px] border border-[#e6eaf2] bg-white px-5 py-6 shadow-[0_8px_28px_rgba(16,28,58,0.06)] md:px-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
                <path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Cidade como eixo</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Listagens e filtros pensados para o território que você escolheu — não um mapa
              genérico do país
            </p>
          </div>

          <div className="rounded-[22px] border border-[#e6eaf2] bg-white px-5 py-6 shadow-[0_8px_28px_rgba(16,28,58,0.06)] md:px-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M4 7h16M7 4v6M17 4v6M5 11h14v8H5z" />
                <path d="M8 15h8M8 18h5" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Preço com contexto</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Referência FIPE e leitura clara do anúncio para comparar com o que roda na sua região
            </p>
          </div>

          <div className="rounded-[22px] border border-[#e6eaf2] bg-white px-5 py-6 shadow-[0_8px_28px_rgba(16,28,58,0.06)] md:px-6">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M4 14 10 8l4 4 6-6" />
                <path d="M20 10V4h-6" />
              </svg>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-extrabold text-[#1f2940]">
                  Visibilidade na região
                </h3>
                <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
                  Publique com cidade e estado corretos e chegue a quem realmente pode ver o carro
                </p>
              </div>
              <Link
                href="/planos"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
              >
                Criar anúncio
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
