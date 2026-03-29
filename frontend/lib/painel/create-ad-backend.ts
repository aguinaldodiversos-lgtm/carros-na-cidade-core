/**
 * BFF → POST /api/ads (backend modular).
 *
 * Contrato espelha `validateCreateAdPayload` / `CreateAdSchema` em:
 *   `src/modules/ads/ads.validators.js`
 *
 * O backend resolve `advertiser_id` via sessão + `ensurePublishEligibility` — nunca envie
 * `advertiser_id` no JSON.
 *
 * Campos de veículo (`body_type`, `fuel_type`, `transmission`) aceitam rótulos livres no
 * JSON; o backend aplica `ads.storage-normalize` + enums canônicos (`ads.canonical.constants.js`).
 */
import type { AccountType } from "@/lib/dashboard-types";
import { resolveBackendApiUrl } from "@/lib/env/backend-api";

/**
 * Campos do wizard usados exclusivamente para montar o corpo de POST /api/ads.
 * Outros campos do FormData (fotos, opcionais, etc.) são ignorados por esta camada até
 * existir endpoint de mídia no mesmo contrato.
 */
export type PublishWizardInput = {
  cityId: string;
  brand: string;
  model: string;
  version: string;
  yearModel: string;
  mileage: string;
  price: string;
  fipeValue: string;
  city: string;
  state: string;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  title: string;
  description: string;
  acceptTerms: boolean;
};

/**
 * Corpo JSON oficial de criação — alinhado ao CreateAdSchema (snake_case).
 * @see src/modules/ads/ads.validators.js
 */
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

function buildDefaultTitle(n: PublishWizardInput): string {
  const parts = [n.yearModel, n.brand, n.model, n.version].filter(Boolean);
  const t = parts.join(" ").trim();
  return t.length >= 3 ? t : `${n.brand} ${n.model}`.trim() || "Anuncio veiculo";
}

/**
 * Monta o JSON enviado a POST /api/ads.
 * `city` / `state` vêm da cidade resolvida no backend público (fonte de verdade), não do texto livre do formulário.
 */
export function buildBackendCreateAdPayload(
  n: PublishWizardInput,
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

/** GET /api/public/cities/by-id/:id — valida city_id antes do publish. */
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

export function extractBackendErrorMessage(parsed: unknown, status: number): string {
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    const msg = o.message;
    if (typeof msg === "string" && msg.trim()) {
      const details = o.details;
      if (details && typeof details === "object") {
        const d = details as Record<string, unknown>;
        const code = d.code;
        const constraint = d.constraint;
        const suffix =
          typeof code === "string" && code
            ? ` [${code}${typeof constraint === "string" && constraint ? ` · ${constraint}` : ""}]`
            : "";
        return msg.trim() + suffix;
      }
      return msg.trim();
    }
    const err = o.error;
    if (typeof err === "string" && err.trim()) return err;
    if (err === true && typeof o.message === "string") return o.message;
  }
  return `Falha no backend (HTTP ${status}).`;
}
