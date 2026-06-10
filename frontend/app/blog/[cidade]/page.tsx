// frontend/app/blog/[cidade]/page.tsx
//
// Rota dual (Fase 4.2): /blog/<x> pode ser
//   1. um POST do CMS (x = slug de post published) → renderiza o artigo
//      completo com canonical /blog/<slug>. Atende a URL global limpa
//      pedida pela Fase 4.2 sem quebrar o roteamento existente — Next só
//      permite um segmento dinâmico neste nível e ele já era [cidade].
//   2. um HUB por cidade (comportamento PR L) → vitrine editorial, agora
//      com os posts do CMS na frente dos cards (fallback hardcoded segue
//      preenchendo o layout enquanto houver poucos posts reais).
//
// Precedência: post primeiro. O hub aceita QUALQUER slug (prettifyCitySlug
// não valida contra banco), então a ordem inversa esconderia todo post.
// Colisão real (post com slug igual a cidade-uf) é evitada com aviso no
// editor admin quando o slug termina com sigla de UF.
//
// SEO: schema Blog (não Article) no hub, canonical self, breadcrumb.
import type { Metadata } from "next";
import { BlogPageClient } from "@/components/blog/BlogPageClient";
import { CmsBlogPostArticle } from "@/components/blog/CmsBlogPostArticle";
import {
  buildCmsPostJsonLd,
  buildCmsPostMetadata,
  cmsPostToBlogPost,
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
} from "@/lib/blog/blog-cms";
import { fetchBlogPageContent, prettifyCitySlug, type BlogPost } from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
  };
};

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // /blog/<slug-de-post> → metadata do post (canonical global).
  const cmsPost = await fetchPublishedBlogPost(params.cidade);
  if (cmsPost) {
    return buildCmsPostMetadata(cmsPost, `/blog/${cmsPost.slug}`);
  }

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
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
    /\/+$/,
    ""
  );

  // ── 1) /blog/<slug> de post do CMS ──────────────────────────────────────
  const cmsPost = await fetchPublishedBlogPost(params.cidade);
  if (cmsPost) {
    const { posts: recent } = await fetchPublishedBlogPosts({ limit: 4 });
    const city = prettifyCitySlug("sao-paulo-sp"); // contexto neutro para CTAs locais
    const pageUrl = `${siteUrl}/blog/${cmsPost.slug}`;

    const articleLd = buildCmsPostJsonLd(cmsPost, pageUrl);
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "Blog", item: `${siteUrl}/blog` },
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
          citySlug={city.slug}
          cityName={city.name}
          cityLabel={city.label}
        />
      </>
    );
  }

  // ── 2) Hub editorial por cidade ──────────────────────────────────────────
  const city = prettifyCitySlug(params.cidade);
  const [content, cms] = await Promise.all([
    fetchBlogPageContent(params.cidade),
    fetchPublishedBlogPosts({ limit: 12 }),
  ]);

  // Posts reais do CMS entram NA FRENTE; fallback preenche o restante do
  // layout. Dedup por slug protege contra fallback espelhando post real.
  if (cms.posts.length > 0) {
    const cmsCards: BlogPost[] = cms.posts.map((p) => cmsPostToBlogPost(p, city.label));
    const cmsSlugs = new Set(cmsCards.map((p) => p.slug));

    const fillFeatured = (content.featuredPosts || []).filter((p) => !cmsSlugs.has(p.slug));
    content.featuredPosts = [...cmsCards, ...fillFeatured].slice(
      0,
      Math.max(6, Math.min(cmsCards.length, 12))
    );

    content.popularPosts = (content.popularPosts || []).filter((p) => !cmsSlugs.has(p.slug));
  }

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
      image: post.coverImage?.startsWith("http") ? post.coverImage : `${siteUrl}${post.coverImage}`,
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
