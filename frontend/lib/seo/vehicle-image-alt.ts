// frontend/lib/seo/vehicle-image-alt.ts
//
// Fase 4.3 (§12) — alt automático da imagem principal do anúncio:
//   "[Marca] [Modelo] [Ano] usado em [Cidade] - [UF]"
// Editável manualmente no admin depois. Espelha o helper do backend
// (src/modules/admin/ads/ad-seo-ai-score.js#buildAdImageAlt).

function clean(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function fourDigitYear(raw: string): string {
  const m = raw.match(/\d{4}/);
  return m ? m[0] : raw;
}

/**
 * Divide um rótulo "Cidade (UF)" em { city, state }. Tolerante a entradas
 * sem UF ("Cidade") ou neutras.
 */
export function splitCityState(label: string): { city: string; state: string } {
  const value = clean(label);
  const m = value.match(/^(.*?)\s*\(([A-Za-z]{2})\)\s*$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase() };
  return { city: value.split(" (")[0].trim(), state: "" };
}

export function buildVehicleImageAlt(input: {
  brand?: string;
  model?: string;
  year?: string | number;
  city?: string;
  state?: string;
}): string {
  const parts = [clean(input.brand), clean(input.model)].filter(Boolean);
  const year = fourDigitYear(clean(input.year));
  if (year) parts.push(year);

  let alt = parts.join(" ").trim();
  if (alt) alt += " usado";

  const city = clean(input.city);
  const state = clean(input.state);
  if (city) {
    alt += ` em ${city}`;
    if (state) alt += ` - ${state}`;
  }
  return alt.trim();
}
