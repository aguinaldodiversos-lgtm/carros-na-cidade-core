// frontend/app/blog/page.tsx
//
// Índice do blog (/blog). Fase 4.2.1 — correção do hub.
//
// ANTES: esta rota fazia `redirect("/blog/<cidade>")`. Em SSR, o Next entrega
// o redirect como um shell HTTP 200 (meta-refresh + digest NEXT_REDIRECT) SEM
// HTML dos posts — então `curl https://.../blog` nunca continha as matérias e
// o /blog "não mostrava" os posts do CMS, mesmo com o backend correto.
//
// AGORA: /blog renderiza o MESMO hub de /blog/<cidade> (BlogHubServer), no
// SSR, com os posts do CMS no HTML. A cidade vem do cookie (ou do padrão) —
// preservando a personalização que o redirect dava. Canonical próprio: /blog.

import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { BlogHubServer } from "@/components/blog/BlogHubServer";
import { BlogContentSkeleton, BlogIntroSync } from "@/components/blog/BlogIntroSync";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { fetchPublicCitySet, isPublicCity } from "@/lib/city/public-city-set";

export const dynamic = "force-dynamic";

/**
 * Cidade do hub — ou `null`.
 *
 * Era `fromCookie?.slug ?? DEFAULT_PUBLIC_CITY_SLUG`, com o literal
 * `sao-paulo-sp`: cada card de post do hub virava `/blog/sao-paulo-sp/<slug>`,
 * e `/blog/sao-paulo-sp` é 404 (cidade sem estoque). O cookie também não basta
 * sozinho — cidade guardada que perdeu o estoque cai no mesmo 404.
 *
 * Agora: cookie **se ainda for público** → cidade pública primária → `null`.
 * Com `null` o hub usa a variante sem cidade (`/blog/post/<slug>`), que existe
 * e não depende de território. A rota `/blog` em si não muda: continua 200 com
 * canonical própria e os posts no HTML (Fase 4.2.1).
 */
async function resolveCitySlug(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  const set = await fetchPublicCitySet();

  if (fromCookie?.slug && isPublicCity(set, fromCookie.slug)) return fromCookie.slug;
  return set?.primaryCity?.slug ?? null;
}

export async function generateMetadata(): Promise<Metadata> {
  const title = "Blog automotivo — guias, dicas e notícias | Carros na Cidade";
  const description =
    "Blog automotivo do Carros na Cidade: guias para comprar e vender, dicas de manutenção, mercado, financiamento e cuidados com o seu carro. Conteúdo atualizado.";

  return {
    title,
    description,
    alternates: { canonical: "/blog" },
    openGraph: {
      title,
      description,
      url: "/blog",
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

/** Conteúdo assíncrono do índice (resolve cidade do cookie + hub). */
async function BlogIndexAsyncContent() {
  const citySlug = await resolveCitySlug();
  return <BlogHubServer citySlug={citySlug} pagePath="/blog" />;
}

/**
 * BlogIndexPage — SÍNCRONA (NÃO tornar async). O H1 genérico "Blog automotivo"
 * vem do <BlogIntroSync> síncrono, antes do <Suspense> → entra no `<main>`
 * antes do footer. A cidade (cookie) é resolvida no conteúdo assíncrono; como
 * o índice não tem cidade na URL, o cabeçalho usa a variante sem cidade.
 */
export default function BlogIndexPage() {
  return (
    <>
      <BlogIntroSync />
      <Suspense fallback={<BlogContentSkeleton />}>
        <BlogIndexAsyncContent />
      </Suspense>
    </>
  );
}
