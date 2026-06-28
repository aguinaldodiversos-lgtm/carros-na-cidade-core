// frontend/components/blog/BlogHubServer.tsx
//
// Hub editorial do blog (Fase 4.2.1 — correção /blog).
//
// Componente servidor COMPARTILHADO pelas duas rotas de hub:
//   - /blog                (cidade do cookie/padrão; antes era um redirect)
//   - /blog/<cidade>       (cidade da URL; quando não é slug de post do CMS)
//
// Centraliza fetch (CMS + fallback), composição (applyCmsPostsToHubContent) e
// JSON-LD (Blog + BreadcrumbList), para que /blog e /blog/<cidade> rendam o
// MESMO hub — com os posts do CMS no HTML SSR — sem duplicar lógica.

import { AnalyticsPageView } from "@/components/analytics/AnalyticsPageView";
import { BlogPageClient } from "@/components/blog/BlogPageClient";
import {
  cmsPostToBlogPost,
  fetchPublishedBlogPosts,
} from "@/lib/blog/blog-cms";
import { applyCmsPostsToHubContent } from "@/lib/blog/blog-hub";
import { fetchBlogPageContent, prettifyCitySlug } from "@/lib/blog/blog-page";

function resolveSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(/\/+$/, "");
}

/**
 * @param citySlug  slug da cidade (URL ou cookie/padrão).
 * @param pagePath  path desta página para canonical/JSON-LD ("/blog" ou
 *                  "/blog/<cidade>").
 */
export async function BlogHubServer({
  citySlug,
  pagePath,
}: {
  citySlug: string;
  pagePath: string;
}) {
  const siteUrl = resolveSiteUrl();
  const city = prettifyCitySlug(citySlug);

  // Fallback hardcoded + CMS em paralelo. O CMS, havendo posts, é canônico.
  // limit=24 garante que todos os posts adotados (13) sejam servidos.
  const [content, cms] = await Promise.all([
    fetchBlogPageContent(citySlug),
    fetchPublishedBlogPosts({ limit: 24 }),
  ]);

  const cmsCards = cms.posts.map((post) => cmsPostToBlogPost(post, city.label));
  const hubContent = applyCmsPostsToHubContent(content, cmsCards, citySlug);

  const pageUrl = `${siteUrl}${pagePath}`;

  // schema Blog: Google entende a página como hub editorial.
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
    blogPost: (hubContent.featuredPosts || []).slice(0, 6).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${siteUrl}/blog/${encodeURIComponent(citySlug)}/${post.slug}`,
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
      <AnalyticsPageView
        event="blog_view"
        entityType="blog_hub"
        entityId={citySlug}
        citySlug={citySlug}
      />
      {/*
        Cabeçalho SEO síncrono (server-rendered). Renderizado AQUI, fora do
        <BlogPageClient> (client), para garantir que o H1 + a frase apareçam
        no `<main>` no flush inicial — antes do footer e das listas/cards
        assíncronos. O título antes vivia dentro do BlogPageClient e era
        transmitido depois do footer (main praticamente vazio no HTML). Mantém
        o mesmo visual da seção branca de topo; o BlogPageClient deixou de
        renderizar o título duplicado.
      */}
      <section className="border-b border-[#EDF1F8] bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-8 sm:px-6 md:pb-10 md:pt-12">
          <div className="max-w-3xl">
            <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#1D2440] md:text-[44px]">
              Blog automotivo em {city.name}
            </h1>
            <p className="mt-2 text-[15px] leading-7 text-[#5D667D] md:text-[18px]">
              Dicas rápidas sobre compra, venda, financiamento e cuidados com veículos na sua região.
            </p>
          </div>
        </div>
      </section>
      <BlogPageClient content={hubContent} />
    </>
  );
}

export default BlogHubServer;
