import type { ListingCar } from "@/lib/car-data";
import { buyCars } from "@/lib/car-data";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { normalizeVehicleGalleryImages } from "@/lib/vehicle/detail-utils";

export type SellerDealer = {
  type: "dealer";
  name: string;
  logo: string;
  address: string;
  rating: number;
  phone?: string;
  storeSlug: string;
};

export type SellerPrivate = {
  type: "private";
  name: string;
  phone?: string;
};

export type SellerInfo = SellerDealer | SellerPrivate;

export type VehicleDetail = {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version: string;
  fullName: string;
  price: string;
  /** Valor numérico do preço (BRL), quando derivado do anúncio */
  priceNumeric: number | null;
  condition: "Novo" | "Usado";
  year: string;
  km: string;
  fuel: string;
  transmission: string;
  bodyType: string;
  color: string;
  city: string;
  citySlug: string;
  adCode: string;
  /** ISO 8601 quando disponível na API */
  adPublishedAt: string | null;
  /** ISO 8601 quando disponível e diferente da publicação */
  adUpdatedAt: string | null;
  isBelowFipe: boolean;
  fipePrice: string;
  /** Diferença anúncio − referência FIPE estimada (BRL); negativo = abaixo da referência */
  fipeDeltaBrl: number | null;
  /** Mesma diferença em % sobre a referência estimada */
  fipeDeltaPercent: number | null;
  /** Plano pago ou destaque ativo (para carrossel e prioridades de conversão) */
  isPaidListing: boolean;
  /** ID do anunciante na base, quando disponível */
  advertiserId: string | null;
  images: string[];
  hasRealImages: boolean;
  description: string;
  optionalItems: string[];
  safetyItems: string[];
  comfortItems: string[];
  sellerNotes: string;
  seller: SellerInfo;
};

/** Rótulos para exibição no detalhe do anúncio (pt-BR). */
export function formatListingDateLabels(
  publishedIso: string | null | undefined,
  updatedIso: string | null | undefined
): { primary: string; secondary?: string } {
  const published = publishedIso ? new Date(publishedIso) : null;
  const updated = updatedIso ? new Date(updatedIso) : null;

  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const pubOk = published && Number.isFinite(published.getTime());
  const updOk = updated && Number.isFinite(updated.getTime());

  if (pubOk) {
    const primary = `Publicado em ${fmt.format(published!)}`;
    if (updOk && Math.abs(updated!.getTime() - published!.getTime()) > 86_400_000) {
      return { primary, secondary: `Atualizado em ${fmt.format(updated!)}` };
    }
    return { primary };
  }

  if (updOk) {
    return { primary: `Última atualização em ${fmt.format(updated!)}` };
  }

  return { primary: "" };
}

const FALLBACK_IMAGES = ["/images/vehicle-placeholder.svg"];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toTitleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sanitizeText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

function sanitizeNullableText(value: unknown) {
  const text = sanitizeText(value);
  return text || null;
}

function isMeaningfulVehicleText(value: unknown) {
  const text = sanitizeText(value).toLowerCase();
  if (!text) return false;

  const blockedSnippets = [
    "sem nenhum detalhe",
    "sem detalhes",
    "lorem ipsum",
    "teste",
    "placeholder",
    "dummy",
    "rascunho",
    "em atualização",
    "temporariamente indispon",
  ];

  return !blockedSnippets.some((snippet) => text.includes(snippet));
}

function formatPrice(value?: number | string | null) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(
            String(value)
              .replace(/[^\d,.-]/g, "")
              .replace(/\.(?=\d{3}(\D|$))/g, "")
              .replace(",", ".")
          )
        : NaN;

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "R$ 0";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(numeric);
}

function toNumber(value?: number | string | null) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = Number(
    value
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
  );

  return Number.isFinite(normalized) ? normalized : null;
}

function formatYear(value?: number | string | null) {
  if (typeof value === "number" && value > 0) {
    return `${value}/${value}`;
  }

  const raw = sanitizeText(value);
  if (!raw) return "Ano não informado";
  return raw.includes("/") ? raw : `${raw}/${raw}`;
}

function formatMileage(value?: number | string | null) {
  const numeric = toNumber(value);
  if (!numeric || numeric <= 0) return "Km não informado";
  return `${numeric.toLocaleString("pt-BR")} km`;
}

function deriveCityDisplay(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "São Paulo");
  const cleanState = sanitizeText(state, "SP").toUpperCase();

  if (cleanCity.includes("(")) {
    return cleanCity;
  }

  return `${toTitleCase(cleanCity)} (${cleanState})`;
}

function deriveCitySlug(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city, "sao paulo");
  const cleanState = sanitizeText(state, "sp").toLowerCase();
  return slugify(`${cleanCity} ${cleanState}`);
}

function parseImages(ad: PublicAdDetail): string[] {
  return normalizeVehicleGalleryImages([
    ad.images,
    ad.image_url,
    ad.cover_image,
    ad.thumbnail,
    ad.photo,
  ]);
}

/**
 * Remove tokens de ano (4 dígitos) e padrões "ano/ano" (ex.: "2020/2021")
 * do título — a página de detalhe já exibe o ano em bloco separado, então
 * carregar o ano dentro do título causa duplicação pública ("Onix Hatch
 * 2020 ... 2020 · 41.000 km").
 */
function stripYearTokens(text: string): string {
  return text
    .replace(/\b(?:19|20)\d{2}\s*\/\s*(?:19|20)\d{2}\b/g, "")
    .replace(/\b(?:19|20)\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function deriveVehicleNames(ad: PublicAdDetail) {
  const title = sanitizeText(ad.title);
  const brand = sanitizeText(ad.brand);
  const model = sanitizeText(ad.model);
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);

  const titleWithoutYear = stripYearTokens(title);

  const fullName =
    titleWithoutYear ||
    stripYearTokens([brand, model, version].filter(Boolean).join(" ")) ||
    "Veículo";

  const safeModel = model || title || [brand, model].filter(Boolean).join(" ").trim() || "Veículo";

  return {
    brand: toTitleCase(brand),
    model: toTitleCase(stripYearTokens(safeModel)),
    version,
    fullName,
  };
}

/**
 * Cruza o câmbio declarado (`ad.transmission`) com a versão (`ad.version`)
 * e o título: se a versão diz "Mec." / "Manual" mas o câmbio veio como
 * "Automático" (ou vice-versa), a versão é a fonte mais confiável (vem do
 * código de identificação do veículo). Devolve "Manual" / "Automático" /
 * o valor original sanitizado quando não há sinal contraditório.
 *
 * Mantém o tipo de fix limitado à renderização — a normalização real
 * deveria ser feita no backend/wizard de cadastro, mas até lá o detalhe
 * público não pode mostrar dados contraditórios.
 */
function reconcileTransmission(ad: PublicAdDetail): string {
  const declared = sanitizeText(ad.transmission, "Não informado");
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);
  const title = sanitizeText(ad.title);
  const haystack = `${version} ${title}`.toLowerCase();

  const versionSaysManual = /\b(mec\.?|manual)\b/.test(haystack);
  const versionSaysAuto = /\b(aut\.?|automátic|automatic|cvt|dct|dsg)\b/.test(haystack);
  const declaredLower = declared.toLowerCase();
  const declaredIsAuto = /(aut|cvt|dct|dsg)/.test(declaredLower);
  const declaredIsManual = /(mec|manual)/.test(declaredLower);

  if (versionSaysManual && declaredIsAuto) return "Manual";
  if (versionSaysAuto && declaredIsManual) return "Automático";

  return declared;
}

/**
 * Cruza a carroceria declarada (`ad.body_type`) com modelo/título: se o
 * modelo diz "Hatch" mas o body_type veio como "Sedan" (caso real do
 * Onix Hatch sinalizado por usuários), o modelo é a fonte mais confiável.
 */
function reconcileBodyType(ad: PublicAdDetail): string {
  const declared = sanitizeText(ad.body_type, "Não informado");
  const model = sanitizeText(ad.model);
  const title = sanitizeText(ad.title);
  const haystack = `${model} ${title}`.toLowerCase();

  const modelSays = (() => {
    if (/\bhatch\b/.test(haystack)) return "Hatch";
    if (/\bsed(?:an|ã|ane|\.)?\b/.test(haystack)) return "Sedã";
    if (/\bsuv\b/.test(haystack)) return "SUV";
    if (/\b(picape|pickup)\b/.test(haystack)) return "Picape";
    if (/\bcoup[eé]\b/.test(haystack)) return "Coupé";
    return null;
  })();

  if (!modelSays) return declared;

  const declaredLower = declared.toLowerCase();
  const matches =
    (modelSays === "Hatch" && /hatch/.test(declaredLower)) ||
    (modelSays === "Sedã" && /(sed|sedã)/.test(declaredLower)) ||
    (modelSays === "SUV" && /suv/.test(declaredLower)) ||
    (modelSays === "Picape" && /(picape|pickup)/.test(declaredLower)) ||
    (modelSays === "Coupé" && /coup/.test(declaredLower));

  if (declared === "Não informado" || !matches) {
    return modelSays;
  }
  return declared;
}

function buildFipeReferenceAmount(price: number | null, belowFipe: boolean): number | null {
  if (!price || price <= 0) return null;

  return belowFipe ? Math.round(price / 0.95) : Math.round(price * 1.04);
}

function buildFipeReference(price: number | null, belowFipe: boolean) {
  const estimated = buildFipeReferenceAmount(price, belowFipe);
  if (estimated == null) return "Consulte";
  return formatPrice(estimated);
}

function computeIsPaidListing(
  plan: string | null | undefined,
  highlightUntil: string | null | undefined
): boolean {
  if (highlightUntil) {
    const t = new Date(highlightUntil).getTime();
    if (Number.isFinite(t) && t > Date.now()) return true;
  }

  const p = (plan || "free").toLowerCase().trim();
  if (!p || p === "free") return false;
  if (p.includes("free-essential") || p.includes("cpf-free")) return false;
  return true;
}

function advertiserIdFromAd(ad: PublicAdDetail): string | null {
  const v = ad.advertiser_id;
  if (v == null || v === "") return null;
  return String(v);
}

function buildSellerInfo(ad: PublicAdDetail): SellerInfo {
  const dealershipName = sanitizeText(
    (ad as PublicAdDetail & { dealership_name?: string | null }).dealership_name
  );
  const sellerName =
    sanitizeText((ad as PublicAdDetail & { seller_name?: string | null }).seller_name) ||
    dealershipName ||
    "Anunciante no Carros na Cidade";

  const sellerPhone =
    sanitizeNullableText(ad.whatsapp_number) ||
    sanitizeNullableText((ad as PublicAdDetail & { whatsapp?: string | null }).whatsapp) ||
    sanitizeNullableText((ad as PublicAdDetail & { phone?: string | null }).phone) ||
    undefined;

  const plan = sanitizeText(ad.plan).toLowerCase();
  const sellerType = sanitizeText(
    (ad as PublicAdDetail & { seller_type?: string | null }).seller_type
  ).toLowerCase();
  // Detecção de loja: amplia o sinal para `seller_type` (dealer/dealership/
  // premium/basic) — antes só plan/dealership_name eram considerados, então
  // anúncios cadastrados como loja mas sem plan pago apareciam como
  // "particular" no detalhe público.
  const isDealer =
    Boolean(dealershipName) ||
    sellerType === "dealer" ||
    sellerType === "dealership" ||
    sellerType === "loja" ||
    sellerType === "premium" ||
    sellerType === "basic" ||
    plan.includes("premium") ||
    plan.includes("pro") ||
    plan.includes("plus") ||
    plan.includes("master") ||
    plan.includes("dealer");

  if (isDealer) {
    const cityDisplay = deriveCityDisplay(ad.city, ad.state);

    return {
      type: "dealer",
      name: sellerName,
      logo: SITE_LOGO_SRC,
      address: cityDisplay,
      rating: 4.8,
      phone: sellerPhone,
      storeSlug: slugify(sellerName || "lojista"),
    };
  }

  return {
    type: "private",
    name: sellerName,
    phone: sellerPhone,
  };
}

function buildOptionalItems(ad: PublicAdDetail) {
  // Usa as versões reconciliadas (cruzando com modelo/versão) para nunca
  // listar "Câmbio Automático" quando a versão diz "Mec.", e "Carroceria
  // Sedan" quando o modelo é "Onix Hatch".
  const transmission = reconcileTransmission(ad);
  const bodyType = reconcileBodyType(ad);
  const items = [
    transmission && transmission !== "Não informado" ? `Câmbio ${transmission}` : null,
    ad.fuel_type ? `Combustível ${sanitizeText(ad.fuel_type)}` : null,
    bodyType && bodyType !== "Não informado" ? `Carroceria ${bodyType}` : null,
    ad.below_fipe ? "Preço competitivo em relação à FIPE" : null,
  ].filter(Boolean) as string[];

  return Array.from(new Set(items)).slice(0, 6);
}

function buildSafetyItems() {
  return [
    "Veja o veículo pessoalmente e confira a documentação antes de qualquer pagamento.",
    "Desconfie de pedidos de adiantamento e de ofertas muito abaixo do mercado.",
    "Se possível, faça vistoria cautelar antes de concluir a compra.",
  ];
}

function buildComfortItems(ad: PublicAdDetail) {
  const transmission = reconcileTransmission(ad);
  const items = [
    ad.city ? `Disponível em ${toTitleCase(sanitizeText(ad.city))}` : null,
    transmission && transmission !== "Não informado" ? `Versão ${transmission}` : null,
    ad.fuel_type ? `Motorização ${sanitizeText(ad.fuel_type)}` : null,
  ].filter(Boolean) as string[];

  return Array.from(new Set(items)).slice(0, 6);
}

export function adaptAdDetailToVehicle(ad: PublicAdDetail): VehicleDetail {
  const id = sanitizeText(ad.id, "sem-id");
  const slug = sanitizeText(ad.slug, slugify(id) || "veiculo");
  const images = parseImages(ad);
  const priceNumber = toNumber(ad.price);
  const belowFipe = ad.below_fipe === true;
  const { brand, model, version, fullName } = deriveVehicleNames(ad);
  const city = deriveCityDisplay(ad.city, ad.state);
  const citySlug = sanitizeNullableText(ad.city_slug) || deriveCitySlug(ad.city, ad.state);
  const seller = buildSellerInfo(ad);

  const publishedRaw = sanitizeNullableText(ad.created_at);
  const updatedRaw = sanitizeNullableText(ad.updated_at);

  const refAmount = buildFipeReferenceAmount(priceNumber, belowFipe);
  const fipeDeltaBrl = refAmount != null && priceNumber != null ? priceNumber - refAmount : null;
  const fipeDeltaPercent =
    refAmount != null && refAmount > 0 && fipeDeltaBrl != null
      ? (fipeDeltaBrl / refAmount) * 100
      : null;

  const isPaidListing = computeIsPaidListing(ad.plan, ad.highlight_until);
  const advertiserId = advertiserIdFromAd(ad);
  const safeDescription = isMeaningfulVehicleText(ad.description)
    ? sanitizeText(ad.description)
    : "Consulte o anunciante para confirmar opcionais, histórico e disponibilidade deste veículo.";

  return {
    id,
    slug,
    brand,
    model,
    version,
    fullName,
    price: formatPrice(ad.price),
    priceNumeric: priceNumber,
    condition: "Usado",
    year: formatYear(ad.year),
    km: formatMileage(ad.mileage),
    fuel: sanitizeText(ad.fuel_type, "Não informado"),
    transmission: reconcileTransmission(ad),
    bodyType: reconcileBodyType(ad),
    color: sanitizeText((ad as PublicAdDetail & { color?: string | null }).color, "Não informado"),
    city,
    citySlug,
    adCode: id,
    adPublishedAt: publishedRaw,
    adUpdatedAt: updatedRaw,
    isBelowFipe: belowFipe,
    fipePrice: buildFipeReference(priceNumber, belowFipe),
    fipeDeltaBrl,
    fipeDeltaPercent,
    isPaidListing,
    advertiserId,
    images,
    hasRealImages: images.length > 0,
    description: safeDescription,
    optionalItems: buildOptionalItems(ad),
    safetyItems: buildSafetyItems(),
    comfortItems: buildComfortItems(ad),
    sellerNotes:
      "Confirme com o anunciante as condições do veículo, opcionais, documentação e disponibilidade antes de fechar negócio.",
    seller,
  };
}

function toListingCarFromSeed(seed: ListingCar, vehicle: VehicleDetail, index: number): ListingCar {
  return {
    ...seed,
    id: `${seed.id}-${vehicle.id}-${index}`,
    slug: seed.slug || `${slugify(seed.model)}-${vehicle.id}-${index}`,
    city: vehicle.city,
    image: vehicle.images[0] || FALLBACK_IMAGES[index % FALLBACK_IMAGES.length] || seed.image,
  };
}

export function buildCityVehicles(vehicle: VehicleDetail, limit = 6): ListingCar[] {
  return buyCars.slice(0, limit).map((seed, index) => toListingCarFromSeed(seed, vehicle, index));
}

export function buildSimilarVehicles(vehicle: VehicleDetail, limit = 8): ListingCar[] {
  return buyCars
    .filter((seed) => slugify(seed.model) !== slugify(vehicle.model))
    .slice(0, limit)
    .map((seed, index) => toListingCarFromSeed(seed, vehicle, index + 100));
}

export function buildSellerVehicles(vehicle: VehicleDetail, limit = 6): ListingCar[] {
  if (vehicle.seller.type !== "dealer") {
    return [];
  }

  return buyCars.slice(0, limit).map((seed, index) => ({
    ...toListingCarFromSeed(seed, vehicle, index + 200),
    city: vehicle.city,
  }));
}
