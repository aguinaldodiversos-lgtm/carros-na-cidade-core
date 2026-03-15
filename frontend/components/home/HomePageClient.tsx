// frontend/components/home/HomePageClient.tsx
import Link from "next/link";
import { HeroCarousel } from "@/components/home/HeroCarousel";
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
}

type HeroSlide = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
};

const HERO_SLIDES: HeroSlide[] = [
  {
    id: "main",
    image: "/images/hero.jpeg",
    title: "Encontre seu próximo carro em São Paulo",
    subtitle: "Milhares de ofertas esperando por você",
    ctaLabel: "Pesquisar agora",
    href: "/comprar",
  },
  {
    id: "banner-home",
    image: "/images/hero.jpeg",
    title: "Encontre e venda seu carro na sua cidade",
    subtitle: "Anuncie grátis, fácil e rápido em um portal feito para o mercado local",
    ctaLabel: "Começar meu anúncio",
    href: "/planos",
  },
  {
    id: "banner-otimizado",
    image: "/images/hero.jpeg",
    title: "Milhares de oportunidades na sua cidade",
    subtitle: "Compre, venda e negocie com quem está perto de você",
    ctaLabel: "Explorar ofertas",
    href: "/comprar",
  },
];

function resolveCurrentCityName(featuredCities: FeaturedCity[]) {
  return featuredCities?.[0]?.name || "São Paulo";
}

function normalizeCityLabel(item?: Pick<HomeAdItem, "city" | "state">) {
  const city = item?.city || "São Paulo";
  const state = item?.state || "SP";
  return `${city} - ${state}`;
}

export function HomePageClient({ data }: HomePageClientProps) {
  const currentCity = resolveCurrentCityName(data.featuredCities || []);

  const highlightAds = (data.highlightAds || []).slice(0, 4);
  const opportunityAds = (data.opportunityAds || []).slice(0, 4);

  return (
    <main className="bg-[#f2f3f7]">
      <section className="mx-auto w-full max-w-7xl px-4 pb-3 pt-4 sm:px-6">
        <HeroCarousel slides={HERO_SLIDES} />
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
        <HomeSearchSection featuredCities={data.featuredCities || []} />
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-2 sm:px-6">
        <div className="mb-5">
          <h2 className="text-[28px] font-extrabold leading-tight text-[#1b2436] sm:text-[40px] md:text-[42px]" />
          <h2 className="text-[24px] font-extrabold leading-tight text-[#1b2436] md:text-[30px]">
            Destaques em {currentCity}
          </h2>
          <p className="mt-1 text-[15px] text-[#6a7388]">
            Veículos patrocinados com maior visibilidade
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {highlightAds.length > 0 ? (
            highlightAds.map((item, index) => (
              <HomeVehicleCard
                key={`highlight-${item.id}-${index}`}
                item={item}
                variant="highlight"
              />
            ))
          ) : (
            Array.from({ length: 4 }).map((_, index) => (
              <HomeVehicleCard
                key={`highlight-fallback-${index}`}
                item={{
                  id: `highlight-fallback-${index}`,
                  title: `Veículo em destaque ${index + 1}`,
                  city: currentCity,
                  state: "SP",
                  price: 0,
                  image_url: "/images/hero.jpeg",
                  highlight_until: new Date().toISOString(),
                }}
                variant="highlight"
              />
            ))
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-5">
          <h2 className="text-[24px] font-extrabold leading-tight text-[#1b2436] md:text-[30px]">
            Oportunidades abaixo da FIPE
          </h2>
          <p className="mt-1 text-[15px] text-[#6a7388]">
            Ofertas com preço abaixo do valor de mercado
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {opportunityAds.length > 0 ? (
            opportunityAds.map((item, index) => (
              <HomeVehicleCard
                key={`opportunity-${item.id}-${index}`}
                item={item}
                variant="opportunity"
              />
            ))
          ) : (
            Array.from({ length: 4 }).map((_, index) => (
              <HomeVehicleCard
                key={`opportunity-fallback-${index}`}
                item={{
                  id: `opportunity-fallback-${index}`,
                  title: `Oportunidade ${index + 1}`,
                  city: currentCity,
                  state: "SP",
                  price: 0,
                  image_url: "/images/hero.jpeg",
                  below_fipe: true,
                }}
                variant="opportunity"
              />
            ))
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[20px] border border-[#e1e6f0] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(16,28,58,0.05)]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 3l7 3v5c0 5-3.3 8.8-7 10-3.7-1.2-7-5-7-10V6l7-3Z" />
                <path d="m9.5 12 1.7 1.7 3.6-3.9" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Compra segura</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Negocie direto com vendedores verificados
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e1e6f0] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(16,28,58,0.05)]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z" />
                <path d="M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Foco na sua cidade</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Ofertas locais, praticidade e relevância territorial
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e1e6f0] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(16,28,58,0.05)]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 7h16M7 4v6M17 4v6M5 11h14v8H5z" />
                <path d="M8 15h8M8 18h5" />
              </svg>
            </div>
            <h3 className="text-[18px] font-extrabold text-[#1f2940]">Transparência de preço</h3>
            <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
              Planos, comparação com FIPE e leitura clara das ofertas
            </p>
          </div>

          <div className="rounded-[20px] border border-[#e1e6f0] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(16,28,58,0.05)]">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4ff] text-[#0e62d8]">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9">
                <path d="M4 14 10 8l4 4 6-6" />
                <path d="M20 10V4h-6" />
              </svg>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[18px] font-extrabold text-[#1f2940]">Venda rápida</h3>
                <p className="mt-2 text-[15px] leading-6 text-[#6a7388]">
                  Anuncie em minutos e ganhe destaque local
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
