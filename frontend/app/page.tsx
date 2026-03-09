// frontend/app/page.tsx
import { HomePageClient } from "../components/home/HomePageClient";
import { fetchPublicHomeData } from "../lib/home/public-home";
import type { HomeDataResponse } from "../lib/home/public-home";

// ✅ Evita o Next tentar gerar HTML estático no build (onde fetch pode falhar)
export const dynamic = "force-dynamic";
export const revalidate = 0;

type HomeData = HomeDataResponse["data"];

function getFallbackHomeData(): HomeData {
  return {
    featuredCities: [],
    highlightAds: [],
    opportunityAds: [],
    recentAds: [],
    stats: {
      total_ads: "0",
      total_cities: "0",
      total_advertisers: "0",
      total_users: "0",
    },
  };
}

export default async function HomePage() {
  let data: HomeData;

  try {
    data = await fetchPublicHomeData();
  } catch (err) {
    // Não derruba build/deploy se API estiver off
    console.error("[home] fetchPublicHomeData failed:", err);
    data = getFallbackHomeData();
  }

  return <HomePageClient data={data} />;
}
