import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import CTASection from "@/components/common/CTASection";
import FinancingSimulator from "@/components/common/FinancingSimulator";
import PageBreadcrumbs from "@/components/common/PageBreadcrumbs";
import StatsSection from "@/components/common/StatsSection";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import { getAIFinancingInsights, getAIFinancingStats } from "@/services/aiService";
import {
  getCityProfile,
  getStaticCitySlugs,
  getVehiclesByCity,
  isSupportedCitySlug,
} from "@/services/marketService";

type PageProps = {
  params: { cidade: string };
};

export const revalidate = 3600;
export const dynamicParams = false;

export async function generateStaticParams() {
  return getStaticCitySlugs(120).map((cidade) => ({ cidade }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!isSupportedCitySlug(params.cidade)) {
    notFound();
  }

  const city = getCityProfile(params.cidade);

  return {
    title: `Simulador de financiamento em ${city.name} ${city.uf}`,
    description: `Simule parcela de carro em ${city.name}, compare compra a vista vs financiamento e veja custo efetivo.`,
    keywords: [
      `financiamento carro ${city.name.toLowerCase()}`,
      `parcela carro ${city.name.toLowerCase()}`,
      `simulador financiamento ${city.name.toLowerCase()}`,
    ],
    alternates: {
      canonical: `/simulador-financiamento/${city.slug}`,
    },
    openGraph: {
      title: `Simulador de financiamento em ${city.name}`,
      description: `Calcule parcela, juros e total pago para financiamento de veiculos em ${city.name}.`,
      url: `/simulador-financiamento/${city.slug}`,
      locale: "pt_BR",
      type: "website",
    },
  };
}

export default async function SimuladorFinanciamentoCityPage({ params }: PageProps) {
  if (!isSupportedCitySlug(params.cidade)) {
    notFound();
  }

  const city = getCityProfile(params.cidade);
  const [stats, insights] = await Promise.all([
    getAIFinancingStats(city.slug),
    getAIFinancingInsights(city.slug),
  ]);
  const vehicles = getVehiclesByCity(city.slug, 8);

  const financialSchema = {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `Simulador de financiamento de veiculos em ${city.name}`,
    provider: {
      "@type": "Organization",
      name: "Carros na Cidade",
      url: "https://carrosnacidade.com",
    },
    areaServed: city.displayName,
    category: "Auto Loan",
    description:
      "Ferramenta para simular parcela, custo efetivo e total pago no financiamento de carros por cidade.",
  };
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Simulador", href: "/simulador-financiamento" },
    { name: city.displayName },
  ];
  const pageSchema = buildWebPageJsonLd({
    title: `Simulador de financiamento em ${city.name}`,
    description: `Calcule parcela, juros, entrada e custo efetivo para comprar veículos em ${city.name}.`,
    path: `/simulador-financiamento/${city.slug}`,
    type: "WebPage",
    about: `Financiamento automotivo em ${city.name}`,
  });

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <PageBreadcrumbs items={breadcrumbItems} className="mb-4" />
        <section className="overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0c4fb2_0%,#1382e7_100%)] p-8 text-white shadow-[0_12px_30px_rgba(15,74,168,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">SEO Programatico - Financiamento</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-5xl">
            Simulador de financiamento em {city.name}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-white/90 md:text-base">
            Descubra a parcela ideal, compare cenarios e estime custo efetivo para comprar seu proximo carro em{" "}
            {city.name}.
          </p>
        </section>

        <FinancingSimulator cityLabel={city.name} />

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: `Ver anúncios em ${city.name}`,
              description: "Leve a simulação para o catálogo local com filtros por cidade e intenção de compra.",
              href: `/anuncios?city_slug=${city.slug}`,
            },
            {
              title: "Comparar com a FIPE",
              description: "Cruze parcela, entrada e referência de preço antes de fechar negócio.",
              href: `/tabela-fipe/${city.slug}`,
            },
            {
              title: "Ler o blog local",
              description: "Aprofunde o contexto regional antes de decidir o melhor momento de compra.",
              href: `/blog/${city.slug}`,
            },
            {
              title: "Oportunidades da cidade",
              description: "Explore páginas territoriais com ofertas abaixo da FIPE e maior aderência local.",
              href: `/cidade/${city.slug}/oportunidades`,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(10,20,40,0.08)]"
            >
              <h3 className="text-lg font-extrabold text-[#1d2538]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#52607b]">{item.description}</p>
            </Link>
          ))}
        </section>

        <StatsSection
          title={`Panorama de financiamento em ${city.name}`}
          subtitle="Metricas locais produzidas pelo Cerebro IA para apoiar sua tomada de decisao."
          stats={stats}
        />

        <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
          <h2 className="text-2xl font-extrabold text-[#1d2538]">Insights IA sobre perfil de compra local</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {insights.map((insight) => (
              <li key={insight} className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-4 text-sm text-[#4e5872]">
                {insight}
              </li>
            ))}
          </ul>
        </section>

        <VehicleCarousel
          title={`Veiculos financiaveis em ${city.name}`}
          subtitle="Modelos com alta demanda local e condicoes mais competitivas de aprovacao."
          vehicles={vehicles}
        />

        <CTASection
          title="Receba condicoes inteligentes do Cerebro IA"
          description="Combine preco, taxa e prazo ideais para sua realidade e veja anuncios com maior chance de aprovacao."
          primaryLabel="Ver anuncios para financiar"
          primaryHref={`/anuncios?city_slug=${city.slug}`}
          secondaryLabel="Consultar FIPE local"
          secondaryHref={`/tabela-fipe/${city.slug}`}
        />
      </main>

      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(financialSchema) }} />
    </>
  );
}
