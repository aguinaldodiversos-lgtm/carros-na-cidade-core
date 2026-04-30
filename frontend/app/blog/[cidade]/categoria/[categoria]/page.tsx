// frontend/app/blog/[cidade]/categoria/[categoria]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogCategoryPageClient } from "@/components/blog/BlogCategoryPageClient";
import {
  fetchBlogCategoryContent,
  findCategoryDefinition,
  prettifyCitySlug,
  type BlogCategoryId,
} from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
    categoria: string;
  };
};

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const definition = findCategoryDefinition(params.categoria);
  if (!definition) {
    return {
      title: "Categoria não encontrada | Blog Carros na Cidade",
      robots: { index: false, follow: false },
    };
  }

  const city = prettifyCitySlug(params.cidade);
  const title = `${definition.label} de carros em ${city.name} | Blog Carros na Cidade`;
  const description = `${definition.description} Conteúdo automotivo em ${city.name} sobre ${definition.label.toLowerCase()}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/blog/${params.cidade}/categoria/${params.categoria}`,
    },
    openGraph: {
      title,
      description,
      url: `/blog/${params.cidade}/categoria/${params.categoria}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const definition = findCategoryDefinition(params.categoria);
  if (!definition) notFound();

  const content = await fetchBlogCategoryContent(
    params.cidade,
    definition.id as BlogCategoryId
  );

  return <BlogCategoryPageClient content={content} />;
}
