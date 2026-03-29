/**
 * Origem do território ativo (somente runtime; não persistir como fonte de verdade).
 * Prioridade de bootstrap: `url` → `manual` → `cookie` → `fallback`.
 */
export type CitySource = "url" | "manual" | "cookie" | "fallback";

/**
 * Referência de cidade usada no City Engine (header, filtros, URLs).
 */
export type CityRef = {
  id?: number;
  slug: string;
  name: string;
  state: string;
  /** Ex.: "São Paulo (SP)" */
  label: string;
};

export function buildCityLabel(name: string, state: string): string {
  const n = name?.trim() || "Cidade";
  const s = state?.trim().toUpperCase().slice(0, 2) || "SP";
  if (n.includes("(")) return n;
  return `${n} (${s})`;
}

/** Id numérico de `cities.id` (API / cookie). */
export function normalizeCityId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  return undefined;
}

export function toCityRef(partial: {
  id?: number | string | null;
  slug?: string | null;
  name?: string | null;
  state?: string | null;
}): CityRef | null {
  const slug = String(partial.slug || "").trim();
  const name = String(partial.name || "").trim();
  const state = String(partial.state || "").trim().toUpperCase().slice(0, 2);
  if (!slug || !name) return null;
  return {
    id: normalizeCityId(partial.id),
    slug,
    name,
    state: state || "SP",
    label: buildCityLabel(name, state || "SP"),
  };
}
