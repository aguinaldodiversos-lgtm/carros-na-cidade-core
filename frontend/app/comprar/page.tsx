import type { Metadata } from "next";
import Link from "next/link";

import BuyMarketplacePageClient from "@/components/buy/BuyMarketplacePageClient";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import { loadNationalCatalogData } from "@/lib/buy/national-catalog-loader";
import {
  buildNationalDirectory,
  EMPTY_NATIONAL_DIRECTORY,
  type NationalDirectory,
} from "@/lib/buy/national-directory";
import type { SearchParams } from "@/lib/buy/territory-variant";
import { fetchPublicCitySet } from "@/lib/city/public-city-set";
import {
  buildCanonicalUrlWithPolicy,
  buildRobotsWithPolicy,
  decideSeoQueryPolicy,
} from "@/lib/seo/query-policy";
import { toAbsoluteUrl } from "@/lib/seo/site";

/**
 * `/comprar` — CATÁLOGO NACIONAL. Página final, não redirector, não diretório.
 *
 * ── O que era, na primeira volta ─────────────────────────────────────────────
 * Um redirector puro: resolvia um estado por cookie (ou caía no default SP) e
 * redirecionava. Três problemas, todos medidos na auditoria:
 *
 *   1. A MESMA URL devolvia destino diferente por visitante. Redirect
 *      não-determinístico não é canonicalizável.
 *   2. `redirect()` em Server Component do Next 14.2 pode comitar 200 com
 *      `<meta http-equiv="refresh">` — para o crawler, uma página 200 sem
 *      canonical própria, que herda a da home.
 *   3. Sem território na URL, o default era um estado fixo: quem pedia
 *      "comprar" sem cookie recebia SP.
 *
 * ── O que era, na segunda volta (o defeito que este arquivo corrige) ─────────
 * A correção acima matou o redirect, mas deixou no lugar um DIRETÓRIO: HTTP 200
 * listando "Estados com anúncios ativos" e "Cidades com anúncios ativos", e
 * nenhum veículo. A rota comercial mais importante do portal virou um menu.
 * No celular — onde "Comprar" é um dos cinco itens da bottom nav — o visitante
 * tocava em Comprar e precisava de dois cliques (estado → cidade) antes de ver
 * o primeiro carro. Havia 28 anúncios ativos e zero cards na tela.
 *
 * ── O que é ──────────────────────────────────────────────────────────────────
 * A vitrine nacional TRANSACIONAL: o mesmo `BuyMarketplacePageClient` das
 * páginas estadual, municipal e regional, com `variant="nacional"`. Busca,
 * filtros, contagem, cards, paginação — tudo compartilhado, nenhum catálogo
 * paralelo. Os primeiros veículos saem no HTML do servidor
 * (`loadNationalCatalogData`), não depois da hidratação.
 *
 * O diretório territorial NÃO foi removido: ele desceu para DEPOIS da
 * paginação, compacto, como navegação interna secundária. Ele nunca mais é o
 * conteúdo principal.
 *
 * ── Invariante: o território é o Brasil ──────────────────────────────────────
 * Nenhum `state`, `city_slug`, `city_id`, `city` ou `city_slugs` entra nos
 * filtros SSR — ver `normalizeNationalFilters`. Sem cookie, sem geolocalização,
 * sem "a cidade com mais estoque". Que hoje todo o acervo esteja em uma cidade
 * só não muda o H1 nem a consulta: conteúdo de estoque não redefine a
 * identidade da rota.
 *
 * As grafias parametrizadas legadas (`?city_slug=`, `?state=`) saem daqui com
 * 308 real para o destino territorial final — no `middleware.ts`, antes de
 * qualquer HTML (`decideComprarLegacyQueryRedirect`). É também o destino do
 * 308 de `/anuncios`.
 */

export const dynamic = "force-dynamic";

const TITLE = "Comprar carros usados e seminovos no Brasil";
const DESCRIPTION =
  "Catálogo nacional de carros usados e seminovos no Carros na Cidade: busque por marca, modelo, preço e ano, e refine por estado ou cidade.";

type ComprarNacionalPageProps = {
  searchParams?: SearchParams;
};

/**
 * Metadata pela POLÍTICA CENTRAL (`lib/seo/query-policy.ts`), como nas demais
 * vitrines. Antes esta rota tinha metadata estática — aceitável enquanto ela
 * não tinha filtros; agora que `/comprar?brand=Honda` e `/comprar?page=2`
 * existem, uma canonical autorreferente fixa transformaria cada combinação de
 * filtro numa página indexável nova. A lista de parâmetros e a decisão
 * index/noindex NÃO são reescritas aqui: a mesma tabela que serve
 * `/carros-em`, `/carros-usados/[uf]` e `/comprar/estado/[uf]` serve esta rota.
 *
 * Resultado prático: `/comprar` limpa é `index,follow` autocanônica; `?page=2`
 * é indexável e autocanônica (senão o fim do acervo sumiria do índice); filtro
 * e ordenação são `noindex,follow` com canonical para `/comprar`.
 */
export async function generateMetadata({
  searchParams = {},
}: ComprarNacionalPageProps): Promise<Metadata> {
  const policy = decideSeoQueryPolicy(searchParams);
  const canonicalPath = buildCanonicalUrlWithPolicy("/comprar", policy);

  const title = policy.page >= 2 ? `${TITLE} — página ${policy.page}` : TITLE;

  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: canonicalPath },
    robots: buildRobotsWithPolicy(policy),
    openGraph: {
      title,
      description: DESCRIPTION,
      url: toAbsoluteUrl(canonicalPath),
      type: "website",
      locale: "pt_BR",
    },
  };
}

function formatAds(total: number): string {
  return total === 1 ? "1 anúncio" : `${total.toLocaleString("pt-BR")} anúncios`;
}

export default async function ComprarNacionalPage({ searchParams = {} }: ComprarNacionalPageProps) {
  const regionalEnabled = isRegionalPageEnabled();

  // Independentes entre si: o catálogo não precisa do diretório para renderizar
  // e vice-versa. Sequencial somaria as latências no TTFB da porta de entrada.
  const [catalog, citySet] = await Promise.all([
    loadNationalCatalogData(searchParams),
    fetchPublicCitySet(),
  ]);

  const directory = citySet ? buildNationalDirectory(citySet.cities) : EMPTY_NATIONAL_DIRECTORY;

  const breadcrumbItems = [{ name: "Home", href: "/" }, { name: "Comprar" }];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Carros usados e seminovos à venda no Brasil",
    numberOfItems: catalog.initialResults.pagination.total,
    itemListElement: catalog.initialResults.data.slice(0, 20).map((ad, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: toAbsoluteUrl(`/veiculo/${ad.slug || ad.id}`),
      name: ad.title || `${ad.brand ?? ""} ${ad.model ?? ""}`.trim() || "Veículo",
    })),
  };

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbItems} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/*
        O H1 desta página é o do `CatalogPageHeader` ("Carros usados no Brasil",
        variant nacional). O `<h1>` próprio que existia aqui — "Carros usados e
        seminovos à venda no Brasil", em cima do diretório — foi REMOVIDO: com
        o catálogo montado, os dois conviveriam na mesma tela e a página teria
        dois H1 concorrentes.

        `enableGeoRedirect` fica FORA de propósito. O `GeoToCityRedirect` só
        roda em variant estadual, mas passar a prop aqui seria reintroduzir por
        outro caminho exatamente o que esta rota não pode ter: geolocalização
        trocando o território canônico do visitante.
      */}
      <BuyMarketplacePageClient
        initialResults={catalog.initialResults}
        initialFacets={catalog.initialFacets}
        initialFilters={catalog.filters}
        city={catalog.city}
        variant="nacional"
        regionalEnabled={regionalEnabled}
      />

      {/* Wrapper com pb-20 md:pb-0 — o `BuyPageShell` reserva esse espaço
          internamente porque o `SiteBottomNav` mobile é fixed, mas tudo que
          renderiza DEPOIS do shell precisa replicar o mesmo padding para não
          ficar coberto pela bottom nav. Mesmo padrão de `/carros-em/[slug]`. */}
      <div className="bg-cnc-bg pb-20 md:pb-0">{renderNationalDirectory(directory)}</div>
    </>
  );
}

/**
 * Navegação territorial secundária — o antigo conteúdo principal desta rota.
 *
 * Continua tendo valor: é por aqui que o visitante (e o crawler) alcança as
 * canônicas estaduais e municipais, e a lista sai do MESMO conjunto que o gate
 * territorial usa para decidir 200 vs 404 — a página não pode oferecer um link
 * que a própria regra territorial vai barrar.
 *
 * Compacto por decisão explícita: dois blocos de links, sem stats, sem FAQ, sem
 * "continue explorando". O briefing de catálogo vetou o "segundo rodapé", e
 * este bloco vem logo abaixo dos veículos — não pode competir com eles.
 *
 * Backend indisponível (`ok:false`) renderiza NADA em vez de "nenhuma cidade":
 * afirmar ausência com base numa falha de rede é o mesmo erro que manteve uma
 * queda de backend invisível por semanas.
 */
function renderNationalDirectory(directory: NationalDirectory) {
  if (!directory.ok) return null;
  if (directory.states.length === 0 && directory.cities.length === 0) return null;

  return (
    <section
      aria-labelledby="explorar-localizacao"
      data-testid="national-territory-directory"
      // Teto e `lg:px-6` casados com o container do catálogo acima
      // (`BuyMarketplacePageClient`): este bloco vem logo depois da paginação e
      // a borda superior (`border-t`) corta a página inteira — em `max-w-7xl`
      // ela terminava 160px antes da coluna dos cards de cada lado.
      className="mx-auto w-full max-w-[1600px] border-t border-cnc-line px-4 py-8 sm:px-6 lg:px-6"
    >
      <h2
        id="explorar-localizacao"
        className="text-[17px] font-extrabold text-cnc-text-strong sm:text-[19px]"
      >
        Explore carros por localização
      </h2>
      <p className="mt-1 text-[13px] leading-6 text-cnc-muted">
        Uma cidade entra nesta lista quando recebe o primeiro anúncio ativo, e sai quando fica sem
        nenhum.
      </p>

      {directory.states.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-cnc-muted">
            Estados
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {directory.states.map((state) => (
              <li key={state.uf}>
                <Link
                  href={state.href}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 text-[13.5px] font-semibold text-cnc-text transition hover:border-primary hover:text-primary"
                >
                  {state.name}
                  <span className="text-[12px] font-medium text-cnc-muted">
                    {formatAds(state.activeAds)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {directory.cities.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.06em] text-cnc-muted">
            Cidades
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {directory.cities.map((city) => (
              <li key={city.slug}>
                <Link
                  href={city.href}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-cnc-line bg-cnc-surface px-3 py-1.5 text-[13.5px] font-semibold text-cnc-text transition hover:border-primary hover:text-primary"
                >
                  {city.name}
                  <span className="text-[12px] font-medium text-cnc-muted-soft">{city.uf}</span>
                  <span className="text-[12px] font-medium text-cnc-muted">
                    {formatAds(city.activeAds)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
