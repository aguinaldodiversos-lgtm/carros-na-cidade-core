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

import type { Metadata } from "next";
import { cookies } from "next/headers";

import { BlogHubServer } from "@/components/blog/BlogHubServer";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";
import { parseCityCookieValue } from "@/lib/city/parse-city-cookie-server";
import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

export const revalidate = 300;

async function resolveCitySlug(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = parseCityCookieValue(cookieStore.get(CITY_COOKIE_NAME)?.value);
  return fromCookie?.slug ?? DEFAULT_PUBLIC_CITY_SLUG;
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

export default async function BlogIndexPage() {
  const citySlug = await resolveCitySlug();
  return <BlogHubServer citySlug={citySlug} pagePath="/blog" />;
}
