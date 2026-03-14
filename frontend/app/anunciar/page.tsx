import SellPageClient from "@/components/sell/SellPageClient";
import { getSellPageContent } from "@/lib/sell/sell-page";

export const revalidate = 60;

export default async function AnunciarPage() {
  const content = await getSellPageContent();

  return <SellPageClient content={content} />;
}
