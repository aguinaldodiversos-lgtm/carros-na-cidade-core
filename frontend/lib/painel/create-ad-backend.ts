/**
 * Mapeia o wizard de anúncio para o payload esperado pelo backend
 * (`validateCreateAdPayload` em `src/modules/ads/ads.validators.js`).
 */
import type { AccountType } from "@/lib/dashboard-types";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export type WizardNormalizedFields = {
  /** id enviado pelo wizard quando o usuário escolhe uma cidade na lista */
  cityId: string;
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

export type ResolvedCityRow = {
  id: number;
  name: string;
  state: string;
  slug?: string;
};

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
  resolved: ResolvedCityRow,
  accountType: AccountType
): BackendCreateAdPayload {
  const price = parsePriceBr(n.price);
  const mileage = parseMileageInt(n.mileage);
  const year = parseYear(n.yearModel);
  const titleRaw = n.title?.trim() || buildDefaultTitle(n);
  const title = titleRaw.length >= 3 ? titleRaw : buildDefaultTitle(n);

  const fipe = parsePriceBr(n.fipeValue);
  const belowFipe = fipe > 0 && price > 0 && price < fipe;

  const state = String(resolved.state ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const city = String(resolved.name ?? "").trim();

  const description = n.description?.trim() || null;

  return {
    title,
    description,
    price,
    city_id: resolved.id,
    city,
    state,
    brand: n.brand.trim(),
    model: n.model.trim(),
    year,
    mileage,
    category: accountType === "CNPJ" ? "lojista" : "particular",
    body_type: n.bodyStyle?.trim() || null,
    fuel_type: n.fuel?.trim() || null,
    transmission: n.transmission?.trim() || null,
    below_fipe: belowFipe,
  };
}

function parseResolvedCityPayload(json: unknown, fallbackUf?: string): ResolvedCityRow | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const data = o.data;
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const idRaw = d.id;
  const id =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string"
        ? parseInt(idRaw, 10)
        : NaN;
  if (!Number.isFinite(id) || id <= 0) return null;
  const name = typeof d.name === "string" ? d.name.trim() : "";
  let state = typeof d.state === "string" ? d.state.trim() : "";
  if (!state && fallbackUf) {
    state = fallbackUf.trim().toUpperCase().slice(0, 2);
  }
  if (!name || !state) return null;
  return {
    id,
    name,
    state,
    slug: typeof d.slug === "string" ? d.slug : undefined,
  };
}

/** Resolve cidade por id (validação quando o wizard envia city_id). */
export async function fetchResolvedCityByIdFromBackend(
  cityId: number,
  fallbackUf?: string
): Promise<ResolvedCityRow | null> {
  const url = resolveBackendApiUrl(`/api/public/cities/by-id/${encodeURIComponent(String(cityId))}`);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return parseResolvedCityPayload(json, fallbackUf);
  } catch {
    return null;
  }
}

/**
 * Resolve cidade na base (endpoint dedicado + fallback por slug da página pública).
 */
export async function resolveCityFromBackend(city: string, state: string): Promise<ResolvedCityRow | null> {
  const uf = state.trim().toUpperCase().slice(0, 2);
  const q = city.trim();
  if (!q || uf.length !== 2) return null;

  const primary = resolveBackendApiUrl(
    `/api/public/cities/resolve?${new URLSearchParams({ q, uf }).toString()}`
  );
  if (primary) {
    try {
      const res = await fetch(primary, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        const parsed = parseResolvedCityPayload(json, uf);
        if (parsed) return parsed;
      }
    } catch {
      // fallback abaixo
    }
  }

  const ufLower = uf.toLowerCase();
  const slugCity = slugifyForCity(q);
  const candidates = [
    `${slugCity}-${ufLower}`,
    slugifyForCity(`${q} ${uf}`),
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
        data?: { city?: { id?: number | string; name?: string; state?: string } };
      };
      const c = json?.data?.city;
      if (!c?.id) continue;
      const id =
        typeof c.id === "number" ? c.id : typeof c.id === "string" ? parseInt(c.id, 10) : NaN;
      if (!Number.isFinite(id) || id <= 0) continue;
      const name = typeof c.name === "string" ? c.name.trim() : "";
      let st = typeof c.state === "string" ? c.state.trim() : "";
      if (!st) st = uf;
      if (!name || !st) continue;
      return { id, name, state: st };
    } catch {
      // próximo slug
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
