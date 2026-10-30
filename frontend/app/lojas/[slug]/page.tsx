// frontend/app/lojas/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import DealerStorefront from "@/components/dealers/DealerStorefront";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import { fetchPublicDealer, type PublicDealer } from "@/lib/dealers/fetch-public-dealer";
import { toAbsoluteUrl } from "@/lib/seo/site";

/**
 * Página pública da loja — `/lojas/[slug]`.
 *
 * Briefing 2026-05-25 (Lojas Públicas):
 *   - lista TODOS os anúncios ativos da loja, sanitizados via contrato público;
 *   - 404 real se loja inexistente, bloqueada ou inativa (notFound());
 *   - empty state honesto se loja existir sem anúncios — `noindex` nesse caso;
 *   - sem dados sensíveis (telefone, plano, ranking, peso);
 *   - linguagem pública: "Loja parceira", "Loja verificada", "Anúncios ativos".
 *
 * Design (mantém padrão premium do projeto):
 *   - hero compacto com avatar, nome, cidade, total ativo + badge verified;
 *   - grid de AdCard variant="grid";
 *   - empty state via `buildEmptyStateCopy("dealer-no-ads")`.
 */

type PageProps = {
  params: { slug: string };
};

// `force-dynamic` pelo mesmo motivo do /veiculo/[slug]: precisamos comitar
// 404 real quando o resolver devolve null (segment-level not-found.tsx +
// ISR retorna soft-404 em Next 14.2).
export const dynamic = "force-dynamic";

function buildTitle(dealer: PublicDealer): string {
  const place = dealer.city && dealer.state ? `em ${dealer.city}, ${dealer.state}` : "no Brasil";
  return `Veículos da ${dealer.name} ${place}`;
}

function buildDescription(dealer: PublicDealer): string {
  const place = dealer.city && dealer.state ? `em ${dealer.city}, ${dealer.state}` : "";
  return `Veja carros anunciados pela ${dealer.name}${place ? ` ${place}` : ""}. Compare ofertas disponíveis no Carros na Cidade.`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const payload = await fetchPublicDealer(params.slug);
  // Lojas Públicas 2026-05-25 — comitar 404 ANTES do Page renderizar.
  // Mesmo padrão do `/veiculo/[slug]/page.tsx`: em Next 14.2 com
  // `force-dynamic`, chamar `notFound()` somente no Page comita HTTP
  // 200 com body de not-found (soft-404). Comitar em generateMetadata
  // garante o status code real 404 — smoke valida isso.
  if (!payload) notFound();

  const { dealer } = payload;
  // SEM o sufixo " | Carros na Cidade": o `title.template` do RootLayout
  // (`app/layout.tsx`: "%s | Carros na Cidade") já aplica. Com ele aqui, o
  // HTML servido saía com "…| Carros na Cidade | Carros na Cidade" —
  // reproduzido em runtime na auditoria da Fase 3 (2026-08-07). O `title`
  // abaixo alimenta o template; `openGraph`/`twitter` NÃO passam pelo
  // template, então esses recebem o título completo.
  const title = buildTitle(dealer);
  const socialTitle = `${title} | Carros na Cidade`;
  const description = buildDescription(dealer);
  const canonical = toAbsoluteUrl(`/lojas/${dealer.slug}`);
  const indexable = dealer.totalActiveAds > 0;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: socialTitle,
      description,
      url: canonical,
      siteName: "Carros na Cidade",
      locale: "pt_BR",
    },
    twitter: {
      card: "summary",
      title: socialTitle,
      description,
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

function buildDealerJsonLd(dealer: PublicDealer): Record<string, unknown> {
  // AutoDealer schema.org — somente campos confiáveis.
  // NUNCA inventa telefone/horário/endereço completo.
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealer.name,
    url: toAbsoluteUrl(`/lojas/${dealer.slug}`),
  };

  if (dealer.city || dealer.state) {
    obj.address = {
      "@type": "PostalAddress",
      addressLocality: dealer.city ?? undefined,
      addressRegion: dealer.state ?? undefined,
      addressCountry: "BR",
    };
  }

  if (dealer.description) obj.description = dealer.description;
  if (dealer.logoUrl) obj.logo = toAbsoluteUrl(dealer.logoUrl);
  if (dealer.coverUrl) obj.image = toAbsoluteUrl(dealer.coverUrl);
  return obj;
}

export default async function PublicDealerPage({ params }: PageProps) {
  const payload = await fetchPublicDealer(params.slug);
  if (!payload) notFound();

  const { dealer, rawAds, reviews } = payload;
  return (
    <>
      <DealerStorefront dealer={dealer} ads={rawAds} reviews={reviews} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildDealerJsonLd(dealer)) }}
      />
      <SiteBottomNav />
    </>
  );
}
