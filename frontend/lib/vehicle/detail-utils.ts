import { getBackendApiExplicitEnvUrl } from "@/lib/env/backend-api";

const BRAZIL_COUNTRY_CODE = "55";

export const VEHICLE_IMAGE_PLACEHOLDER = "/images/vehicle-placeholder.svg";
export const VEHICLE_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "heic", "heif"] as const;
export const VEHICLE_IMAGE_PROXY_PATH = "/api/vehicle-images";

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function safeUrl(value: string): string {
  try {
    return encodeURI(value);
  } catch {
    return value;
  }
}

function getBackendBaseUrl(): string {
  const explicit = getBackendApiExplicitEnvUrl();
  if (explicit) {
    return explicit;
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "";
}

function joinWithBase(baseUrl: string, pathname: string): string {
  if (!baseUrl) {
    return pathname;
  }

  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function buildVehicleImageProxyUrl(pathname: string): string {
  return `${VEHICLE_IMAGE_PROXY_PATH}?src=${encodeURIComponent(pathname)}`;
}

function decodeUrlComponentSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeExistingVehicleProxyUrl(value: string): string | null {
  const raw = safeText(value);
  if (!raw) return null;

  const buildFromSrc = (src: string | null) => {
    if (!src) return null;
    const decodedSrc = decodeUrlComponentSafely(src);
    return decodedSrc.startsWith("/uploads/") ? buildVehicleImageProxyUrl(decodedSrc) : null;
  };

  if (raw.startsWith(`${VEHICLE_IMAGE_PROXY_PATH}?`)) {
    const params = new URLSearchParams(raw.split("?")[1] || "");
    return buildFromSrc(params.get("src")) || safeUrl(raw);
  }

  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.pathname !== VEHICLE_IMAGE_PROXY_PATH) return null;
    return buildFromSrc(parsed.searchParams.get("src")) || safeUrl(raw);
  } catch {
    return null;
  }
}

function isKnownPlaceholderImage(value: string): boolean {
  const normalized = normalizePathSeparators(value).toLowerCase();

  return [
    VEHICLE_IMAGE_PLACEHOLDER.toLowerCase(),
    "/images/hero.jpeg",
    "/images/banner1.jpg",
    "/images/banner2.jpg",
    "/images/corolla.jpeg",
    "/images/civic.jpeg",
    "/images/compass.jpeg",
    "/images/hb20.jpeg",
  ].some((placeholder) => normalized === placeholder || normalized.endsWith(placeholder));
}

function hasSupportedExtension(pathname: string): boolean {
  const cleanPath = normalizePathSeparators(pathname).split("?")[0]?.split("#")[0] || "";
  const fileName = cleanPath.split("/").pop() || "";
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;

  if (!extension) {
    return true;
  }

  return VEHICLE_IMAGE_EXTENSIONS.includes(extension as (typeof VEHICLE_IMAGE_EXTENSIONS)[number]);
}

export function isSupportedVehicleImageUrl(value: string): boolean {
  const url = normalizePathSeparators(safeText(value));
  if (!url) return false;

  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return hasSupportedExtension(parsed.pathname);
    } catch {
      return false;
    }
  }

  if (url.startsWith("//")) {
    return isSupportedVehicleImageUrl(`https:${url}`);
  }

  if (url.startsWith("/")) {
    return hasSupportedExtension(url);
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return hasSupportedExtension(url);
  }

  return false;
}

export function normalizeVehicleImageUrl(value: unknown): string | null {
  const raw = normalizePathSeparators(safeText(value));

  if (!raw) return null;
  if (["null", "undefined", "[object Object]"].includes(raw)) return null;
  if (isKnownPlaceholderImage(raw)) return null;

  const proxiedUrl = normalizeExistingVehicleProxyUrl(raw);
  if (proxiedUrl) return proxiedUrl;

  if (raw.startsWith("data:image/") || raw.startsWith("blob:")) {
    return raw;
  }

  if (raw.startsWith("//")) {
    return safeUrl(`https:${raw}`);
  }

  if (/^https?:\/\//i.test(raw)) {
    return isSupportedVehicleImageUrl(raw) ? safeUrl(raw) : null;
  }

  if (raw.startsWith("/images/")) {
    return isSupportedVehicleImageUrl(raw) ? raw : null;
  }

  if (raw.startsWith("/uploads/")) {
    return isSupportedVehicleImageUrl(raw) ? buildVehicleImageProxyUrl(raw) : null;
  }

  if (raw.startsWith("images/") || raw.startsWith("uploads/")) {
    const normalizedLocalPath = `/${raw.replace(/^\/+/, "")}`;
    if (!isSupportedVehicleImageUrl(normalizedLocalPath)) return null;
    if (normalizedLocalPath.startsWith("/uploads/")) {
      return buildVehicleImageProxyUrl(normalizedLocalPath);
    }
    return safeUrl(normalizedLocalPath);
  }

  if (!raw.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    const normalizedLocalPath = `/${raw.replace(/^\/+/, "")}`;
    return isSupportedVehicleImageUrl(normalizedLocalPath) ? safeUrl(normalizedLocalPath) : null;
  }

  const backendBaseUrl = getBackendBaseUrl();

  if (raw.startsWith("/")) {
    const normalized = joinWithBase(backendBaseUrl, raw);
    return isSupportedVehicleImageUrl(normalized) ? safeUrl(normalized) : null;
  }

  const normalized = joinWithBase(backendBaseUrl, raw);
  return isSupportedVehicleImageUrl(normalized) ? safeUrl(normalized) : null;
}

export function collectVehicleImageCandidates(...values: unknown[]): string[] {
  const normalized = new Set<string>();

  const visit = (input: unknown) => {
    if (input == null) return;

    if (Array.isArray(input)) {
      input.forEach(visit);
      return;
    }

    if (typeof input === "string") {
      const raw = input.trim();
      if (!raw) return;

      const directImageUrl = normalizeVehicleImageUrl(raw);
      if (directImageUrl) {
        normalized.add(directImageUrl);
        return;
      }

      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          visit(parsed);
          return;
        } catch {
          // segue para o parser CSV abaixo
        }
      }

      raw
        .split(/[\n,;]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const imageUrl = normalizeVehicleImageUrl(part);
          if (imageUrl) normalized.add(imageUrl);
        });
      return;
    }

    if (typeof input === "object") {
      const record = input as Record<string, unknown>;
      [
        record.url,
        record.src,
        record.image,
        record.image_url,
        record.cover_image,
        record.thumbnail,
        record.thumb,
        record.photo,
        record.large,
        record.original,
        record.path,
        record.pathname,
        record.file,
      ].forEach(visit);
      return;
    }

    const imageUrl = normalizeVehicleImageUrl(input);
    if (imageUrl) normalized.add(imageUrl);
  };

  values.forEach(visit);

  return Array.from(normalized);
}

export function normalizeVehicleGalleryImages(images: unknown[]): string[] {
  return collectVehicleImageCandidates(images).filter((image) => !isKnownPlaceholderImage(image));
}

/** Imagem pública de listagem quando não há foto válida (SVG leve, não hero). */
export const LISTING_CARD_FALLBACK_IMAGE = "/images/vehicle-placeholder.svg";

/**
 * Primeira URL utilizável para cards de listagem/busca (comprar, busca, home).
 * Converte `/uploads/...` para o proxy `/api/vehicle-images?...` como na página de detalhe.
 */
export function resolvePublicListingImageUrl(fields: {
  image?: unknown;
  image_url?: unknown;
  cover_image?: unknown;
  images?: unknown;
}): string {
  const list = normalizeVehicleGalleryImages([
    fields.image,
    fields.image_url,
    fields.cover_image,
    fields.images,
  ]);
  if (list.length > 0) return list[0];
  return LISTING_CARD_FALLBACK_IMAGE;
}

export function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeBrazilPhone(value?: string | null): string | null {
  const rawDigits = digitsOnly(value || "").replace(/^0+/, "");
  if (!rawDigits) return null;

  if (rawDigits.startsWith(BRAZIL_COUNTRY_CODE)) {
    const localDigits = rawDigits.slice(BRAZIL_COUNTRY_CODE.length);
    if (localDigits.length === 10 || localDigits.length === 11) {
      return rawDigits;
    }
  }

  if (rawDigits.length === 10 || rawDigits.length === 11) {
    return `${BRAZIL_COUNTRY_CODE}${rawDigits}`;
  }

  return null;
}

export function formatPhoneDisplay(value?: string | null): string | null {
  const normalized = normalizeBrazilPhone(value);
  if (!normalized) return null;

  const localDigits = normalized.slice(BRAZIL_COUNTRY_CODE.length);
  const ddd = localDigits.slice(0, 2);
  const number = localDigits.slice(2);

  if (number.length === 9) {
    return `(${ddd}) ${number.slice(0, 5)}-${number.slice(5)}`;
  }

  if (number.length === 8) {
    return `(${ddd}) ${number.slice(0, 4)}-${number.slice(4)}`;
  }

  return null;
}

export function buildVehicleWhatsappHref({
  phone,
  vehicleName,
}: {
  phone?: string | null;
  vehicleName: string;
}): string | null {
  const normalizedPhone = normalizeBrazilPhone(phone);
  if (!normalizedPhone) return null;

  const text = encodeURIComponent(
    `Olá, vi seu anúncio no Carros na Cidade e tenho interesse no veículo ${vehicleName}.`
  );

  return `https://wa.me/${normalizedPhone}?text=${text}`;
}

export function buildFinanceLink(
  vehicleId: string,
  citySlug: string,
  vehiclePrice?: number | null
): string {
  const params = new URLSearchParams({
    veiculo: vehicleId,
  });

  if (vehiclePrice != null && vehiclePrice > 0) {
    params.set("valor", String(Math.round(vehiclePrice)));
  }

  return `/simulador-financiamento/${encodeURIComponent(citySlug)}?${params.toString()}`;
}

export function estimateMonthlyPayment(vehicleValue: number, months = 60, entryRatio = 0.2): number {
  const entry = vehicleValue * entryRatio;
  const financed = Math.max(vehicleValue - entry, 0);
  const monthlyRate = 1.99 / 100;

  if (financed <= 0 || months <= 0) return 0;

  return (financed * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

export function formatBrl(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits,
  }).format(value);
}
