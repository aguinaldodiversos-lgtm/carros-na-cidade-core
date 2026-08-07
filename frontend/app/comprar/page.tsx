import type { Metadata } from "next";
import Link from "next/link";

import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { buildNationalDirectory, EMPTY_NATIONAL_DIRECTORY } from "@/lib/buy/national-directory";
import { fetchPublicCitySet } from "@/lib/city/public-city-set";
import { toAbsoluteUrl } from "@/lib/seo/site";

/**
 * `/comprar` — VITRINE NACIONAL. Página final, não redirector.
 *
 * ── O que era ────────────────────────────────────────────────────────────────
 * Um redirector puro: resolvia um estado por cookie (ou caía no default SP) e
 * redirecionava. Três problemas, todos medidos na auditoria:
 *
 *   1. A MESMA URL devolvia destino diferente por visitante. Redirect
 *      não-determinístico não é canonicalizável — o Google vê um destino, o
 *      usuário vê outro, e nenhum dos dois é "a página /comprar".
 *   2. `redirect()` em Server Component do Next 14.2 pode comitar 200 com
 *      `<meta http-equiv="refresh">`. Para o crawler isso é uma página 200 sem
 *      canonical própria — que então herda a da home.
 *   3. Sem território, o default era um estado fixo. Quem pedia "comprar" e
 *      não tinha cookie recebia SP.
 *
 * ── O que é ──────────────────────────────────────────────────────────────────
 * HTTP 200, H1/title/description próprios, canonical autorreferente, e conteúdo
 * REAL: os estados e as cidades que têm anúncio ativo, com a contagem, saindo
 * do mesmo conjunto que o gate territorial usa para decidir 200 vs 404. É
 * também o destino do 308 de `/anuncios`.
 *
 * As versões parametrizadas legadas (`?city_slug=`, `?state=`) saem daqui com
 * 308 real para o destino final — no `middleware.ts`, antes de qualquer HTML
 * (`decideComprarLegacyQueryRedirect`).
 *
 * Nenhuma cidade é privilegiada: a ordem é por estoque, e catálogo vazio produz
 * página vazia — nunca uma cidade padrão.
 */

export const dynamic = "force-dynamic";

const TITLE = "Comprar carros usados e seminovos no Brasil";
const DESCRIPTION =
  "Veja onde há carros usados e seminovos à venda no Carros na Cidade: estados e cidades com anúncios ativos, com o catálogo local de cada uma.";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: TITLE,
    description: DESCRIPTION,
    // Autorreferente. Antes esta rota não declarava canonical nenhuma e, como
    // não era destino final, o crawler acabava associando-a à da home.
    alternates: { canonical: "/comprar" },
    robots: { index: true, follow: true },
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: toAbsoluteUrl("/comprar"),
      type: "website",
      locale: "pt_BR",
    },
  };
}

function formatAds(total: number): string {
  return total === 1 ? "1 anúncio" : `${total.toLocaleString("pt-BR")} anúncios`;
}

export default async function ComprarNacionalPage() {
  const citySet = await fetchPublicCitySet();
  const directory = citySet
    ? buildNationalDirectory(citySet.cities)
    : EMPTY_NATIONAL_DIRECTORY;

  const breadcrumbItems = [{ name: "Home", href: "/" }, { name: "Comprar" }];

  return (
    <>
      <BreadcrumbJsonLd items={breadcrumbItems} />

      <div className="bg-cnc-bg pb-24 md:pb-12">
        <div className="mx-auto w-full max-w-[1180px] px-4 pt-6 sm:px-5">
          <header>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[32px]">
              Carros usados e seminovos à venda no Brasil
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-cnc-muted sm:text-[15px]">
              {directory.ok && directory.totalCities > 0
                ? `São ${formatAds(directory.totalActiveAds)} ativos em ${
                    directory.totalCities === 1
                      ? "1 cidade"
                      : `${directory.totalCities.toLocaleString("pt-BR")} cidades`
                  }. Escolha o estado ou a cidade para ver o catálogo local, com preço, ano e quilometragem de cada veículo.`
                : "Estamos atualizando o catálogo. Assim que houver anúncios ativos, as cidades aparecem aqui com o número de veículos disponíveis."}
            </p>
          </header>

          {directory.states.length > 0 ? (
            <section aria-labelledby="estados" className="mt-8">
              <h2
                id="estados"
                className="text-[18px] font-extrabold text-cnc-text-strong sm:text-[20px]"
              >
                Estados com anúncios ativos
              </h2>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {directory.states.map((state) => (
                  <li key={state.uf}>
                    <Link
                      href={state.href}
                      className="flex items-baseline justify-between gap-3 rounded-xl border border-cnc-line bg-white px-4 py-3 transition hover:border-primary"
                    >
                      <span className="truncate text-[15px] font-bold text-cnc-text-strong">
                        {state.name}
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-cnc-muted">
                        {formatAds(state.activeAds)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {directory.cities.length > 0 ? (
            <section aria-labelledby="cidades" className="mt-10">
              <h2
                id="cidades"
                className="text-[18px] font-extrabold text-cnc-text-strong sm:text-[20px]"
              >
                Cidades com anúncios ativos
              </h2>
              <p className="mt-1 text-[13.5px] leading-6 text-cnc-muted">
                Uma cidade entra nesta lista quando recebe o primeiro anúncio ativo, e sai quando
                fica sem nenhum.
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {directory.cities.map((city) => (
                  <li key={city.slug}>
                    <Link
                      href={city.href}
                      className="flex items-baseline justify-between gap-3 rounded-xl border border-cnc-line bg-white px-4 py-3 transition hover:border-primary"
                    >
                      <span className="min-w-0 truncate text-[15px] font-bold text-cnc-text-strong">
                        {city.name}
                        <span className="ml-1.5 text-[12.5px] font-semibold text-cnc-muted-soft">
                          {city.uf}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] font-semibold text-cnc-muted">
                        {formatAds(city.activeAds)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
