import { HomePageClient } from "../components/home/HomePageClient";
import { fetchPublicHomeData } from "../lib/home/public-home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await fetchPublicHomeData();
  return <HomePageClient data={data} />;
}
