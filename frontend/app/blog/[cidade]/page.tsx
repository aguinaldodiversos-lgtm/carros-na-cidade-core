// frontend/app/blog/[cidade]/page.tsx
import type { Metadata } from "next";
import { BlogPageClient } from "@/components/blog/BlogPageClient";
import { fetchBlogPageContent, prettifyCitySlug } from "@/lib/blog/blog-page";
import { fetchAdsSearch } from "@/lib/search/ads-search";

type PageProps = {
  params: {
    cidade: string;
  };
};

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);
  const title = `Simulador de Financiamento de Carros em ${city.name} | Blog Carros na Cidade`;
  const description = `Guia completo para simular financiamento de veículos em ${city.name}: como funciona, como usar o simulador, melhores taxas e perguntas frequentes. Dicas locais para economizar na compra do seu carro.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/blog/${params.cidade}`,
    },
    openGraph: {
      title,
      description,
      url: `/blog/${params.cidade}`,
      type: "article",
      locale: "pt_BR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BlogCityPage({ params }: PageProps) {
  const city = prettifyCitySlug(params.cidade);

  const [content, offersResult] = await Promise.all([
    fetchBlogPageContent(params.cidade),
    fetchAdsSearch({
      city_slug: params.cidade,
      sort: "highlight",
      limit: 3,
      page: 1,
    }).catch(() => ({ data: [] as unknown[] })),
  ]);

  const offers = Array.isArray((offersResult as { data?: unknown[] }).data)
    ? (offersResult as { data: unknown[] }).data
    : [];

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
    /\/+$/,
    ""
  );
  const pageUrl = `${siteUrl}/blog/${params.cidade}`;
  const datePublished = "2024-05-15";

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Simulador de Financiamento de Carros: como usar e encontrar as melhores condições em ${city.name}`,
    description: `Guia completo para simular financiamento de veículos em ${city.name}: como funciona, como usar o simulador, melhores taxas e perguntas frequentes.`,
    image: `${siteUrl}/images/blog.png`,
    datePublished,
    dateModified: datePublished,
    inLanguage: "pt-BR",
    author: {
      "@type": "Person",
      name: "Lucas Andrade",
    },
    publisher: {
      "@type": "Organization",
      name: "Carros na Cidade",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/images/logo-carros-na-cidade.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
    about: {
      "@type": "Place",
      name: city.label,
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog/${params.cidade}` },
      {
        "@type": "ListItem",
        position: 3,
        name: "Financiamento",
        item: `${siteUrl}/blog/${params.cidade}?categoria=financiamento`,
      },
      { "@type": "ListItem", position: 4, name: "Simulador de Financiamento", item: pageUrl },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <BlogPageClient
        content={content}
        offers={offers as Parameters<typeof BlogPageClient>[0]["offers"]}
      />
    </>
  );
}
