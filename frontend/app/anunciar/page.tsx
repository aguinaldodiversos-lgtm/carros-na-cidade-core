import type { Metadata } from "next";
import SellPageClient from "@/components/sell/SellPageClient";
import { getSellPageContent } from "@/lib/sell/sell-page";
import { getSellHeroAd } from "@/lib/sell/sell-hero-ad";

/**
 * `force-dynamic` (NÃO trocar por `revalidate`) — correção de ordem
 * semântica/SSR 2026-06-27.
 *
 * O root layout usa `cookies()`/`headers()`, então TODA rota já é dinâmica
 * (ƒ). Com `export const revalidate`, o Next tenta um prerender parcial:
 * emite um shell estático (header + FOOTER) e transmite o corpo do `<main>`
 * (incluindo o H1) DEPOIS do footer, dentro de um boundary de Suspense
 * vazio (`<main><template id="P:1"></template></main>`). O crawler então
 * via footer/e-mail/telefone antes do H1.
 *
 * `force-dynamic` desliga esse prerender parcial: a página renderiza inline
 * num passo só, com H1/conteúdo dentro do `<main>` ANTES do footer. Mesmo
 * padrão já usado em `/carros-em/[slug]`. Os fetches mantêm cache próprio
 * (`fetchAdsSearch` → `revalidate: 60`), então o custo é marginal.
 */
export const dynamic = "force-dynamic";

/**
 * Metadata da página /anunciar.
 *
 * O canonical EXPLICITAMENTE aponta para `/anunciar`. Sem este export,
 * a página herda `alternates.canonical: "/"` do `app/layout.tsx` (root
 * metadata), o que faz o Googlebot enxergar `/anunciar` como variante
 * da home — sinal contraditório que prejudica indexação da página de
 * conversão. Mantemos o canonical estável para sinal SEO consistente.
 *
 * NÃO trocar este canonical sem decisão explícita: alterar o canonical
 * de uma página de conversão pública impacta SEO comercial.
 */
export const metadata: Metadata = {
  title: "Anuncie seu carro",
  description:
    "Publique seu veículo no Carros na Cidade com presença regional, FIPE, contato direto via WhatsApp e ferramentas para particular e lojista.",
  alternates: { canonical: "/anunciar" },
};

export default async function AnunciarPage() {
  // Conteúdo é estático; o anúncio real do hero é best-effort (cai em
  // prévia honesta se o backend não devolver nada). Buscados em paralelo.
  const [content, heroAd] = await Promise.all([getSellPageContent(), getSellHeroAd()]);

  return <SellPageClient content={content} heroAd={heroAd} />;
}
