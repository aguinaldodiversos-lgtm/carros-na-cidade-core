// frontend/app/blog/[cidade]/page.tsx
import type { Metadata } from "next";
import { BlogPageClient } from "@/components/blog/BlogPageClient";
import { fetchBlogPageContent, prettifyCitySlug } from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
  };
};

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);

  return {
    title: `Blog Carros na Cidade | Dicas e notícias em ${city.name}`,
    description: `Dicas, notícias, comparativos e conteúdos automotivos em ${city.name}. Veja artigos locais, tendências do mercado e oportunidades no Carros na Cidade.`,
    alternates: {
      canonical: `/blog/${params.cidade}`,
    },
    openGraph: {
      title: `Blog Carros na Cidade | ${city.name}`,
      description: `Conteúdo automotivo local, guias de compra e notícias em ${city.name}.`,
      url: `/blog/${params.cidade}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function BlogCityPage({ params }: PageProps) {
  const content = await fetchBlogPageContent(params.cidade);

  return <BlogPageClient content={content} />;
}
