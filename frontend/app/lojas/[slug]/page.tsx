// frontend/app/lojas/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdCard } from "@/components/ads/AdCard";
import { fetchPublicDealer, type PublicDealer } from "@/lib/dealers/fetch-public-dealer";
import {
  buildEmptyStateCopy,
  buildPublicTerritoryLabel,
  buildPublicVehicleHref,
} from "@/lib/public-contracts";
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
  const title = `${buildTitle(dealer)} | Carros na Cidade`;
  const description = buildDescription(dealer);
  const canonical = toAbsoluteUrl(`/lojas/${dealer.slug}`);
  const indexable = dealer.totalActiveAds > 0;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: "Carros na Cidade",
      locale: "pt_BR",
    },
    twitter: {
      card: "summary",
      title,
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

  return obj;
}

export default async function PublicDealerPage({ params }: PageProps) {
  const payload = await fetchPublicDealer(params.slug);
  if (!payload) notFound();

  const { dealer, rawAds } = payload;
  const territoryLabel = buildPublicTerritoryLabel({ city: dealer.city, state: dealer.state });
  const initials = (dealer.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  const emptyCopy = buildEmptyStateCopy("dealer-no-ads", { label: dealer.name });

  // `rawAds` é o que veio do backend (shape AdItem). Para o AdCard
  // que aceita BaseAdData direto, vamos passar o AdItem (compatível
  // por nominação). buildPublicVehicleHref usa apenas slug/id —
  // descartamos qualquer ad que não tenha href válido (defesa
  // adicional além do filtro do fetcher).
  const renderableAds = rawAds.filter((ad) => buildPublicVehicleHref(ad) !== null);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <nav aria-label="Trilha" className="text-sm text-cnc-muted">
        <Link href="/" className="hover:text-primary">
          Início
        </Link>
        <span className="mx-2 text-cnc-muted/60">/</span>
        <Link href="/comprar" className="hover:text-primary">
          Comprar
        </Link>
        <span className="mx-2 text-cnc-muted/60">/</span>
        <span className="text-cnc-text-strong">{dealer.name}</span>
      </nav>

      <header className="mt-4 flex flex-col gap-4 rounded-2xl border border-cnc-line bg-cnc-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-5">
        <span
          aria-hidden="true"
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-[28px] font-extrabold text-primary"
        >
          {initials || "C"}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-extrabold tracking-tight text-cnc-text-strong sm:text-3xl">
              {dealer.name}
            </h1>
            <span className="inline-flex items-center rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
              Loja parceira
            </span>
            {dealer.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-cnc-success/12 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cnc-success">
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Loja verificada
              </span>
            ) : null}
          </div>

          <p className="mt-1.5 text-sm text-cnc-muted">{territoryLabel}</p>
          <p className="mt-1 text-sm font-semibold text-cnc-text-strong">
            {dealer.totalActiveAds > 0
              ? `${dealer.totalActiveAds} ${dealer.totalActiveAds === 1 ? "anúncio ativo" : "anúncios ativos"}`
              : "Sem anúncios ativos no momento"}
          </p>
        </div>
      </header>

      {renderableAds.length > 0 ? (
        <section aria-labelledby="ofertas-da-loja" className="mt-8">
          <h2 id="ofertas-da-loja" className="text-lg font-extrabold text-cnc-text-strong">
            Ofertas da loja
          </h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {renderableAds.map((ad) => (
              <li key={ad.id}>
                <AdCard ad={ad} variant="grid" />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section
          aria-labelledby="loja-sem-ofertas"
          className="mt-8 rounded-2xl border border-cnc-line bg-cnc-surface p-8 text-center shadow-card"
        >
          <h2 id="loja-sem-ofertas" className="text-lg font-extrabold text-cnc-text-strong">
            {emptyCopy.title}
          </h2>
          <p className="mt-2 text-sm text-cnc-muted">{emptyCopy.body}</p>
          {emptyCopy.cta ? (
            <Link
              href={emptyCopy.cta.href}
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
            >
              {emptyCopy.cta.label}
            </Link>
          ) : null}
        </section>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildDealerJsonLd(dealer)) }}
      />
    </main>
  );
}
