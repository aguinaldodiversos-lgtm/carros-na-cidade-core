// frontend/app/page.tsx
import { HomePageClient } from "@/components/home/HomePageClient";
import { fetchPublicHomeData } from "@/lib/home/public-home";

export const revalidate = 300;

export default async function HomePage() {
  const data = await fetchPublicHomeData();
  return <HomePageClient data={data} />;
}
