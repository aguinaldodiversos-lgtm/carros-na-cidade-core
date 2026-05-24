/**
 * Label territorial único para cards/breadcrumbs/headers — briefing P2 2026-05-25.
 *
 * Consolida o que `deriveCityDisplay` faz para o detalhe + variantes
 * para regional. Substitui composições ad-hoc tipo
 * `` `${city} (${state})` `` que vazavam null/"undefined" quando
 * algum campo estava ausente.
 *
 * Regras:
 *   - city + state preenchidos → "Cidade (UF)"
 *   - city presente, state ausente → "Cidade"
 *   - state presente, city ausente → "UF"
 *   - region (base + members) → "Cidade-base e região"
 *   - nenhum → "Localização não informada"
 *
 * NUNCA default para "São Paulo (SP)" — antes era um bug recorrente que
 * mostrava anúncio de Atibaia como sendo de SP quando backend omitia city.
 */

export interface TerritoryInput {
  city?: string | null;
  state?: string | null;
}

export interface RegionTerritoryInput {
  region: {
    base: { name: string; state?: string | null };
    /** Quantidade de cidades vizinhas (alias de region.members.length). */
    memberCount?: number;
  };
}

type TerritoryArg = TerritoryInput | RegionTerritoryInput;

const ABSENT_LABEL = "Localização não informada";

function isRegionInput(value: TerritoryArg): value is RegionTerritoryInput {
  return typeof (value as RegionTerritoryInput).region === "object";
}

function sanitize(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      // Preserva siglas em CAPS (UFs em meio de texto: "Sao Paulo SP")
      if (lower.length === 2 && /^[a-z]{2}$/.test(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

export function buildPublicTerritoryLabel(input: TerritoryArg | null | undefined): string {
  if (!input) return ABSENT_LABEL;

  if (isRegionInput(input)) {
    const baseName = sanitize(input.region.base?.name);
    if (!baseName) return ABSENT_LABEL;
    const count = Number(input.region.memberCount || 0);
    if (count > 0) return `${toTitleCase(baseName)} e região`;
    return toTitleCase(baseName);
  }

  const city = sanitize(input.city);
  const state = sanitize(input.state).toUpperCase();

  if (!city && !state) return ABSENT_LABEL;
  // Se city já contém parenteses (formato pre-composto "Cidade (UF)"),
  // preserva sem re-format — defesa contra double-format.
  if (city && city.includes("(")) return city;
  if (city && state) return `${toTitleCase(city)} (${state})`;
  if (city) return toTitleCase(city);
  return state;
}
