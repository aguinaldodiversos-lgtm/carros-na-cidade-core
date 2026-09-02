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
import { cmsPostToBlogPost, fetchPublishedBlogPosts } from "@/lib/blog/blog-cms";
import { applyCmsPostsToHubContent, buildBlogPostHref } from "@/lib/blog/blog-hub";
import { fetchBlogPageContent, prettifyCitySlug } from "@/lib/blog/blog-page";

function resolveSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(/\/+$/, "");
}

/**
 * @param citySlug  slug da cidade PÚBLICA (URL ou cookie/primária), ou `null`
 *                  quando o portal não tem cidade — os links caem na canônica
 *                  global do post (`/blog/<slug>`) em vez de inventar cidade.
 * @param pagePath  path desta página para canonical/JSON-LD ("/blog" ou
 *                  "/blog/<cidade>").
 */
export async function BlogHubServer({
  citySlug,
  pagePath,
}: {
  citySlug: string | null;
  pagePath: string;
}) {
  const siteUrl = resolveSiteUrl();
  // `prettifyCitySlug("")` devolve "São Paulo / SP" como default histórico — o
  // que, sem cidade pública, seria NOMEAR uma cidade que o portal não atende.
  // Só usamos o prettify quando há slug de verdade.
  const city = citySlug ? prettifyCitySlug(citySlug) : null;
  const cityName = city?.name ?? null;
  /** Sufixo territorial da copy: some quando não há cidade. */
  const inCity = cityName ? ` em ${cityName}` : "";

  // Fallback hardcoded + CMS em paralelo. O CMS, havendo posts, é canônico.
  // limit=24 garante que todos os posts adotados (13) sejam servidos.
  const [content, cms] = await Promise.all([
    fetchBlogPageContent(citySlug ?? ""),
    fetchPublishedBlogPosts({ limit: 24 }),
  ]);

  const cmsCards = cms.posts.map((post) => cmsPostToBlogPost(post, city?.label ?? ""));
  const hubContent = applyCmsPostsToHubContent(content, cmsCards, citySlug);

  const pageUrl = `${siteUrl}${pagePath}`;

  // schema Blog: Google entende a página como hub editorial.
  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: `Blog automotivo${inCity}`,
    description: `Guias, dicas e notícias sobre carros${inCity}: compra, venda, manutenção, financiamento e mercado local.`,
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
    // `about` só quando há cidade: um Place sem lugar real é ruído no schema.
    ...(city ? { about: { "@type": "Place", name: city.label } } : {}),
    blogPost: (hubContent.featuredPosts || []).slice(0, 6).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${siteUrl}${buildBlogPostHref(citySlug, post.slug)}`,
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
        entityId={citySlug ?? "blog"}
        citySlug={citySlug ?? undefined}
      />
      {/*
        O H1 + frase do hub NÃO ficam mais aqui. Este componente é ASYNC
        (await fetchBlogPageContent/fetchPublishedBlogPosts), então qualquer
        H1 renderizado aqui é transmitido DEPOIS do footer no stream (bug
        2026-06-27). O H1 agora vem do <BlogIntroSync> síncrono, renderizado
        pela PAGE antes do <Suspense>. Aqui ficam só os dados pesados.
      */}
      <BlogPageClient content={hubContent} />
    </>
  );
}

export default BlogHubServer;
