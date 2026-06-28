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
// O HUB é renderizado pelo componente compartilhado BlogHubServer (Fase
// 4.2.1), o mesmo usado por /blog — garante posts do CMS no HTML SSR e os 13
// posts adotados (sem o recorte antigo de 9).
import { Suspense } from "react";
import type { Metadata } from "next";

import { AnalyticsPageView } from "@/components/analytics/AnalyticsPageView";
import { BlogHubServer } from "@/components/blog/BlogHubServer";
import { BlogContentSkeleton, BlogIntroSync } from "@/components/blog/BlogIntroSync";
import { CmsBlogPostArticle } from "@/components/blog/CmsBlogPostArticle";
import {
  buildCmsPostJsonLd,
  buildCmsPostMetadata,
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
} from "@/lib/blog/blog-cms";
import { prettifyCitySlug } from "@/lib/blog/blog-page";

type PageProps = {
  params: {
    cidade: string;
  };
};

export const dynamic = "force-dynamic";

// Slug de cidade canônico: termina em "-<uf>" (2 letras). Posts do CMS NÃO
// usam esse padrão (o editor admin avisa contra slug terminado em sigla de
// UF — ver topo deste arquivo), então dá para decidir SINCRONAMENTE se a rota
// é um hub de cidade (mostra o H1 síncrono) ou um post (H1 vem do artigo).
const CITY_SLUG_RE = /^[a-z0-9-]+-[a-z]{2}$/;
function looksLikeCitySlug(slug: string): boolean {
  return CITY_SLUG_RE.test((slug || "").trim().toLowerCase());
}

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

/**
 * Conteúdo assíncrono (post-vs-hub). Fica DENTRO do <Suspense> da page —
 * pode awaitar/fetchar à vontade sem afetar a ordem do H1 síncrono.
 */
async function BlogCityAsyncContent({ cidade }: { cidade: string }) {
  // ── 1) /blog/<slug> de post do CMS ──────────────────────────────────────
  const cmsPost = await fetchPublishedBlogPost(cidade);
  if (cmsPost) {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.carrosnacidade.com").replace(
      /\/+$/,
      ""
    );
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
        <AnalyticsPageView event="blog_view" blogPostId={cmsPost.id} entityId={cmsPost.slug} />
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

  // ── 2) Hub editorial por cidade ─────────────────────────────────────────
  // Mesmo hub de /blog (componente compartilhado): CMS no HTML SSR, fallback
  // só quando o CMS está vazio.
  return <BlogHubServer citySlug={cidade} pagePath={`/blog/${cidade}`} />;
}

/**
 * BlogCityPage — SÍNCRONA de propósito (NÃO tornar async).
 *
 * O H1 do hub vem do <BlogIntroSync> síncrono, renderizado ANTES do <Suspense>
 * → entra no `<main>` antes do footer no HTML real. Para slugs de cidade
 * (padrão `nome-uf`) mostramos o cabeçalho; para slugs de post o H1 é o título
 * do artigo (renderizado no conteúdo assíncrono). Sem H1 duplicado.
 */
export default function BlogCityPage({ params }: PageProps) {
  const isCity = looksLikeCitySlug(params.cidade);
  const cityName = isCity ? prettifyCitySlug(params.cidade).name : undefined;

  return (
    <>
      {isCity ? <BlogIntroSync cityName={cityName} /> : null}
      <Suspense fallback={<BlogContentSkeleton />}>
        <BlogCityAsyncContent cidade={params.cidade} />
      </Suspense>
    </>
  );
}
