import type { Metadata } from "next";
import BuyCarsGrid from "@/components/buy/BuyCarsGrid";
import BuyFiltersSidebar from "@/components/buy/BuyFiltersSidebar";
import BuyHeaderPanel from "@/components/buy/BuyHeaderPanel";
import BuyResultsToolbar from "@/components/buy/BuyResultsToolbar";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import { buyCars } from "@/lib/car-data";

export const metadata: Metadata = {
  title: "Comprar",
  description: "Pagina de busca com filtros rapidos e listagem de carros em Sao Paulo.",
};

export default function ComprarPage() {
  return (
    <>
      <Header />
      <BuyHeaderPanel />

      <main className="mx-auto grid w-full max-w-[1240px] gap-4 px-6 py-6 lg:grid-cols-[308px_1fr]">
        <BuyFiltersSidebar />
        <section className="space-y-4">
          <BuyResultsToolbar />
          <BuyCarsGrid cars={buyCars} />
        </section>
      </main>

      <Footer />
    </>
  );
}
