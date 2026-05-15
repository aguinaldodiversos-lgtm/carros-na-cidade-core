/**
 * Contrato unificado de contexto territorial.
 *
 * Antes deste módulo, cada rota (Home, /comprar, /cidade, /carros-em,
 * /comprar/estado, /carros-usados/regiao) montava sua própria representação
 * de estado/cidade/região na mão, com derivações ligeiramente divergentes
 * (UF as vezes do meta, as vezes do slug; canonical via builders diferentes;
 * breadcrumbs hand-rolled). TerritoryContext é a fonte única que todas
 * as rotas territoriais devem consumir.
 *
 * Este arquivo só exporta tipos — é safe importar em client/server.
 * A resolução de fato vive em `territory-resolver.ts` (server-only).
 */

export type TerritoryLevel = "state" | "region" | "city";

export type TerritoryState = {
  /** UF de duas letras maiúsculas, ex: "SP". */
  code: string;
  /** UF lowercase para usar em URLs, ex: "sp". */
  slug: string;
  /** Nome completo, ex: "São Paulo". */
  name: string;
};

export type TerritoryRegionContext = {
  /** Slug da cidade-base (region é identificada pela cidade-pivot). */
  slug: string;
  /** Nome formatado: "Região de Atibaia". */
  name: string;
  baseCitySlug: string;
  /** Sempre [base, ...members] — o backend usa [0] como pivot para boost +60. */
  citySlugs: string[];
  cityNames: string[];
  radiusKm?: number;
};

export type TerritoryCityContext = {
  slug: string;
  name: string;
  /** UF de duas letras, ex: "SP". */
  state: string;
};

export type TerritoryBreadcrumb = { label: string; href: string };

export type TerritoryContext = {
  level: TerritoryLevel;
  state: TerritoryState;
  region?: TerritoryRegionContext;
  city?: TerritoryCityContext;
  /** Caminho relativo (sem origem). Caller monta absolute com toAbsoluteUrl(). */
  canonicalUrl: string;
  title: string;
  description: string;
  breadcrumbs: TerritoryBreadcrumb[];
};
