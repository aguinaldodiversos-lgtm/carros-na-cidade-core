/**
 * Mapeia o wizard de anúncio para o payload esperado pelo backend
 * (`validateCreateAdPayload` em `src/modules/ads/ads.validators.js`).
 */
import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export type WizardNormalizedFields = {
  sellerType: string;
  brand: string;
  model: string;
  version: string;
  yearModel: string;
  yearManufacture: string;
  mileage: string;
  price: string;
  fipeValue: string;
  city: string;
  state: string;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  color: string;
  plateFinal: string;
  title: string;
  description: string;
  whatsapp: string;
  phone: string;
  acceptTerms: boolean;
  armored: boolean;
  optionalFeatures: string;
  conditionFlags: string;
  boostOptionId: string;
  photoCount: number;
};

/** Mesma lógica do backend `slugify` (NFD + minúsculas + hífens). */
export function slugifyForCity(text: string): string {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parsePriceBr(value: string): number {
  if (!value?.trim()) return 0;
  const cleaned = value
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseMileageInt(value: string): number {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseYear(value: string): number {
  const n = parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) {
    return new Date().getFullYear();
  }
  return n;
}

export type BackendCreateAdPayload = {
  title: string;
  description?: string | null;
  price: number;
  city_id: number;
  city: string;
  state: string;
  brand: string;
  model: string;
  year: number;
  mileage: number;
  category?: string | null;
  body_type?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  below_fipe: boolean;
};

function buildDefaultTitle(n: WizardNormalizedFields): string {
  const parts = [n.yearModel, n.brand, n.model, n.version].filter(Boolean);
  const t = parts.join(" ").trim();
  return t.length >= 3 ? t : `${n.brand} ${n.model}`.trim() || "Anuncio veiculo";
}

export function buildBackendCreateAdPayload(
  n: WizardNormalizedFields,
  cityId: number
): BackendCreateAdPayload {
  const price = parsePriceBr(n.price);
  const mileage = parseMileageInt(n.mileage);
  const year = parseYear(n.yearModel);
  const titleRaw = n.title?.trim() || buildDefaultTitle(n);
  const title = titleRaw.length >= 3 ? titleRaw : buildDefaultTitle(n);

  const fipe = parsePriceBr(n.fipeValue);
  const belowFipe = fipe > 0 && price > 0 && price < fipe;

  const state = n.state.trim().toUpperCase().slice(0, 2);
  const city = n.city.trim();

  const description = n.description?.trim() || null;

  return {
    title,
    description,
    price,
    city_id: cityId,
    city,
    state,
    brand: n.brand.trim(),
    model: n.model.trim(),
    year,
    mileage,
    category: n.sellerType === "lojista" ? "lojista" : "particular",
    body_type: n.bodyStyle?.trim() || null,
    fuel_type: n.fuel?.trim() || null,
    transmission: n.transmission?.trim() || null,
    below_fipe: belowFipe,
  };
}

/**
 * Resolve `city_id` via página pública da cidade (mesmo slug usado em /cidade/[slug]).
 */
export async function resolveCityIdFromBackend(city: string, state: string): Promise<number | null> {
  const uf = state.trim().toLowerCase();
  const slugCity = slugifyForCity(city);
  const candidates = [
    `${slugCity}-${uf}`,
    slugifyForCity(`${city} ${state}`),
    slugCity,
  ].filter((s, i, arr) => s && arr.indexOf(s) === i);

  for (const slug of candidates) {
    const url = resolveBackendApiUrl(`/api/public/cities/${encodeURIComponent(slug)}`);
    if (!url) continue;
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        data?: { city?: { id?: number | string } };
      };
      const raw = json?.data?.city?.id;
      if (typeof raw === "number" && Number.isFinite(raw)) return raw;
      if (typeof raw === "string") {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      // tenta próximo slug
    }
  }

  return null;
}

export function extractBackendErrorMessage(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    const err = o.error;
    if (typeof err === "string" && err.trim()) return err;
    if (err === true && typeof o.message === "string") return o.message;
  }
  return `Falha no backend (HTTP ${status}).`;
}
