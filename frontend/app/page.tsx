// frontend/app/page.tsx

import { fetchHomeData } from "@/lib/api";
import HeroCarousel from "@/components/HeroCarousel";
import FiltersBar from "@/components/FiltersBar";
import AdsCarousel from "@/components/AdsCarousel";
import PersuasiveSection from "@/components/PersuasiveSection";

export default async function HomePage() {
  const data = await fetchHomeData();

  return (
    <main className="bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto px-6 pt-10">
        <HeroCarousel />
      </div>

      <FiltersBar />

      <AdsCarousel
        title="Melhores ofertas da sua cidade"
        ads={data.recentAds}
      />

      <AdsCarousel
        title="Destaques da semana"
        ads={data.recentAds}
      />

      <PersuasiveSection />
    </main>
  );
}
