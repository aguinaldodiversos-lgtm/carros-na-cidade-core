// frontend/app/blog/[cidade]/[slug]/page.tsx
//
// Post individual em /blog/[cidade]/[slug].
//
// Fase 4.2: a página tenta primeiro o CMS (blog_posts, apenas published).
// Encontrando, renderiza o artigo COMPLETO (markdown seguro + SEO do
// banco) com canonical GLOBAL /blog/<slug> — o post é único, as URLs por
// cidade continuam funcionando mas apontam o canonical para a versão
// global (evita conteúdo duplicado entre cidades).
//
// Sem post no CMS, mantém o comportamento legado (PR L): procura nos
// posts do fallback/remoto e exibe o shell visual.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogPostPageClient } from "@/components/blog/BlogPostPageClient";
import { CmsBlogPostArticle } from "@/components/blog/CmsBlogPostArticle";
import {
  buildCmsPostJsonLd,
  buildCmsPostMetadata,
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
} from "@/lib/blog/blog-cms";
import { fetchBlogPageContent, prettifyCitySlug, type BlogPost } from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
    slug: string;
  };
};

// `force-dynamic` (correção SSR 2026-06-27): evita o Suspense vazio que
// transmitia o `<main>` (H1 do post) depois do footer. Padrão de /carros-em.
export const dynamic = "force-dynamic";

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
  // 1) CMS primeiro — SEO vem do banco (meta_title/meta_description/
  //    canonical/og/is_indexable), com fallbacks de title/excerpt.
  const cmsPost = await fetchPublishedBlogPost(params.slug);
  if (cmsPost) {
    return buildCmsPostMetadata(cmsPost, `/blog/${cmsPost.slug}`);
  }

  // 2) Legado (conteúdo estático).
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
  const city = prettifyCitySlug(params.cidade);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
    /\/+$/,
    ""
  );

  // ── Fase 4.2: post do CMS tem prioridade ────────────────────────────────
  const cmsPost = await fetchPublishedBlogPost(params.slug);
  if (cmsPost) {
    const { posts: recent } = await fetchPublishedBlogPosts({ limit: 4 });
    const pageUrl = `${siteUrl}/blog/${cmsPost.slug}`;

    const articleLd = buildCmsPostJsonLd(cmsPost, pageUrl);
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: `${siteUrl}/blog/${params.cidade}`,
        },
        { "@type": "ListItem", position: 3, name: cmsPost.title, item: pageUrl },
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
        <CmsBlogPostArticle
          post={cmsPost}
          relatedPosts={recent}
          citySlug={params.cidade}
          cityName={city.name}
          cityLabel={city.label}
        />
      </>
    );
  }

  // ── Legado: posts do fallback estático ──────────────────────────────────
  const found = await findPost(params.cidade, params.slug);
  if (!found) notFound();

  const { post, relatedPosts } = found;
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
