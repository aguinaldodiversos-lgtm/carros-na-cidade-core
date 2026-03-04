import type { Metadata } from "next";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import BenefitsSection from "@/components/home/BenefitsSection";
import FeaturedSection from "@/components/home/FeaturedSection";
import FiltersBar from "@/components/home/FiltersBar";
import Hero from "@/components/home/Hero";
import { homeDeals, homeHighlights, type HomeCar } from "@/lib/car-data";
import { getRedisClient } from "@/lib/redis";

export const metadata: Metadata = {
  title: "Home",
  description: "Encontre seu proximo carro com filtros rapidos e ofertas em destaque.",
};

type HomeData = {
  deals: HomeCar[];
  highlights: HomeCar[];
};

async function getHomeData(): Promise<HomeData> {
  const data: HomeData = {
    deals: homeDeals,
    highlights: homeHighlights,
  };
  const cacheKey = "home:data";
  const redis = getRedisClient();

  if (!redis) {
    return data;
  }

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as HomeData;
    }
  } catch {
    return data;
  }

  try {
    await redis.set(cacheKey, JSON.stringify(data), "EX", 60);
  } catch {
    return data;
  }

  return data;
}

export default async function HomePage() {
  const data = await getHomeData();

  return (
    <>
      <Header boxed />

      <main className="pb-2">
        <div className="mx-auto w-full max-w-[1240px] px-6">
          <Hero />
          <FiltersBar />
          <FeaturedSection
            title="Destaques em Sao Paulo"
            subtitle="Veiculos patrocinados com maior visibilidade"
            cars={data.highlights}
          />
          <FeaturedSection
            title="Oportunidades abaixo da FIPE"
            subtitle="Ofertas com preco abaixo do valor de mercado"
            cars={data.deals}
          />
          <BenefitsSection />
        </div>
      </main>

      <Footer />
    </>
  );
}
