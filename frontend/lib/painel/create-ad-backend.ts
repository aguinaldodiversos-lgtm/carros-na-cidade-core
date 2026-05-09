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
 * Campos do wizard usados para montar o corpo de POST /api/ads.
 * Fotos: o BFF envia primeiro para `POST /api/ads/upload-images` (R2); em dev, fallback para `public/uploads/ads`.
 */
export type PublishWizardInput = {
  cityId: string;
  brand: string;
  model: string;
  version: string;
  yearModel: string;
  mileage: string;
  price: string;
  /**
   * `fipeValue` é o valor monetário formatado que o cliente vê na UI
   * (após `fetchFipeQuote`). NÃO é fonte autoritativa — o backend o
   * trata como `client_hint_value` e ignora para decisão de risco.
   */
  fipeValue: string;
  /**
   * Códigos canônicos da Tabela FIPE (parallelum). Quando presentes,
   * permitem que o Backend FIPE Service cote o veículo server-side com
   * `confidence='high'` (ver `src/modules/fipe/fipe.service.js`). Sem
   * eles, o backend usa `FIPE_UNAVAILABLE` — não bloqueia publicação,
   * mas também não consegue detectar preço abaixo da FIPE.
   */
  fipeBrandCode?: string;
  fipeModelCode?: string;
  fipeYearCode?: string;
  fipeCode?: string;
  fipeReferenceMonth?: string;
  fipeVehicleType?: string;
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
  /**
   * Valor FIPE consultado no wizard. Aceito apenas como hint informativo
   * de baixa confiança — o Backend FIPE Service ignora como fonte
   * autoritativa (anti-spoof). Para o backend cotar com confidence='high',
   * passe os códigos canônicos abaixo.
   */
  fipe_value?: number | null;
  /**
   * Códigos canônicos da FIPE (parallelum). Quando enviados, o backend
   * cota server-side e detecta automaticamente preço abaixo da FIPE.
   */
  fipe_brand_code?: string;
  fipe_model_code?: string;
  fipe_year_code?: string;
  fipe_code?: string;
  fipe_reference_month?: string;
  vehicle_type?: "carros" | "motos" | "caminhoes";
  images?: string[];
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
  accountType: AccountType,
  imageUrls: string[] = []
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

  const cleanedUrls = imageUrls
    .map((u) => u.trim())
    .filter((u) => u.length > 0)
    .slice(0, 24);

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
    fipe_value: fipe > 0 ? fipe : null,
    // Códigos canônicos: incluídos APENAS quando não vazios. Permitem ao
    // Backend FIPE Service cotar server-side e atingir confidence='high'.
    ...(n.fipeBrandCode?.trim() ? { fipe_brand_code: n.fipeBrandCode.trim() } : {}),
    ...(n.fipeModelCode?.trim() ? { fipe_model_code: n.fipeModelCode.trim() } : {}),
    ...(n.fipeYearCode?.trim() ? { fipe_year_code: n.fipeYearCode.trim() } : {}),
    ...(n.fipeCode?.trim() ? { fipe_code: n.fipeCode.trim() } : {}),
    ...(n.fipeReferenceMonth?.trim()
      ? { fipe_reference_month: n.fipeReferenceMonth.trim() }
      : {}),
    ...(n.fipeVehicleType === "motos" || n.fipeVehicleType === "caminhoes"
      ? { vehicle_type: n.fipeVehicleType }
      : {}),
    ...(cleanedUrls.length > 0 ? { images: cleanedUrls } : {}),
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
    typeof idRaw === "number" ? idRaw : typeof idRaw === "string" ? parseInt(idRaw, 10) : NaN;
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

export type CityResolutionResult =
  | { ok: true; city: ResolvedCityRow }
  | { ok: false; reason: "not_found" | "backend_error" | "rate_limited"; status?: number };

/** GET /api/public/cities/by-id/:id — valida city_id antes do publish. */
export async function fetchResolvedCityByIdFromBackend(
  cityId: number,
  fallbackUf?: string,
  extraHeaders?: Record<string, string>
): Promise<CityResolutionResult> {
  const url = resolveBackendApiUrl(
    `/api/public/cities/by-id/${encodeURIComponent(String(cityId))}`
  );
  if (!url) return { ok: false, reason: "backend_error" };
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...extraHeaders },
      cache: "no-store",
    });
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited", status: 429 };
    }
    if (res.status === 404) {
      return { ok: false, reason: "not_found", status: 404 };
    }
    if (!res.ok) {
      return { ok: false, reason: "backend_error", status: res.status };
    }
    const json = await res.json();
    const city = parseResolvedCityPayload(json, fallbackUf);
    if (!city) return { ok: false, reason: "not_found" };
    return { ok: true, city };
  } catch {
    return { ok: false, reason: "backend_error" };
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
