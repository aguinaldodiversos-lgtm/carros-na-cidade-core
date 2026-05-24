/**
 * Formatador único de preço para superfícies públicas — briefing P2 2026-05-25.
 *
 * Substitui as 3 cópias locais (`formatBrl` em `vehicle/related-ads.ts` e
 * `vehicle/detail-utils.ts`, `formatPrice` em `vehicle/public-vehicle.ts`)
 * por uma única função com semântica explícita do que fazer quando o
 * preço é ausente/zero.
 *
 * Regras:
 *   - número finito > 0          → "R$ 89.900"
 *   - número 0 / null / undefined → "Sob consulta" (default)
 *   - string ("89900" / "R$ 89.900") → coage para número e segue regras acima
 *   - NUNCA "R$ 0"
 *   - NUNCA double-format ("R$ 89.9" virando "R$ 89,90")
 *
 * Pode ser configurado para devolver `null` em vez de "Sob consulta"
 * quando o caller quer omitir o elemento de preço inteiro (ex.: card
 * que esconde linha quando preço ausente). Default mantém o texto para
 * dar pista visual ao usuário.
 */

export interface FormatPricePublicOptions {
  /**
   * O que devolver quando o preço é ausente/0.
   *
   *   - "default" (padrão) → "Sob consulta"
   *   - "empty"            → "" (string vazia — caller esconde elemento)
   *   - "null"             → null (caller faz `if (price) render`)
   */
  whenAbsent?: "default" | "empty" | "null";
}

const ABSENT_TEXT = "Sob consulta";

function parseNumeric(value: number | string | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    // milhares (pt-BR): "89.900" → "89900"; "89.900,00" → "89900,00"
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatPricePublic(
  value: number | string | null | undefined,
  options: FormatPricePublicOptions = {}
): string | null {
  const whenAbsent = options.whenAbsent ?? "default";
  const numeric = parseNumeric(value);

  if (numeric == null || numeric <= 0) {
    if (whenAbsent === "null") return null;
    if (whenAbsent === "empty") return "";
    return ABSENT_TEXT;
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}
