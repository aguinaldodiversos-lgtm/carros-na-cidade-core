// frontend/app/page.tsx
import { HomePageClient } from "../components/home/HomePageClient";
import { fetchPublicHomeData } from "../lib/home/public-home";

export const dynamic = "force-dynamic"; // não prerender no build
export const revalidate = 300; // cache no runtime (ISR-like)

function fallbackHomeData() {
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
  try {
    const data = await fetchPublicHomeData();
    return <HomePageClient data={data} />;
  } catch {
    // fallback para não quebrar build nem runtime se API oscilar
    return <HomePageClient data={fallbackHomeData()} />;
  }
}
