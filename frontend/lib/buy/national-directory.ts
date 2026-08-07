/**
 * Diretório nacional que alimenta `/comprar`.
 *
 * A fonte é o conjunto de cidades públicas — `SELECT DISTINCT cidade FROM ads
 * WHERE ativo` — o mesmo que o gate do middleware consulta para decidir 200 vs
 * 404. Não existe segunda lista: a página não pode oferecer um link que a
 * própria regra territorial vai barrar, e o inverso (esconder cidade que
 * existe) seria igualmente errado.
 *
 * Nada aqui tem cidade ou estado embutido. A ordem sai do estoque, e um
 * catálogo vazio produz um diretório vazio — não uma cidade padrão.
 */

import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";
import { cityContextFromSlug } from "@/lib/buy/territory-variant";
import { getCanonicalCityPath, isValidCanonicalCitySlug } from "@/lib/seo/canonical-city-path";

export interface NationalCityEntry {
  slug: string;
  name: string;
  uf: string;
  activeAds: number;
  href: string;
}

export interface NationalStateEntry {
  uf: string;
  name: string;
  activeAds: number;
  cities: number;
  href: string;
}

export interface NationalDirectory {
  states: NationalStateEntry[];
  cities: NationalCityEntry[];
  totalActiveAds: number;
  totalCities: number;
  /**
   * `false` quando o backend não respondeu. Distingue "o Brasil não tem
   * anúncio" de "não consegui saber" — a mesma distinção que o incidente dos
   * sitemaps de 2026-07-27 custou semanas para revelar. A página usa isto para
   * escolher a copy e para NÃO se declarar indexável com conteúdo degradado.
   */
  ok: boolean;
}

export const EMPTY_NATIONAL_DIRECTORY: NationalDirectory = {
  states: [],
  cities: [],
  totalActiveAds: 0,
  totalCities: 0,
  ok: false,
};

function stateNameOf(uf: string): string {
  return BRAZIL_UFS.find((entry) => entry.value === uf)?.label ?? uf;
}

/**
 * Derivação PURA — testável sem rede.
 *
 * @param cities mapa `slug → anúncios ativos`, como vem do backend.
 * @param cityLimit teto de cidades listadas. A página é chrome de descoberta,
 * não um índice: o sitemap é quem enumera tudo.
 */
export function buildNationalDirectory(
  cities: Record<string, number> | null,
  cityLimit = 60
): NationalDirectory {
  if (!cities) return EMPTY_NATIONAL_DIRECTORY;

  const entries: NationalCityEntry[] = [];

  for (const [rawSlug, rawTotal] of Object.entries(cities)) {
    const slug = String(rawSlug || "")
      .trim()
      .toLowerCase();
    const activeAds = Number(rawTotal) || 0;

    // A regra territorial em uma linha: sem anúncio ativo, a cidade não existe
    // como superfície pública e não pode receber link.
    if (activeAds <= 0) continue;
    if (!isValidCanonicalCitySlug(slug)) continue;

    const href = getCanonicalCityPath(slug);
    if (!href) continue;

    const ctx = cityContextFromSlug(slug);
    entries.push({ slug, name: ctx.name, uf: ctx.state, activeAds, href });
  }

  // Mais estoque primeiro; empate resolvido pelo nome para a ordem ser estável
  // entre requisições (ordem instável faria o HTML mudar sem o conteúdo mudar).
  entries.sort((a, b) => b.activeAds - a.activeAds || a.name.localeCompare(b.name, "pt-BR"));

  const byState = new Map<string, NationalStateEntry>();
  for (const city of entries) {
    const current = byState.get(city.uf);
    if (current) {
      current.activeAds += city.activeAds;
      current.cities += 1;
      continue;
    }
    byState.set(city.uf, {
      uf: city.uf,
      name: stateNameOf(city.uf),
      activeAds: city.activeAds,
      cities: 1,
      href: `/carros-usados/${city.uf.toLowerCase()}`,
    });
  }

  const states = [...byState.values()].sort(
    (a, b) => b.activeAds - a.activeAds || a.name.localeCompare(b.name, "pt-BR")
  );

  return {
    states,
    cities: entries.slice(0, Math.max(0, cityLimit)),
    totalActiveAds: entries.reduce((sum, city) => sum + city.activeAds, 0),
    totalCities: entries.length,
    ok: true,
  };
}
