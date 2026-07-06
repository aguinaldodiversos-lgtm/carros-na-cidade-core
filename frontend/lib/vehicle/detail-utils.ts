import { getBackendApiExplicitEnvUrl } from "@/lib/env/backend-api";

const BRAZIL_COUNTRY_CODE = "55";

export const VEHICLE_IMAGE_PLACEHOLDER = "/images/vehicle-placeholder.svg";
export const VEHICLE_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "heic",
  "heif",
] as const;
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

/**
 * Lê o base URL público do R2 a cada chamada (em vez de uma const no top-level)
 * para que testes possam manipular `process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
 * via beforeEach/afterEach. O custo é trivial.
 */
function readPublicR2BaseUrl(): string {
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
}

/**
 * Lê on-demand para o mesmo motivo de `readPublicR2BaseUrl`. Mantém testes
 * com beforeEach/afterEach honestos.
 */
function isLegacyImageProxyEnabled(): boolean {
  const v = process.env.PUBLIC_EMIT_LEGACY_IMAGE_PROXY;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return process.env.NODE_ENV !== "production";
}

function encodeKeyForUrl(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Resolve uma chave R2 (`storage_key`) para a URL pública servida.
 *
 * Caminho preferido: URL absoluta no CDN público do R2 — não toca o Render,
 * preserva outbound bandwidth do origin.
 *
 * Fallback: proxy `/api/vehicle-images?key=...` na mesma origem do app. Esse
 * caminho deve ser raro em produção (significa que `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
 * não está setada) e desde a refatoração do 2026-05-13 o handler responde
 * com 302/placeholder em vez de stream — protegendo o origin de qualquer jeito.
 */
export function buildVehicleImageProxyUrlFromStorageKey(key: string): string | null {
  const normalized = String(key ?? "")
    .trim()
    .replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) return null;

  const publicBase = readPublicR2BaseUrl();
  if (publicBase) {
    return `${publicBase}/${encodeKeyForUrl(normalized)}`;
  }
  return `${VEHICLE_IMAGE_PROXY_PATH}?key=${encodeURIComponent(normalized)}`;
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

  // Re-hidrata um ?key= legado para a URL pública R2 direta sempre que possível.
  // Anúncios criados antes do fix do bandwidth podem ter `/api/vehicle-images?key=...`
  // persistido no banco; reciclamos para CDN direto em runtime.
  const buildFromKey = (key: string | null) => {
    if (!key) return null;
    return buildVehicleImageProxyUrlFromStorageKey(decodeUrlComponentSafely(key));
  };

  if (raw.startsWith(`${VEHICLE_IMAGE_PROXY_PATH}?`)) {
    const params = new URLSearchParams(raw.split("?")[1] || "");
    const fromKey = buildFromKey(params.get("key"));
    if (fromKey) return fromKey;
    return buildFromSrc(params.get("src")) || safeUrl(raw);
  }

  if (!/^https?:\/\//i.test(raw)) return null;

  try {
    const parsed = new URL(raw);
    if (parsed.pathname !== VEHICLE_IMAGE_PROXY_PATH) return null;
    const fromKey = buildFromKey(parsed.searchParams.get("key"));
    if (fromKey) return fromKey;
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
    if (!isSupportedVehicleImageUrl(raw)) return null;
    // Em produção (legacyImageProxy=false) /uploads/ é um caminho que serve bytes
    // pelo Render — não pode ser o padrão. Retornar null faz o VehicleImage cair
    // no placeholder. Em dev mantém o proxy para compatibilidade com seed local.
    return isLegacyImageProxyEnabled() ? buildVehicleImageProxyUrl(raw) : null;
  }

  if (raw.startsWith("images/") || raw.startsWith("uploads/")) {
    const normalizedLocalPath = `/${raw.replace(/^\/+/, "")}`;
    if (!isSupportedVehicleImageUrl(normalizedLocalPath)) return null;
    if (normalizedLocalPath.startsWith("/uploads/")) {
      return isLegacyImageProxyEnabled() ? buildVehicleImageProxyUrl(normalizedLocalPath) : null;
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
      const storageKey = record.storage_key ?? record.storageKey;
      if (typeof storageKey === "string" && storageKey.trim()) {
        const fromKey = buildVehicleImageProxyUrlFromStorageKey(storageKey.trim());
        if (fromKey) normalized.add(fromKey);
      }
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
      if (Array.isArray(record.photos)) record.photos.forEach(visit);
      if (Array.isArray(record.images)) record.images.forEach(visit);
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
  cover_image_url?: unknown;
  cover_image?: unknown;
  images?: unknown;
  photos?: unknown;
  gallery?: unknown;
  storage_key?: unknown;
}): string {
  const ordered = normalizeVehicleGalleryImages([
    fields.image_url,
    fields.cover_image_url,
    fields.image,
    fields.cover_image,
    typeof fields.storage_key === "string" && fields.storage_key.trim()
      ? { storage_key: fields.storage_key }
      : null,
    fields.images,
    fields.photos,
    fields.gallery,
  ]);
  if (ordered.length > 0) return ordered[0];
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

/**
 * H1 dinâmico da página de veículo (SEO): "Marca Modelo Versão Ano à venda em
 * Cidade - UF" (ex.: "Fiat Argo Drive 1.0 2024 à venda em Atibaia - SP").
 * Substitui o antigo <h1> genérico "Detalhes do veículo", igual em todos os
 * anúncios. `fullName` já é "marca modelo versão" sem ano, então o ano entra
 * logo após. Cidade ausente ("Localização não informada") → omite o "em ...".
 */
export function buildVehicleH1(params: {
  fullName: string;
  model?: string;
  year?: string;
  city?: string;
}): string {
  const name = (params.fullName || params.model || "Veículo").trim();
  const yearRaw = (params.year || "").split("/")[0]?.trim() ?? "";
  const year = yearRaw && yearRaw !== "Ano não informado" ? yearRaw : "";
  const cityRaw =
    params.city && params.city.trim() && params.city !== "Localização não informada"
      ? params.city.trim()
      : "";
  // "Atibaia (SP)" → "Atibaia - SP"
  const cityLabel = cityRaw.replace(/\s*\(([A-Za-z]{2})\)\s*$/, " - $1");

  const head = [name, year].filter(Boolean).join(" ");
  return cityLabel ? `${head} à venda em ${cityLabel}` : `${head} à venda`;
}

// Prefixo de GRUPO econômico ("GM - ", "VW - ", "FIAT - ") que às vezes vem
// grudado na marca. Exige espaços ao redor do traço para NÃO cortar marcas
// compostas ("Mercedes-Benz", "Rolls-Royce", "Land Rover" não têm " - ").
const BRAND_GROUP_PREFIX_RE = /^[A-Za-zÀ-ÿ]{2,6}\s+[-–]\s+/;

/** Remove o prefixo de grupo da marca ("GM - Chevrolet" → "Chevrolet"). */
export function stripBrandGroupPrefix(brand: string): string {
  const raw = String(brand || "").trim();
  const cleaned = raw.replace(BRAND_GROUP_PREFIX_RE, "").trim();
  return cleaned || raw;
}

function normalizeTrimToken(token: string): string {
  const alpha = token.replace(/[^A-Za-zÀ-ÿ]/g, "");
  // Siglas curtas (LT, LTZ, GT, XEI, GLX) ficam em CAIXA ALTA; nomes maiores
  // (Touring, Sport, Highline, Line) em Title Case.
  if (alpha.length <= 3) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * Divide a versão em "trim" (versão principal — ex.: "LT", "Touring", "GT Line")
 * e "specs" (motor/detalhes — ex.: "1.0 12V Flex 5p Mec."). O trim são os tokens
 * alfabéticos ANTES do primeiro token que contém dígito (cilindrada/portas).
 * Se a versão já começa pelo motor (ex.: "1.0 12V Flex"), o trim fica vazio.
 * Trim limitado a 2 tokens para não engolir specs.
 */
export function splitVersionTrim(version: string): { trim: string; specs: string } {
  const tokens = String(version || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const trimTokens: string[] = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    if (/\d/.test(tokens[i])) break;
    trimTokens.push(tokens[i]);
    if (trimTokens.length >= 2) {
      i++;
      break;
    }
  }
  return {
    trim: trimTokens.map(normalizeTrimToken).join(" "),
    specs: tokens.slice(i).join(" "),
  };
}

/**
 * H1 VISÍVEL curto (estilo Webmotors): "Marca Modelo Trim" — ex.:
 * "Chevrolet Onix Hatch LT". Remove o prefixo de grupo ("GM - "), o motor,
 * o ano e a cidade (que continuam no <title> de SEO, no JSON-LD e no conteúdo).
 * Mantém marca + modelo para SEO on-page. Deduplica tokens repetidos (ex.:
 * trim já presente no modelo).
 */
export function buildShortVehicleH1(params: {
  brand?: string;
  model?: string;
  version?: string;
}): string {
  const brand = stripBrandGroupPrefix(String(params.brand || ""));
  const model = String(params.model || "").trim();
  const { trim } = splitVersionTrim(String(params.version || ""));

  const seen = new Set<string>();
  const deduped = [brand, model, trim]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return deduped.join(" ") || model || brand || "Veículo";
}

export function estimateMonthlyPayment(
  vehicleValue: number,
  months = 60,
  entryRatio = 0.2
): number {
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
