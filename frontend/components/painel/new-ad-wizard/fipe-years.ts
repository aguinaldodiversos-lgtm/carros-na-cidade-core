import type { FipeOption } from "@/lib/fipe/fipe-provider";

export function extractPrimaryYear(name: string): number | null {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * O endpoint público da Tabela FIPE (parallelum) não separa modelo de
 * variante: devolve uma lista plana com nomes como
 *   "AMAROK CD2.0 16V/S CD2.0 16V TDI 4x2 Die"
 *   "Gol (novo) 1.0 Mi Total Flex 8V 2p"
 * Volkswagen vem com ~547 entradas que são, na verdade, ~37 modelos
 * base com várias variantes cada. Renderizar 547 `<option>` no select
 * de "Modelo" trava o renderer em mobile (screenshot timeout 30s no
 * dev local) e gera UX ruim — usuário não consegue achar o carro.
 *
 * `extractModelBase` extrai o "primeiro pedaço" do nome, normalizado.
 * Testado com nomes reais do parallelum:
 *   "AMAROK CD2.0..."          → "AMAROK"
 *   "Gol (novo) 1.0..."        → "GOL"
 *   "up! 1.0 Total Flex..."    → "UP!"
 *   "New Beetle 2.0..."        → "NEW BEETLE"
 *
 * Para "New Beetle"/"Grand Saveiro" preserva a 2ª palavra quando a 1ª é
 * curta (≤3 letras maiúsculas tipo "NEW", "GRAND") — caso contrário
 * cada Beetle vira uma "marca-base" diferente.
 */
const SHORT_PREFIXES = new Set(["NEW", "GRAND", "AMG", "OLD"]);

export function extractModelBase(name: string): string {
  if (!name) return "";
  // Tira pontuação e parênteses pra base do nome.
  const cleaned = name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(/\s/);
  const first = parts[0]?.toUpperCase() || "";
  if (!first) return "";
  if (SHORT_PREFIXES.has(first) && parts[1]) {
    return `${first} ${parts[1].toUpperCase()}`;
  }
  return first;
}

export function uniqueModelBases(options: FipeOption[]): string[] {
  const set = new Set<string>();
  for (const opt of options) {
    const base = extractModelBase(opt.name);
    if (base) set.add(base);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function variantsOfBase(options: FipeOption[], base: string): FipeOption[] {
  if (!base) return [];
  return options.filter((opt) => extractModelBase(opt.name) === base);
}

export function uniqueModelYears(options: FipeOption[]): number[] {
  const set = new Set<number>();
  for (const opt of options) {
    const y = extractPrimaryYear(opt.name);
    if (y) set.add(y);
  }
  return Array.from(set).sort((a, b) => b - a);
}

export function versionsForYear(options: FipeOption[], year: number | null): FipeOption[] {
  if (year == null) return [];
  return options.filter((opt) => extractPrimaryYear(opt.name) === year);
}

export function fabricationYearChoices(modelYear: number | null): number[] {
  if (modelYear == null) return [];
  const current = new Date().getFullYear();
  const max = Math.min(current + 1, modelYear + 1);
  const out: number[] = [];
  for (let y = modelYear - 1; y <= max; y += 1) {
    if (y >= 1980 && y <= current + 1) out.push(y);
  }
  return out.reverse();
}
