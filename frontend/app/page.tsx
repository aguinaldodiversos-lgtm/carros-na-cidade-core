// frontend/app/page.tsx
import { HomePageClient } from "../components/home/HomePageClient";
import { fetchPublicHomeData } from "../lib/home/public-home";

// ✅ evita build quebrar por fetch durante prerender/export
export const dynamic = "force-dynamic";
// (alternativa: export const revalidate = 60; se quiser cache; mas force-dynamic é mais seguro agora)
export const revalidate = 0;

function emptyHomeData() {
  // Fallback defensivo: mantenha o shape mínimo que o HomePageClient espera.
  // Se você souber exatamente o shape, substitua por ele aqui.
  return {
    hero: [],
    highlights: [],
    opportunities: [],
    latest: [],
    stats: null,
    meta: { degraded: true },
  } as any;
}

export default async function HomePage() {
  try {
    const data = await fetchPublicHomeData();
    return <HomePageClient data={data} />;
  } catch (err) {
    // log server-side sem “quebrar deploy”
    console.error("[home] fetchPublicHomeData failed:", err);
    return <HomePageClient data={emptyHomeData()} />;
  }
}
