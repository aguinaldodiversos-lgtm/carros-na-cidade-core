// frontend/components/home/HomePageClient.tsx
import Link from "next/link";
import { HeroCarousel, type HeroSlide } from "@/components/home/HeroCarousel";
import { HomeSearchSection } from "@/components/search/HomeSearchSection";
import { HomeVehicleCard } from "@/components/home/HomeVehicleCard";

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
  activeCitySlug: string;
  activeCityName: string;
}

function buildHeroSlides(cityName: string, _citySlug: string): HeroSlide[] {
  return [
    {
      id: "find-car",
      image: "/images/home-banner-1.png",
      title: `Encontre seu próximo carro em ${cityName}`,
      subtitle: "Milhares de ofertas esperando por você",
      ctaLabel: "Pesquisar agora",
      href: "#home-quick-search",
    },
    {
      id: "sell-fast",
      image: "/images/home-banner-2.png",
      title: "Anuncie seu carro grátis e venda rápido!",
      subtitle: "Venda fácil para sua cidade. Fale direto com compradores.",
      ctaLabel: "Anunciar grátis",
      href: "/anunciar",
    },
  ];
}

function resolveCurrentCityName(featuredCities: FeaturedCity[], activeName: string) {
  if (activeName?.trim()) return activeName.trim();
  return featuredCities?.[0]?.name || "São Paulo";
}

function resolveCurrentCitySlug(featuredCities: FeaturedCity[], activeSlug: string) {
  if (activeSlug?.trim()) return activeSlug.trim();
  return featuredCities?.[0]?.slug || "sao-paulo";
}

export function HomePageClient({ data, activeCitySlug, activeCityName }: HomePageClientProps) {
  const currentCity = resolveCurrentCityName(data.featuredCities || [], activeCityName);
  const currentCitySlug = resolveCurrentCitySlug(data.featuredCities || [], activeCitySlug);
  const heroSlides = buildHeroSlides(currentCity, currentCitySlug);

  const highlightTop = (data.highlightAds || []).slice(0, 4);
  const opportunityAds = (data.opportunityAds || []).slice(0, 4);

  return (
    <div className="bg-[#f0f2f6]">
      <section className="relative mx-auto w-full max-w-7xl px-4 pb-2 pt-4 sm:px-6 sm:pt-5 xl:px-8">
        <HeroCarousel slides={heroSlides} />

        <div className="relative z-20 px-0 sm:px-0">
          <HomeSearchSection
            featuredCities={data.featuredCities || []}
            defaultCitySlug={currentCitySlug}
            defaultCityLabel={currentCity}
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-12 xl:px-8">
        <div className="mb-6 text-center md:text-left">
          <h2 className="text-[22px] font-extrabold tracking-tight text-[#1b2436] md:text-[28px]">
            Destaques em {currentCity}
          </h2>
          <p className="mt-2 text-[15px] text-[#6a7388]">
            Veículos patrocinados com maior visibilidade
          </p>
        </div>

        {highlightTop.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {highlightTop.map((item, index) => (
              <HomeVehicleCard
                key={`highlight-${item.id}-${index}`}
                item={item}
                variant="highlight"
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#cfd6e6] bg-white/80 px-6 py-12 text-center">
            <p className="text-[16px] font-semibold text-[#4e5a73]">Nenhum destaque no momento</p>
            <p className="mt-2 text-[14px] text-[#6a7388]">
              Quando houver veículos em destaque na região, eles aparecerão aqui.
            </p>
            <Link
              href={`/comprar?city_slug=${encodeURIComponent(currentCitySlug)}`}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-sm font-bold text-white hover:bg-[#0c4fb0]"
            >
              Ver ofertas em {currentCity}
            </Link>
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-12 xl:px-8">
        <div className="mb-6 text-center md:text-left">
          <h2 className="text-[22px] font-extrabold tracking-tight text-[#1b2436] md:text-[28px]">
            Oportunidades abaixo da FIPE
          </h2>
          <p className="mt-2 text-[15px] text-[#6a7388]">
            Ofertas com preço abaixo do valor de mercado
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
          <div className="rounded-2xl border border-dashed border-[#cfd6e6] bg-white/80 px-6 py-12 text-center">
            <p className="text-[16px] font-semibold text-[#4e5a73]">
              Nenhuma oportunidade abaixo da FIPE agora
            </p>
            <p className="mt-2 text-[14px] text-[#6a7388]">
              Explore o catálogo com filtro de oportunidades na sua região.
            </p>
            <Link
              href={`/comprar?city_slug=${encodeURIComponent(currentCitySlug)}&below_fipe=true`}
              className="mt-6 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#0e62d8] px-6 text-sm font-bold text-white hover:bg-[#0c4fb0]"
            >
              Buscar abaixo da FIPE
            </Link>
          </div>
        )}
      </section>

      <section className="border-t border-[#e4e8f0] bg-[#e8ebf2] py-10 sm:py-12">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:gap-5 xl:px-8">
          <div className="rounded-[14px] border border-white/60 bg-white px-4 py-5 shadow-sm sm:px-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3l7 3v5c0 5-3.3 8.8-7 10-3.7-1.2-7-5-7-10V6l7-3Z" />
                <path d="m9.5 12 1.7 1.7 3.6-3.9" />
              </svg>
            </div>
            <h3 className="text-[17px] font-extrabold text-[#1f2940]">Compra segura</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#5f6982]">
              Negocie com informação clara e verificação antes de fechar o negócio.
            </p>
          </div>

          <div className="rounded-[14px] border border-white/60 bg-white px-4 py-5 shadow-sm sm:px-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
                <path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </div>
            <h3 className="text-[17px] font-extrabold text-[#1f2940]">Foco na sua cidade</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#5f6982]">
              Listagens e filtros pensados para o território que você escolheu.
            </p>
          </div>

          <div className="rounded-[14px] border border-white/60 bg-white px-4 py-5 shadow-sm sm:px-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16M7 4v6M17 4v6M5 11h14v8H5z" />
                <path d="M8 15h8M8 18h5" />
              </svg>
            </div>
            <h3 className="text-[17px] font-extrabold text-[#1f2940]">Transparência de preço</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#5f6982]">
              Referência FIPE e leitura clara para comparar com o mercado local.
            </p>
          </div>

          <div className="flex flex-col rounded-[14px] border border-white/60 bg-white px-4 py-5 shadow-sm sm:px-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 11h3l2-6h8l2 6h3v2h-2l-1 9H6l-1-9H3z" />
                <path d="M10 19a2 2 0 1 0 4 0" />
              </svg>
            </div>
            <h3 className="text-[17px] font-extrabold text-[#1f2940]">Venda rápida</h3>
            <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#5f6982]">
              Publique com cidade correta e chegue a quem pode ver o carro.
            </p>
            <Link
              href="/anunciar/novo"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-[10px] bg-[#0e62d8] px-4 text-sm font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              Criar anúncio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
