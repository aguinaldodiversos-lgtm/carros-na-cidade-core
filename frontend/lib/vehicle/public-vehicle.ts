import type { ListingCar } from "@/lib/car-data";
import { buyCars } from "@/lib/car-data";
import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import {
  buildSelectedOptionGroups,
  buildTrustBadges,
  extractSelectedKeys,
  TRUST_BADGE_KEYS,
  type OptionGroup,
  type TrustBadge,
} from "@/lib/ads/vehicle-options";
import { buildPublicTerritoryLabel, formatPricePublic } from "@/lib/public-contracts";
import { SITE_LOGO_SRC } from "@/lib/site/brand-assets";
import { normalizeVehicleGalleryImages } from "@/lib/vehicle/detail-utils";
import { resolveSellerKind } from "@/lib/vehicle/seller-kind";

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
  /**
   * True quando o backend marcou o anúncio como aprovado por moderação
   * após sinal de preço abaixo da FIPE. Frontend exibe selo "Anúncio
   * analisado" — nunca como "garantia". False/undefined → sem selo.
   */
  reviewedAfterBelowFipe: boolean;
  images: string[];
  hasRealImages: boolean;
  description: string;
  optionalItems: string[];
  safetyItems: string[];
  comfortItems: string[];
  /**
   * Opcionais selecionados pelo anunciante, agrupados por categoria
   * (Conforto/Dirigibilidade/Segurança), categorias vazias omitidas. Vazio
   * quando o anúncio não tem opcionais salvos — nesse caso a UI cai no bloco
   * derivado (`optionalItems`).
   */
  vehicleOptionGroups: OptionGroup[];
  /**
   * Selos de PROCEDÊNCIA marcados pelo anunciante (Único dono, Revisões,
   * Manual/Chave reserva, Laudo cautelar...), extraídos de `vehicle_options`
   * e REMOVIDOS de `vehicleOptionGroups` para não duplicar. Vazio quando o
   * anúncio não marcou nenhuma chave de procedência. Nunca contém selo falso.
   */
  trustBadges: TrustBadge[];
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
    .replace(/[̀-ͯ]/g, "")
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

/**
 * Display textual de "Cidade (UF)" para o detalhe e cards de loja.
 *
 * P2-E 2026-05-25: agora delega ao contrato público único
 * `buildPublicTerritoryLabel` — antes era cópia local com a mesma lógica.
 * A função do contrato já garante: nunca default "São Paulo (SP)"; nunca
 * double-format quando city já vem como "Cidade (UF)".
 */
function deriveCityDisplay(city?: string | null, state?: string | null) {
  return buildPublicTerritoryLabel({ city, state });
}

/**
 * Slug canônico "cidade-uf" para hrefs e fetch de relacionados.
 *
 * Briefing P0 2026-05-24: SEM defaults "sao-paulo-sp" quando o anúncio
 * não tem cidade — gerava `/veiculo/<slug>` cujo link "Mais carros em
 * São Paulo" apontava pra cidade errada.
 *
 * Retorna string vazia quando ambos os inputs estão ausentes —
 * `fetchRelatedListingsForAdPage` já trata `citySlug` falsy como
 * "sem proximidade conhecida".
 */
function deriveCitySlug(city?: string | null, state?: string | null) {
  const cleanCity = sanitizeText(city);
  const cleanState = sanitizeText(state).toLowerCase();
  if (!cleanCity && !cleanState) return "";
  return slugify(`${cleanCity} ${cleanState}`.trim());
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

/**
 * Colapsa um token de COMBUSTÍVEL imediatamente repetido no título/nome, ex.:
 * "Onix 1.0 6V Flex Flex" → "Onix 1.0 6V Flex". A duplicação nasce no backend,
 * que monta o título concatenando a versão (que já termina em "Flex") + o
 * `fuel_type` ("Flex"). Corrigimos só na renderização (o título histórico no
 * banco não muda), preservando o combustível de quem tinha uma ocorrência só.
 *
 * Restrito a palavras de combustível conhecidas (case/acento-insensível) para
 * nunca remover repetições legítimas de outros tokens. Cobre Flex, Gasolina,
 * Etanol/Álcool, Diesel, Elétrico, Híbrido, GNV.
 */
const FUEL_WORDS = [
  "flex",
  "flexivel",
  "gasolina",
  "etanol",
  "alcool",
  "diesel",
  "eletrico",
  "hibrido",
  "gnv",
];

function foldAccents(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function dedupeFuelToken(text: string): string {
  const parts = String(text || "").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const word of parts) {
    const prev = out[out.length - 1];
    const folded = foldAccents(word.replace(/[.,;]+$/, ""));
    if (
      prev &&
      FUEL_WORDS.includes(folded) &&
      foldAccents(prev.replace(/[.,;]+$/, "")) === folded
    ) {
      continue; // pula o combustível repetido em sequência
    }
    out.push(word);
  }
  return out.join(" ");
}

function deriveVehicleNames(ad: PublicAdDetail) {
  const title = sanitizeText(ad.title);
  const brand = sanitizeText(ad.brand);
  const model = sanitizeText(ad.model);
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);

  const titleWithoutYear = stripYearTokens(title);

  const fullNameRaw =
    titleWithoutYear ||
    stripYearTokens([brand, model, version].filter(Boolean).join(" ")) ||
    "Veículo";
  // Corrige o combustível duplicado ("...6V Flex Flex") que vem do título
  // montado no backend. Propaga para H1, subtítulo, JSON-LD name e meta title.
  const fullName = dedupeFuelToken(fullNameRaw);

  const safeModel = model || title || [brand, model].filter(Boolean).join(" ").trim() || "Veículo";

  return {
    brand: toTitleCase(brand),
    model: toTitleCase(stripYearTokens(safeModel)),
    version: dedupeFuelToken(version),
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

/**
 * ── Fase A (paliativo do bug de câmbio/carroceria hardcoded) ─────────────────
 *
 * CAUSA RAIZ: o wizard de cadastro grava `transmission="Automático"` e
 * `body_type="Sedã"` como DEFAULT hardcoded (não há campo para o anunciante
 * informar). O único sinal REAL de câmbio é o opcional que ele marca
 * (`cambio_*`). Carroceria não é capturada em lugar nenhum.
 *
 * Enquanto o cadastro não é corrigido (Fase B), estas funções derivam câmbio
 * e carroceria de fontes confiáveis para a EXIBIÇÃO **e** o JSON-LD (mesma
 * `VehicleDetail` alimenta os dois) — nunca chutando "Sedã"/"Automático".
 */
const UNKNOWN_SPEC = "Não informado";

const CAMBIO_OPTION_LABELS: Record<string, string> = {
  cambio_manual: "Manual",
  cambio_automatico: "Automático",
  cambio_cvt: "Automático (CVT)",
  cambio_automatizado: "Automatizado",
};

/**
 * Câmbio a partir do que o anunciante REALMENTE marcou nos opcionais.
 * `null` quando não marcou câmbio ou marcou opções conflitantes (ex.: manual
 * + automático) — aí o caller cai no sinal da versão.
 */
function transmissionFromOptions(vehicleOptions: unknown): string | null {
  const cambioKeys = extractSelectedKeys(vehicleOptions).filter((k) => k.startsWith("cambio_"));
  const labels = Array.from(
    new Set(cambioKeys.map((k) => CAMBIO_OPTION_LABELS[k]).filter(Boolean))
  );
  return labels.length === 1 ? labels[0] : null;
}

/** Sinal de câmbio no texto da versão/título (FIPE traz "Mec."/"Aut."/"CVT"). */
function transmissionFromVersionText(ad: PublicAdDetail): string | null {
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);
  const haystack = `${version} ${sanitizeText(ad.title)}`.toLowerCase();
  if (/\bcvt\b/.test(haystack)) return "Automático (CVT)";
  if (/\b(aut\.?|automátic|automatic|dct|dsg)\b/.test(haystack)) return "Automático";
  if (/\b(mec\.?|manual)\b/.test(haystack)) return "Manual";
  return null;
}

/**
 * Câmbio para EXIBIÇÃO e JSON-LD (fonte única). Confiança:
 *   1. opcional marcado (`cambio_*`) — o que o anunciante informou;
 *   2. sinal no texto da versão/título ("Mec."/"Aut."/"CVT");
 *   3. "Não informado" — NÃO confia na coluna `transmission` (default hardcoded).
 */
function deriveTransmissionForDisplay(ad: PublicAdDetail): string {
  return (
    transmissionFromOptions(ad.vehicle_options) ?? transmissionFromVersionText(ad) ?? UNKNOWN_SPEC
  );
}

const BODY_LABEL: Record<string, string> = {
  hatch: "Hatch",
  sedan: "Sedã",
  suv: "SUV",
  picape: "Picape",
  coupe: "Coupé",
  minivan: "Minivan",
  wagon: "Perua",
};

function bodyTypeSlugFromText(haystack: string): string | null {
  if (/\bhatch\b/.test(haystack)) return "hatch";
  if (/\bsed(?:an|ã|ane|\.)?\b/.test(haystack)) return "sedan";
  if (/\bsuv\b/.test(haystack)) return "suv";
  if (/\b(picape|pickup)\b/.test(haystack)) return "picape";
  if (/\bcoup[eé]\b/.test(haystack)) return "coupe";
  if (/\b(minivan|van)\b/.test(haystack)) return "minivan";
  if (/\b(wagon|perua|sw)\b/.test(haystack)) return "wagon";
  return null;
}

function bodyTypeSlugFromDeclared(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (/hatch/.test(v)) return "hatch";
  if (/(sedan|sedã|seda)/.test(v)) return "sedan";
  if (/(suv|utilit|crossover)/.test(v)) return "suv";
  if (/(picape|pickup|camionete)/.test(v)) return "picape";
  if (/coup/.test(v)) return "coupe";
  if (/(minivan|van)/.test(v)) return "minivan";
  if (/(wagon|perua)/.test(v)) return "wagon";
  return null;
}

/**
 * Carroceria para EXIBIÇÃO e JSON-LD (fonte única). Confiança:
 *   1. sinal no texto (modelo/título/versão) — ex.: "Onix Hatch" → Hatch;
 *   2. valor declarado NÃO-sedan reconhecido (SUV/Picape/...) — confiável por
 *      NÃO ser o default;
 *   3. "Não informado" — NÃO confia num "sedan" isolado (pode ser o default
 *      hardcoded "Sedã" do wizard). Nunca chuta "Sedã".
 */
function deriveBodyTypeForDisplay(ad: PublicAdDetail): string {
  const version = sanitizeText((ad as PublicAdDetail & { version?: string | null }).version);
  const haystack = `${sanitizeText(ad.model)} ${sanitizeText(ad.title)} ${version}`.toLowerCase();

  const fromText = bodyTypeSlugFromText(haystack);
  if (fromText) return BODY_LABEL[fromText];

  const declaredSlug = bodyTypeSlugFromDeclared(sanitizeText(ad.body_type));
  if (declaredSlug && declaredSlug !== "sedan") return BODY_LABEL[declaredSlug];

  return UNKNOWN_SPEC;
}

function buildFipeReferenceAmount(price: number | null, belowFipe: boolean): number | null {
  if (!price || price <= 0) return null;

  return belowFipe ? Math.round(price / 0.95) : Math.round(price * 1.04);
}

function buildFipeReference(price: number | null, belowFipe: boolean) {
  const estimated = buildFipeReferenceAmount(price, belowFipe);
  if (estimated == null) return "Consulte";
  return formatPricePublic(estimated) ?? "Consulte";
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

  // Tipo do anunciante via mapper único (frontend/lib/vehicle/seller-kind.ts).
  // O mapper consome `seller_kind` (backend trust pass) ou cai em
  // dealership_id/account_type — NUNCA infere por nome do anunciante.
  // Antes, esta função aceitava plan="premium" como sinal de loja, o
  // que classificava errado particular com plano premium.
  const isDealer = resolveSellerKind(ad) === "dealer";

  if (isDealer) {
    const cityDisplay = deriveCityDisplay(ad.city, ad.state);

    // P3-C/Lojas 2026-05-25 — `advertiser_slug` é o slug canônico em
    // `advertisers.slug` (vindo do backend). Quando presente, o card da
    // loja no detalhe linka para `/lojas/[storeSlug]`. Fallback antigo
    // (`slugify(name)`) NUNCA bate com `/api/public/dealers/:slug`
    // porque a coluna inclui o userId — então usamos string vazia
    // como sinal "sem slug confiável → não linkar" (ver
    // VehicleDetailMobileShell::SellerCard).
    const canonicalStoreSlug = sanitizeText(
      (ad as PublicAdDetail & { advertiser_slug?: string | null }).advertiser_slug
    );

    return {
      type: "dealer",
      name: sellerName,
      logo: SITE_LOGO_SRC,
      address: cityDisplay,
      rating: 4.8,
      phone: sellerPhone,
      storeSlug: canonicalStoreSlug,
    };
  }

  // Minimização de dados (LGPD + segurança): pessoa física é exibida SOMENTE
  // pelo primeiro nome — nunca sobrenome. Como truncamos na fonte, o nome
  // completo do PF não vaza em lugar nenhum: card, JSON-LD `Person.name`,
  // meta ou alt (que não usam o nome do vendedor).
  return {
    type: "private",
    name: firstNameOnly(sellerName),
    phone: sellerPhone,
  };
}

/**
 * Extrai apenas o PRIMEIRO NOME de um nome de pessoa física ("Rafael Souza"
 * → "Rafael"). Preserva o fallback genérico ("Anunciante no Carros na
 * Cidade") intacto quando não há nome real. Nunca devolve string vazia.
 */
function firstNameOnly(fullName: string): string {
  const cleaned = sanitizeText(fullName);
  if (!cleaned) return "Anunciante";
  // Fallbacks/rótulos genéricos (não são nome de pessoa) passam inteiros.
  if (/carros na cidade|anunciante/i.test(cleaned)) return cleaned;
  const first = cleaned.split(/\s+/)[0] ?? cleaned;
  return first || cleaned;
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
    price: formatPricePublic(ad.price) ?? "Sob consulta",
    priceNumeric: priceNumber,
    condition: "Usado",
    year: formatYear(ad.year),
    km: formatMileage(ad.mileage),
    fuel: sanitizeText(ad.fuel_type, "Não informado"),
    // Fonte única (alimenta specs do topo + subtítulo + JSON-LD Car): câmbio do
    // opcional/versão e carroceria do texto — nunca o default hardcoded.
    transmission: deriveTransmissionForDisplay(ad),
    bodyType: deriveBodyTypeForDisplay(ad),
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
    reviewedAfterBelowFipe: ad.reviewed_after_below_fipe === true,
    images,
    hasRealImages: images.length > 0,
    description: safeDescription,
    optionalItems: buildOptionalItems(ad),
    safetyItems: buildSafetyItems(),
    comfortItems: buildComfortItems(ad),
    vehicleOptionGroups: buildSelectedOptionGroups(ad.vehicle_options, {
      excludeKeys: TRUST_BADGE_KEYS,
    }),
    trustBadges: buildTrustBadges(ad.vehicle_options),
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
