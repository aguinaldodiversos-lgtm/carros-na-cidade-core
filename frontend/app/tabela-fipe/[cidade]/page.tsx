import type { Metadata } from "next";
import CTASection from "@/components/common/CTASection";
import FAQSection from "@/components/common/FAQSection";
import StatsSection from "@/components/common/StatsSection";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import { getAIFipeInsights, getAIFipeStats } from "@/services/aiService";
import {
  getCityProfile,
  getFipeFaqByCity,
  getStaticCitySlugs,
  getVehiclesByCity,
} from "@/services/marketService";

type PageProps = {
  params: { cidade: string };
};

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  return getStaticCitySlugs(120).map((cidade) => ({ cidade }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = getCityProfile(params.cidade);

  return {
    title: `Tabela FIPE em ${city.name} ${city.uf}`,
    description: `Consulte a Tabela FIPE em ${city.name} e compare valores para comprar e vender carros com seguranca.`,
    keywords: [
      `tabela fipe ${city.name.toLowerCase()}`,
      `valor do carro em ${city.name.toLowerCase()}`,
      `preco fipe ${city.name.toLowerCase()}`,
    ],
    alternates: {
      canonical: `/tabela-fipe/${city.slug}`,
    },
    openGraph: {
      title: `Tabela FIPE em ${city.name} (${city.uf})`,
      description: `Descubra valores FIPE e oportunidades abaixo da tabela em ${city.name}.`,
      url: `/tabela-fipe/${city.slug}`,
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function TabelaFipeCityPage({ params }: PageProps) {
  const city = getCityProfile(params.cidade);
  const [stats, insights] = await Promise.all([
    getAIFipeStats(city.slug),
    getAIFipeInsights(city.slug),
  ]);
  const vehicles = getVehiclesByCity(city.slug, 8).filter((vehicle) => vehicle.badge === "fipe");
  const faq = getFipeFaqByCity(city.slug);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const automotiveSchema = {
    "@context": "https://schema.org",
    "@type": "AutomotiveBusiness",
    name: "Carros na Cidade",
    areaServed: city.displayName,
    url: `https://carrosnacidade.com/tabela-fipe/${city.slug}`,
    image: "https://carrosnacidade.com/images/logo.png",
    priceRange: "$$",
    serviceType: "Consulta Tabela FIPE",
  };

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <section className="overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0c4fb2_0%,#1382e7_100%)] p-8 text-white shadow-[0_12px_30px_rgba(15,74,168,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">SEO Programatico - FIPE</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-5xl">Tabela FIPE em {city.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/90 md:text-base">
            Consulte valor de referencia por tipo, marca, modelo e ano/combustivel. Compare com anuncios locais
            abaixo da FIPE e negocie com dados de mercado.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <h2 className="text-xl font-extrabold text-[#1d2538]">Consultar valor FIPE</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <select className="cnc-select text-base" defaultValue="Carro">
              <option>Carro</option>
              <option>Moto</option>
              <option>Caminhao</option>
            </select>
            <select className="cnc-select text-base" defaultValue="Marca">
              <option>Marca</option>
              <option>Toyota</option>
              <option>Honda</option>
              <option>Chevrolet</option>
            </select>
            <select className="cnc-select text-base" defaultValue="Modelo">
              <option>Modelo</option>
              <option>Corolla</option>
              <option>Civic</option>
              <option>Onix</option>
            </select>
            <select className="cnc-select text-base" defaultValue="Ano / Combustivel">
              <option>Ano / Combustivel</option>
              <option>2024 Flex</option>
              <option>2023 Gasolina</option>
              <option>2022 Diesel</option>
            </select>
            <button type="button" className="cnc-btn-primary h-12 justify-center text-[15px]">
              Consultar FIPE
            </button>
          </div>
        </section>

        <StatsSection
          title={`Estatisticas inteligentes para ${city.name}`}
          subtitle="Dados gerados pelo Cerebro IA para orientar preco, timing de compra e oportunidades locais."
          stats={stats}
        />

        <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <h2 className="text-2xl font-extrabold text-[#1d2538]">Insights IA por cidade</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {insights.map((insight) => (
              <li key={insight} className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4 text-sm text-[#4e5872]">
                {insight}
              </li>
            ))}
          </ul>
        </section>

        <VehicleCarousel
          title={`Veiculos abaixo da FIPE em ${city.name}`}
          subtitle="Anuncios ranqueados pelo Cerebro IA com maior diferenca positiva de preco."
          vehicles={vehicles}
        />

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            "Consulta de FIPE atualizada por cidade",
            "Comparativo com anuncios locais em tempo real",
            "Alertas de preco abaixo do mercado",
          ].map((benefit) => (
            <article key={benefit} className="rounded-xl border border-[#dfe4ef] bg-white p-4 shadow-[0_2px_14px_rgba(10,20,40,0.04)]">
              <h3 className="text-base font-extrabold text-[#1e273b]">{benefit}</h3>
              <p className="mt-2 text-sm text-[#52607b]">
                Estrutura orientada para SEO local e decisao de compra com dados por cidade.
              </p>
            </article>
          ))}
        </section>

        <FAQSection title={`Perguntas frequentes - Tabela FIPE em ${city.name}`} items={faq} />

        <CTASection
          title={`Quer vender ou comprar com mais margem em ${city.name}?`}
          description="Ative recomendacoes do Cerebro IA para encontrar anuncios com alta liquidez e preco competitivo."
          primaryLabel="Buscar veiculos agora"
          primaryHref="/anuncios"
          secondaryLabel="Abrir simulador"
          secondaryHref={`/simulador-financiamento/${city.slug}`}
        />
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(automotiveSchema) }} />
    </>
  );
}
