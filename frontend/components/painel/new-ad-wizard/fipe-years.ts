import type { FipeOption } from "@/lib/fipe/fipe-provider";

export function extractPrimaryYear(name: string): number | null {
  const m = name.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
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
