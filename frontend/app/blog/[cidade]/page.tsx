// frontend/app/blog/[cidade]/page.tsx
//
// PR L — /blog/[cidade] vira LISTAGEM editorial premium (mobile-first)
// alinhada com a mockup blog.png. O conteúdo do antigo "artigo simulador"
// foi movido para a rota dedicada /simulador-financiamento/[cidade]; aqui
// o usuário entra na vitrine de artigos.
//
// SEO: schema Blog (não Article), canonical self, breadcrumb, generateMetadata.
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
  const title = `Blog automotivo em ${city.name} — guias, dicas e notícias | Carros na Cidade`;
  const description = `Blog automotivo de ${city.name}: guias para comprar e vender, dicas de manutenção, mercado, financiamento e cuidados com seu carro. Conteúdo local e atualizado.`;

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
      type: "website",
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
  const content = await fetchBlogPageContent(params.cidade);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
    /\/+$/,
    ""
  );
  const pageUrl = `${siteUrl}/blog/${params.cidade}`;

  // schema Blog: Google entende como hub editorial.
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `Blog automotivo em ${city.name}`,
    description: `Guias, dicas e notícias sobre carros em ${city.name}: compra, venda, manutenção, financiamento e mercado local.`,
    url: pageUrl,
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
    blogPost: (content.featuredPosts || []).slice(0, 6).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${siteUrl}/blog/${params.cidade}/${post.slug}`,
      datePublished: post.publishedAt,
      image: post.coverImage?.startsWith("http")
        ? post.coverImage
        : `${siteUrl}${post.coverImage}`,
      articleSection: post.category,
    })),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: pageUrl },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <BlogPageClient content={content} />
    </>
  );
}
