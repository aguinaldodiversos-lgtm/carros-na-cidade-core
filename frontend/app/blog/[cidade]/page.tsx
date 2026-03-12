import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import CTASection from "@/components/common/CTASection";
import PageBreadcrumbs from "@/components/common/PageBreadcrumbs";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { getAIBlogInsights } from "@/services/aiService";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import {
  getBlogArticlesByCity,
  getCityProfile,
  isSupportedCitySlug,
  getStaticCitySlugs,
  getVehiclesByCity,
  type BlogArticle,
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
    title: `Blog automotivo em ${city.name} ${city.uf}`,
    description: `Noticias automotivas, tendencias de mercado e dicas de compra de carros em ${city.name}.`,
    keywords: [
      `noticias automotivas ${city.name.toLowerCase()}`,
      `carros em alta ${city.name.toLowerCase()}`,
      `blog carros ${city.name.toLowerCase()}`,
    ],
    alternates: {
      canonical: `/blog/${city.slug}`,
    },
    openGraph: {
      title: `Blog automotivo em ${city.name}`,
      description: `Conteudo local sobre mercado automotivo, FIPE e financiamento em ${city.name}.`,
      url: `/blog/${city.slug}`,
      locale: "pt_BR",
      type: "website",
    },
  };
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const asDate = new Date(year, month - 1, day);
  return asDate.toLocaleDateString("pt-BR");
}

function ArticleCard({ article, citySlug }: { article: BlogArticle; citySlug: string }) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#e1e5ef] bg-white shadow-[0_2px_14px_rgba(12,22,42,0.08)]">
      <div className="relative h-44">
        <Image src={article.image} alt={article.title} fill className="object-cover" />
      </div>
      <div className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0e62d8]">{article.category}</p>
        <h3 className="mt-1 line-clamp-2 text-xl font-extrabold leading-tight text-[#1d2538]">{article.title}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-[#53607b]">{article.summary}</p>
        <div className="mt-3 flex items-center justify-between text-xs text-[#6a748d]">
          <span>{formatDate(article.publishedAt)}</span>
          <span>{article.readTime}</span>
        </div>
        <Link
          href={`/blog/${citySlug}?post=${article.slug}`}
          className="mt-3 inline-flex h-10 items-center rounded-lg bg-[#0e62d8] px-4 text-sm font-bold text-white transition hover:bg-[#0b54be]"
        >
          Ler artigo
        </Link>
      </div>
    </article>
  );
}

export default async function BlogCityPage({ params }: PageProps) {
  if (!isSupportedCitySlug(params.cidade)) {
    notFound();
  }

  const city = getCityProfile(params.cidade);
  const [insights, articles] = await Promise.all([
    getAIBlogInsights(city.slug),
    Promise.resolve(getBlogArticlesByCity(city.slug)),
  ]);

  const featured = articles[0];
  const list = articles.slice(1);
  const categories = articles.reduce<Record<string, number>>((acc, article) => {
    acc[article.category] = (acc[article.category] ?? 0) + 1;
    return acc;
  }, {});
  const vehicles = getVehiclesByCity(city.slug, 8);

  const articleSchema = {
    "@context": "https://schema.org",
    "@graph": articles.map((article) => ({
      "@type": "Article",
      headline: article.title,
      description: article.summary,
      datePublished: article.publishedAt,
      author: {
        "@type": "Person",
        name: article.author,
      },
      image: [`https://carrosnacidade.com${article.image}`],
      about: `Mercado automotivo em ${city.name}`,
    })),
  };
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Blog", href: "/blog" },
    { name: city.displayName },
  ];
  const pageSchema = buildWebPageJsonLd({
    title: `Noticias automotivas em ${city.name}`,
    description: `Conteúdo regional sobre mercado automotivo, FIPE, financiamento e intenção de compra em ${city.name}.`,
    path: `/blog/${city.slug}`,
    type: "CollectionPage",
    about: `Mercado automotivo em ${city.name}`,
  });

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <PageBreadcrumbs items={breadcrumbItems} className="mb-4" />

        <section className="overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#0c4fb2_0%,#1382e7_100%)] p-8 text-white shadow-[0_12px_30px_rgba(15,74,168,0.35)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">SEO Programatico - Conteudo Local</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight md:text-5xl">Noticias automotivas em {city.name}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/90 md:text-base">
            Cobertura regional com analise de demanda, FIPE, financiamento e tendencias de compra.
          </p>
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-[1.7fr_1fr]">
          <article className="overflow-hidden rounded-2xl border border-[#dfe4ef] bg-white shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
            <div className="relative h-64 md:h-80">
              <Image src={featured.image} alt={featured.title} fill className="object-cover" />
            </div>
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#0e62d8]">{featured.category}</p>
              <h2 className="mt-1 text-3xl font-extrabold leading-tight text-[#1d2538]">{featured.title}</h2>
              <p className="mt-3 text-sm text-[#53607b]">{featured.summary}</p>
              <div className="mt-3 flex items-center gap-4 text-xs text-[#66728c]">
                <span>{formatDate(featured.publishedAt)}</span>
                <span>{featured.readTime}</span>
                <span>{featured.author}</span>
              </div>
              <Link
                href={`/blog/${city.slug}?post=${featured.slug}`}
                className="mt-4 inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white transition hover:bg-[#0b54be]"
              >
                Ler materia completa
              </Link>
            </div>
          </article>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
              <h3 className="text-lg font-extrabold text-[#1d2538]">Categorias</h3>
              <ul className="mt-3 space-y-2 text-sm text-[#4f5972]">
                {Object.entries(categories).map(([category, count]) => (
                  <li key={category} className="flex items-center justify-between rounded-lg bg-[#f7f9fe] px-3 py-2">
                    <span>{category}</span>
                    <span className="rounded-full bg-[#e9eef9] px-2 py-0.5 text-xs font-bold text-[#4f5a77]">{count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
              <h3 className="text-lg font-extrabold text-[#1d2538]">Cerebro IA - {city.name}</h3>
              <ul className="mt-3 space-y-2">
                {insights.map((insight) => (
                  <li key={insight} className="rounded-lg bg-[#f7f9fe] p-3 text-sm text-[#4f5972]">
                    {insight}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)]">
              <h3 className="text-lg font-extrabold text-[#1d2538]">Continue explorando {city.name}</h3>
              <div className="mt-3 grid gap-2">
                {[
                  { label: "Ver catálogo local", href: `/anuncios?city_slug=${city.slug}` },
                  { label: "Consultar FIPE da cidade", href: `/tabela-fipe/${city.slug}` },
                  { label: "Simular financiamento local", href: `/simulador-financiamento/${city.slug}` },
                  { label: "Ver oportunidades da cidade", href: `/cidade/${city.slug}/oportunidades` },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-11 items-center rounded-xl border border-[#dfe4ef] bg-[#f8fafe] px-4 text-sm font-bold text-[#33405d] transition hover:bg-[#eef4ff]"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((article) => (
            <ArticleCard key={article.slug} article={article} citySlug={city.slug} />
          ))}
        </section>

        <VehicleCarousel
          title={`Veiculos relacionados ao conteudo em ${city.name}`}
          subtitle="Ofertas com maior afinidade aos temas e tendencias de leitura local."
          vehicles={vehicles}
        />

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: `Comprar em ${city.name}`,
              description: "Catálogo local com filtros por cidade, marca, modelo e intenção de compra.",
              href: `/anuncios?city_slug=${city.slug}`,
            },
            {
              title: "Hub territorial",
              description: "Página regional com contexto local, breadcrumbs e caminhos para marcas e modelos.",
              href: `/cidade/${city.slug}`,
            },
            {
              title: "Tabela FIPE local",
              description: "Compare o conteúdo editorial com referência de preço e oportunidades abaixo da tabela.",
              href: `/tabela-fipe/${city.slug}`,
            },
            {
              title: "Simulador da cidade",
              description: "Leve a intenção de leitura para decisão de compra com parcela e custo efetivo.",
              href: `/simulador-financiamento/${city.slug}`,
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(10,20,40,0.08)]"
            >
              <h3 className="text-lg font-extrabold text-[#1d2538]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#53607b]">{item.description}</p>
            </Link>
          ))}
        </section>

        <CTASection
          title="Quer transformar leitura em oportunidade de compra?"
          description="Veja anuncios selecionados com potencial de valorizacao e recomendacoes do Cerebro IA por cidade."
          primaryLabel="Explorar veiculos"
          primaryHref={`/anuncios?city_slug=${city.slug}`}
          secondaryLabel="Consultar FIPE local"
          secondaryHref={`/tabela-fipe/${city.slug}`}
        />
      </main>

      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
    </>
  );
}
