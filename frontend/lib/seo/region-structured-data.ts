import { toAbsoluteUrl } from "./site";

/**
 * Builders puros de JSON-LD para a Página Regional
 * (`/carros-usados/regiao/[slug]`).
 *
 * Por que arquivo separado em vez de reusar `page-structured-data.ts`?
 *   - Aquele helper genérico não modela `Place` nem o relacionamento
 *     `CollectionPage.about → Place` que a Página Regional precisa para
 *     comunicar a intenção territorial ao Google.
 *   - Reusar `buildLocalSeoJsonLd` aqui acoplaria o schema regional ao
 *     formato de catálogo de cidade (que carrega `numberOfItems` da
 *     amostra). A Página Regional usa o `total` agregado da pagination
 *     do backend, não o tamanho do array — distinção semanticamente
 *     importante para SEO.
 *
 * Convenção:
 *   - Builders puros, sem side-effect. Recebem o que precisam e
 *     retornam `Record<string, unknown>` para serem serializados via
 *     `JSON.stringify` dentro de `<script type="application/ld+json">`.
 *   - Não inventar coordenadas, raio em km, nem números de anúncios
 *     que não vieram dos dados reais.
 */

export type RegionStructuredDataInput = {
  base: { slug: string; name: string; state: string };
  members: Array<{ slug: string; name: string; state: string }>;
  /** Total agregado do backend (pagination.total), não o tamanho da amostra. */
  totalAds: number;
  /** Raio em km efetivamente usado pelo backend. */
  radiusKm: number;
  /** Itens reais exibidos (amostra usada na grade). */
  sampleAds: Array<{
    slug?: string;
    title?: string;
    brand?: string;
    model?: string;
    year?: number;
  }>;
};

const SITE_NAME = "Carros na Cidade";

function regionPath(slug: string) {
  return `/carros-usados/regiao/${encodeURIComponent(slug)}`;
}

function cityPath(slug: string) {
  return `/carros-em/${encodeURIComponent(slug)}`;
}

function statePath(uf: string) {
  return `/comprar/estado/${uf.toLowerCase()}`;
}

function buildPageTitle(name: string, uf: string) {
  return `Carros usados na região de ${name}, ${uf.toUpperCase()}`;
}

function buildPageDescription(name: string, uf: string, totalAds: number, radiusKm: number) {
  if (totalAds > 0) {
    return `Veja ${totalAds} carro${totalAds === 1 ? "" : "s"} usado${totalAds === 1 ? "" : "s"} em ${name} e cidades próximas, com alcance regional de até ${radiusKm} km. Anúncios verificados de lojistas e particulares em ${uf.toUpperCase()}.`;
  }
  return `Veja carros usados em ${name} e cidades próximas, com alcance regional de até ${radiusKm} km. Anúncios verificados em ${uf.toUpperCase()}.`;
}

/**
 * Place: descreve a cidade-base como entidade territorial. Não inventamos
 * coordenadas (Google penaliza JSON-LD com lat/long fake). O `containedIn`
 * de SubdivisionAdministrative comunica que a região está em [UF, Brasil].
 */
export function buildRegionPlaceJsonLd(input: RegionStructuredDataInput) {
  const { base } = input;
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${base.name} e região`,
    address: {
      "@type": "PostalAddress",
      addressLocality: base.name,
      addressRegion: base.state.toUpperCase(),
      addressCountry: "BR",
    },
    containedInPlace: {
      "@type": "AdministrativeArea",
      name: base.state.toUpperCase(),
      address: {
        "@type": "PostalAddress",
        addressRegion: base.state.toUpperCase(),
        addressCountry: "BR",
      },
    },
  } as const;
}

/**
 * BreadcrumbList: Início → UF → Cidade-base → Região.
 * Reflete a estrutura visível na UI (region-page-view.tsx) e a
 * hierarquia territorial canônica do portal.
 */
export function buildRegionBreadcrumbJsonLd(input: RegionStructuredDataInput) {
  const { base } = input;
  const uf = base.state.toUpperCase();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Início",
        item: toAbsoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: uf,
        item: toAbsoluteUrl(statePath(uf)),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: base.name,
        item: toAbsoluteUrl(cityPath(base.slug)),
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `Região de ${base.name}`,
        item: toAbsoluteUrl(regionPath(base.slug)),
      },
    ],
  } as const;
}

/**
 * ItemList: representa os anúncios reais exibidos na grade. Limitamos a 12
 * para alinhar com a primeira página visível e evitar JSON-LD obeso.
 *
 * Não inventamos URLs canônicas de veículo aqui — apenas nome do item.
 * Cada item recebe `position` 1..N. Sem campos vazios.
 */
export function buildRegionItemListJsonLd(input: RegionStructuredDataInput) {
  const items = input.sampleAds.slice(0, 12).map((ad, index) => {
    const fallbackName =
      [ad.brand, ad.model, ad.year].filter(Boolean).join(" ").trim() ||
      `Veículo ${index + 1}`;
    return {
      "@type": "ListItem",
      position: index + 1,
      name: ad.title?.trim() || fallbackName,
    };
  });

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    itemListElement: items,
  } as const;
}

/**
 * CollectionPage principal — entidade-âncora que aponta para Place
 * (`about`) e ItemList (`mainEntity`). Mantemos `numberOfItems` na
 * ItemList aninhada para Google entender que a coleção tem N anúncios
 * exibidos e o `description` referencia o `totalAds` agregado.
 */
export function buildRegionCollectionPageJsonLd(input: RegionStructuredDataInput) {
  const { base } = input;
  const canonical = toAbsoluteUrl(regionPath(base.slug));
  const title = buildPageTitle(base.name, base.state);
  const description = buildPageDescription(
    base.name,
    base.state,
    input.totalAds,
    input.radiusKm
  );

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: canonical,
    inLanguage: "pt-BR",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: toAbsoluteUrl("/"),
    },
    about: buildRegionPlaceJsonLd(input),
    mainEntity: buildRegionItemListJsonLd(input),
  } as const;
}

/**
 * Builder agregado — retorna o array para `<script type="application/ld+json">`.
 *
 * Por que array em vez de @graph? Tanto Google quanto schema.org aceitam
 * múltiplos JSON-LD blocks na mesma página. Manter como objetos separados
 * (lista) facilita debug no rich-results-test (cada bloco pode ser
 * inspecionado isoladamente). `@graph` é mais elegante, mas no caso de
 * crawl falhar em um nó, ele invalida o grupo inteiro — array é mais
 * resiliente.
 */
export function buildRegionStructuredDataBlocks(input: RegionStructuredDataInput) {
  return [
    buildRegionCollectionPageJsonLd(input),
    buildRegionBreadcrumbJsonLd(input),
    buildRegionItemListJsonLd(input),
    buildRegionPlaceJsonLd(input),
  ] as const;
}

export const regionSeoCopy = {
  buildPageTitle,
  buildPageDescription,
};
