// frontend/app/lojas/[slug]/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdCard } from "@/components/ads/AdCard";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
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
    <>
      {/*
        Layout mobile-first:
        - `pb-24` em vez de `pb-16` para reservar espaço para o
          SiteBottomNav (h-16+) sem cortar o último card.
        - `pt-3 sm:pt-6` reduz topo no celular (header da loja é
          alto o bastante).
        - `px-3 sm:px-6 lg:px-8` — celular usa 12px (alinha com o
          padrão do detalhe e catálogo).
      */}
      <main className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-6 sm:pb-16 sm:pt-6 lg:px-8">
        <nav
          aria-label="Trilha"
          className="flex items-center gap-1 overflow-hidden text-[13px] text-cnc-muted sm:text-sm"
        >
          <Link href="/" className="shrink-0 hover:text-primary">
            Início
          </Link>
          <span aria-hidden="true" className="text-cnc-muted/60">
            /
          </span>
          <Link href="/comprar" className="shrink-0 hover:text-primary">
            Comprar
          </Link>
          <span aria-hidden="true" className="text-cnc-muted/60">
            /
          </span>
          <span className="truncate font-medium text-cnc-text-strong">{dealer.name}</span>
        </nav>

        {/*
          Header da loja:
          - Mobile: avatar 56px + texto em coluna única, gap-3 (compacto,
            sem desperdiçar viewport).
          - sm+: avatar 80px, gap-5.
          O `items-center` aplica em todos os breakpoints porque a
          coluna direita pode ter 2-3 linhas — `items-start` deixava
          o avatar voando no topo.
        */}
        <header className="mt-3 flex items-center gap-3 rounded-2xl border border-cnc-line bg-cnc-surface p-3.5 shadow-card sm:mt-4 sm:gap-5 sm:p-5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-[18px] font-extrabold text-primary sm:h-20 sm:w-20 sm:text-[28px]"
          >
            {initials || "C"}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="line-clamp-2 text-[17px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-2xl md:text-3xl">
              {dealer.name}
            </h1>

            {/*
              Badges: gap-1.5 + flex-wrap. No mobile vêm na linha
              seguinte ao H1 (a depender do tamanho). `mt-1.5` casa
              com o espaçamento das demais linhas.
            */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-primary sm:px-2.5 sm:text-[11px]">
                Loja parceira
              </span>
              {dealer.verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-cnc-success/12 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-cnc-success sm:px-2.5 sm:text-[11px]">
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

            <p className="mt-1.5 truncate text-[12.5px] text-cnc-muted sm:text-sm">
              {territoryLabel}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-cnc-text-strong sm:text-sm">
              {dealer.totalActiveAds > 0
                ? `${dealer.totalActiveAds} ${dealer.totalActiveAds === 1 ? "anúncio ativo" : "anúncios ativos"}`
                : "Sem anúncios ativos no momento"}
            </p>
          </div>
        </header>

        {renderableAds.length > 0 ? (
          <section aria-labelledby="ofertas-da-loja" className="mt-5 sm:mt-8">
            <h2
              id="ofertas-da-loja"
              className="text-[15px] font-extrabold text-cnc-text-strong sm:text-lg"
            >
              Ofertas da loja
            </h2>
            {/*
              Grid mobile-first: 1 col (default) → 2 cols sm+ → 3 cols lg+.
              `gap-3 sm:gap-4` aperta gutter no mobile sem encostar
              os cards. O AdCard variant="grid" já é mobile-horizontal
              internamente (imagem 42% à esquerda + texto à direita)
              — densifica a listagem single-column no celular.
            */}
            <ul className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
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
            className="mt-5 rounded-2xl border border-cnc-line bg-cnc-surface p-5 text-center shadow-card sm:mt-8 sm:p-8"
          >
            <h2
              id="loja-sem-ofertas"
              className="text-[15px] font-extrabold text-cnc-text-strong sm:text-lg"
            >
              {emptyCopy.title}
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-cnc-muted sm:text-sm">
              {emptyCopy.body}
            </p>
            {emptyCopy.cta ? (
              <Link
                href={emptyCopy.cta.href}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong sm:mt-5"
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

      {/*
        Bottom nav fixa do projeto — todas as rotas públicas mobile
        têm. Sem ela o usuário acessando /lojas/[slug] no celular
        ficava sem retorno fácil para Home/Comprar/Anunciar.
      */}
      <SiteBottomNav />
    </>
  );
}
