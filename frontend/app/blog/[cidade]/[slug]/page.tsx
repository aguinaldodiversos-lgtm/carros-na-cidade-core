// frontend/app/blog/[cidade]/[slug]/page.tsx
//
// PR L — shell visual do post individual (/blog/[cidade]/[slug]).
// Resolve o 404 dos cards do grid sem entrar em arquitetura de
// conteúdo completo (PR L.2 separado). Reusa fetchBlogPageContent
// para encontrar o post pelo slug nos posts do fallback/remoto.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostPageClient } from "@/components/blog/BlogPostPageClient";
import { fetchBlogPageContent, prettifyCitySlug, type BlogPost } from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
    slug: string;
  };
};

export const revalidate = 300;

async function findPost(citySlug: string, postSlug: string) {
  const content = await fetchBlogPageContent(citySlug);
  const allPosts: BlogPost[] = [...(content.featuredPosts || []), ...(content.popularPosts || [])];

  const post = allPosts.find((item) => item.slug === postSlug);
  if (!post) return null;

  const sameCategory = allPosts.filter(
    (item) => item.id !== post.id && item.category === post.category
  );
  const fallbackRelated = allPosts.filter((item) => item.id !== post.id);
  const relatedPosts = (sameCategory.length > 0 ? sameCategory : fallbackRelated).slice(0, 3);

  return { post, relatedPosts };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const found = await findPost(params.cidade, params.slug);
  if (!found) {
    return {
      title: "Artigo não encontrado | Blog Carros na Cidade",
      robots: { index: false, follow: false },
    };
  }

  const city = prettifyCitySlug(params.cidade);
  const { post } = found;
  const description =
    post.excerpt?.trim() || `Conteúdo automotivo em ${city.name} no Blog Carros na Cidade.`;

  return {
    title: `${post.title} | Blog Carros na Cidade`,
    description,
    alternates: {
      canonical: `/blog/${params.cidade}/${params.slug}`,
    },
    openGraph: {
      title: post.title,
      description,
      url: `/blog/${params.cidade}/${params.slug}`,
      type: "article",
      locale: "pt_BR",
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const found = await findPost(params.cidade, params.slug);
  if (!found) notFound();

  const city = prettifyCitySlug(params.cidade);
  const { post, relatedPosts } = found;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
    /\/+$/,
    ""
  );
  const pageUrl = `${siteUrl}/blog/${params.cidade}/${params.slug}`;
  const coverImage = post.coverImage?.startsWith("http")
    ? post.coverImage
    : `${siteUrl}${post.coverImage || "/images/vehicle-placeholder.svg"}`;

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    url: pageUrl,
    datePublished: post.publishedAt,
    image: coverImage,
    articleSection: post.category,
    inLanguage: "pt-BR",
    publisher: {
      "@type": "Organization",
      name: "Carros na Cidade",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/images/logo-carros-na-cidade.png`,
      },
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
      { "@type": "ListItem", position: 3, name: post.title, item: pageUrl },
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
      <BlogPostPageClient
        post={post}
        relatedPosts={relatedPosts}
        citySlug={params.cidade}
        cityName={city.name}
      />
    </>
  );
}
