import { buildAdSlug } from "@/lib/ads/build-ad-href";

export type RelatedAd = {
  id: string;
  slug: string;
  title: string;
  city: string;
  state: string;
  price: number;
  mileage: number;
  yearLabel: string;
  image: string;
  badge?: string;
};

export type SellerSummary = {
  name: string;
  city: string;
  state: string;
  rating: number;
  reviewCount: number;
  phone: string;
  whatsapp: string;
  type: "premium" | "basic" | "private";
  address: string;
  stockCount: number;
};

export type FinanceSummary = {
  monthlyFrom: number;
  entryLabel: string;
};

export type AdDetails = {
  id: string;
  slug: string;
  title: string;
  brand: string;
  model: string;
  version: string;
  yearLabel: string;
  price: number;
  fipeValue: number;
  mileage: number;
  city: string;
  state: string;
  transmission: string;
  fuel: string;
  bodyStyle: string;
  color: string;
  plateFinal: string;
  publishedLabel: string;
  badges: string[];
  images: string[];
  description: string;
  features: string[];
  weight: 1 | 2 | 3 | 4;
  seller: SellerSummary;
  finance: FinanceSummary;
  stockFromSeller: RelatedAd[];
  similarAds: RelatedAd[];
};

const DEFAULT_CITY = "São Paulo";
const DEFAULT_STATE = "SP";

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const cleaned = value
      .replace(/[R$\s]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableText(value: unknown): string | null {
  const text = toText(value, "");
  return text || null;
}

function normalizeWeight(value: unknown): 1 | 2 | 3 | 4 {
  const parsed = Number(value);

  if (parsed === 2) return 2;
  if (parsed === 3) return 3;
  if (parsed === 4) return 4;

  return 1;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeWhatsapp(value: unknown, fallbackPhone: string) {
  const source = toText(value) || fallbackPhone;
  const digits = digitsOnly(source);
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getImageFromUnknown(item: unknown): string | null {
  if (typeof item === "string" && item.trim()) return item.trim();

  if (item && typeof item === "object") {
    const maybe = item as Record<string, unknown>;
    const url =
      maybe.url ??
      maybe.src ??
      maybe.image ??
      maybe.image_url ??
      maybe.photo ??
      maybe.thumb ??
      maybe.thumbnail ??
      maybe.large ??
      maybe.cover_image;

    if (typeof url === "string" && url.trim()) return url.trim();
  }

  return null;
}

function createVehiclePlaceholder(label: string, accent = "#2F67F6"): string {
  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `
    <svg width="1280" height="720" viewBox="0 0 1280 720" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1280" y2="720">
          <stop stop-color="#EAF0FB"/>
          <stop offset="1" stop-color="#DCE6F8"/>
        </linearGradient>
        <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${accent}"/>
          <stop offset="1" stop-color="#7FA6FF"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" rx="32" fill="url(#bg)"/>
      <circle cx="1090" cy="120" r="180" fill="${accent}" opacity="0.08"/>
      <circle cx="180" cy="620" r="220" fill="${accent}" opacity="0.08"/>
      <rect x="88" y="88" width="1104" height="544" rx="28" fill="white" opacity="0.96"/>
      <rect x="160" y="170" width="960" height="290" rx="28" fill="url(#card)" opacity="0.15"/>
      <path d="M300 420C340 335 430 285 560 285H720C846 285 938 335 980 420L1020 500H260L300 420Z" fill="#334155"/>
      <rect x="360" y="300" width="300" height="105" rx="22" fill="#94A3B8"/>
      <rect x="690" y="300" width="165" height="105" rx="22" fill="#94A3B8"/>
      <rect x="310" y="430" width="660" height="58" rx="18" fill="#0F172A"/>
      <circle cx="405" cy="512" r="58" fill="#111827"/>
      <circle cx="872" cy="512" r="58" fill="#111827"/>
      <circle cx="405" cy="512" r="28" fill="#CBD5E1"/>
      <circle cx="872" cy="512" r="28" fill="#CBD5E1"/>
      <text x="640" y="585" text-anchor="middle" fill="#1D2440" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${safeLabel}</text>
      <text x="640" y="625" text-anchor="middle" fill="#6E748A" font-family="Arial, Helvetica, sans-serif" font-size="22">Carros na Cidade</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImages(images: unknown, fallbackLabel: string, imageUrl?: unknown): string[] {
  const normalized: string[] = [];

  if (Array.isArray(images)) {
    for (const item of images) {
      const image = getImageFromUnknown(item);
      if (image) normalized.push(image);
    }
  } else if (typeof images === "string" && images.trim()) {
    const raw = images.trim();

    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const image = getImageFromUnknown(item);
            if (image) normalized.push(image);
          }
        }
      } catch {
        raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .forEach((item) => normalized.push(item));
      }
    } else {
      raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => normalized.push(item));
    }
  }

  const primaryImage = getImageFromUnknown(imageUrl);
  if (primaryImage && !normalized.includes(primaryImage)) {
    normalized.unshift(primaryImage);
  }

  if (normalized.length > 0) return normalized.slice(0, 12);

  return [
    createVehiclePlaceholder(`${fallbackLabel} • Foto 1`, "#2F67F6"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 2`, "#1F66E5"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 3`, "#0F172A"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 4`, "#16A34A"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 5`, "#8B5CF6"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 6`, "#F59E0B"),
  ];
}

function normalizePublishedLabel(value: unknown, fallback: string) {
  const raw = toText(value, "");
  if (!raw) return fallback;

  const maybeDate = new Date(raw);
  if (Number.isFinite(maybeDate.getTime())) {
    return `Publicado em ${maybeDate.toLocaleDateString("pt-BR")}`;
  }

  return raw;
}

function normalizeSellerType(
  value: unknown,
  fallback: SellerSummary["type"]
): SellerSummary["type"] {
  const type = toText(value, fallback).toLowerCase();

  if (type === "premium") return "premium";
  if (type === "basic") return "basic";
  if (type === "private" || type === "particular") return "private";
  if (type === "dealer" || type === "dealership") return "basic";

  return fallback;
}

function normalizeBadgeText(value: unknown) {
  const text = toText(value, "");
  return text || undefined;
}

function normalizeBadges(
  raw: Record<string, unknown>,
  sellerRaw: Record<string, unknown>,
  price: number,
  fipeValue: number
): string[] {
  const badges = new Set<string>();

  const rawBadges = Array.isArray(raw.badges) ? raw.badges : [];
  rawBadges.forEach((badge) => {
    if (typeof badge === "string" && badge.trim()) {
      badges.add(badge.trim());
    }
  });

  const weight = normalizeWeight(
    raw.weight ??
      raw.listingWeight ??
      raw.planWeight ??
      raw.positionWeight ??
      sellerRaw.weight
  );

  const sellerType = normalizeSellerType(sellerRaw.type, "private");

  if (Boolean(raw.isHighlight) || Boolean(raw.highlight_until) || weight === 4) {
    badges.add("Destaque");
  }

  if (sellerType === "premium") {
    badges.add("Loja Premium");
  }

  if (price > 0 && fipeValue > 0 && price < fipeValue) {
    badges.add("Abaixo da FIPE");
  }

  const list = Array.from(badges);
  return list.length > 0 ? list : ["Anúncio"];
}

function normalizeFeatureList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;

  const list = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );

  return list.length > 0 ? list : fallback;
}

function normalizeRelatedAds(value: unknown, fallbackTitle: string): RelatedAd[] {
  if (!Array.isArray(value) || value.length === 0) return [];

  return value
    .slice(0, 8)
    .map((item, index) => {
      const obj = getObject(item);
      const location = getObject(obj.location);

      const title =
        toText(obj.title) ||
        [toText(obj.year), toText(obj.brand), toText(obj.model), toText(obj.version)]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        `${fallbackTitle} ${index + 1}`;

      const slug =
        toText(obj.slug) ||
        buildAdSlug({
          id: toText(obj.id, `ad-${index + 1}`),
          title,
          brand: toText(obj.brand),
          model: toText(obj.model),
          version: toText(obj.version),
          year: toText(obj.year),
        });

      const image =
        getImageFromUnknown(obj.image) ||
        getImageFromUnknown(obj.photo) ||
        getImageFromUnknown(obj.thumbnail) ||
        getImageFromUnknown(obj.images) ||
        createVehiclePlaceholder(`${fallbackTitle} ${index + 1}`);

      const badgeText =
        normalizeBadgeText(obj.badge) ||
        (Boolean(obj.isBelowFipe) ? "Abaixo da FIPE" : undefined) ||
        (Boolean(obj.isHighlight) ? "Destaque" : undefined);

      return {
        id: toText(obj.id, `ad-${index + 1}`),
        slug,
        title,
        city: toText(obj.city, toText(location.city, DEFAULT_CITY)),
        state: toText(obj.state, toText(location.state, DEFAULT_STATE)),
        price: toNumber(obj.price, 0),
        mileage: toNumber(obj.mileage ?? obj.km, 0),
        yearLabel: toText(obj.yearLabel ?? obj.year_model ?? obj.year, "2021/2021"),
        image,
        badge: badgeText,
      };
    })
    .filter(Boolean);
}

function buildFallbackAd(slug: string): AdDetails {
  const normalizedSlug = slug?.replace(/-/g, " ").trim() || "corolla-xei";
  const title =
    normalizedSlug.toLowerCase().includes("corolla")
      ? "2021 Toyota Corolla XEi 2.0 Flex Automático"
      : normalizedSlug
          .split(" ")
          .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
          .join(" ");

  return {
    id: "fallback-corolla-xei-2021",
    slug,
    title,
    brand: "Toyota",
    model: "Corolla",
    version: "XEi 2.0 Flex Automático",
    yearLabel: "2020/2021",
    price: 119990,
    fipeValue: 115700,
    mileage: 32500,
    city: DEFAULT_CITY,
    state: DEFAULT_STATE,
    transmission: "Automático",
    fuel: "Flex",
    bodyStyle: "Sedã",
    color: "Prata",
    plateFinal: "3",
    publishedLabel: "Publicado há 2 dias",
    badges: ["Destaque", "Loja Premium"],
    images: [
      createVehiclePlaceholder("Toyota Corolla • Principal", "#2F67F6"),
      createVehiclePlaceholder("Toyota Corolla • Lateral", "#1F66E5"),
      createVehiclePlaceholder("Toyota Corolla • Traseira", "#0F172A"),
      createVehiclePlaceholder("Toyota Corolla • Painel", "#16A34A"),
      createVehiclePlaceholder("Toyota Corolla • Bancos", "#8B5CF6"),
      createVehiclePlaceholder("Toyota Corolla • Rodas", "#F59E0B"),
    ],
    description:
      "Toyota Corolla XEi muito bem conservado, com histórico de manutenção, laudo cautelar aprovado e excelente conjunto mecânico. Veículo ideal para quem busca conforto, confiabilidade, segurança e ótima liquidez de revenda.",
    features: [
      "Ar-condicionado digital",
      "Direção elétrica",
      "Volante multifuncional",
      "Piloto automático",
      "Controle de estabilidade",
      "Controle de tração",
      "Câmera de ré",
      "Central multimídia",
      "Android Auto e Apple CarPlay",
      "Banco em couro",
      "Chave presencial",
      "Sensor de estacionamento",
    ],
    weight: 4,
    seller: {
      name: "Premium Motors",
      city: DEFAULT_CITY,
      state: DEFAULT_STATE,
      rating: 4.8,
      reviewCount: 99,
      phone: "(11) 98765-4321",
      whatsapp: "5511987654321",
      type: "premium",
      address: "Av. dos Bandeirantes, 5500 • São Paulo/SP",
      stockCount: 55,
    },
    finance: {
      monthlyFrom: 3700,
      entryLabel: "Entrada facilitada e análise rápida",
    },
    stockFromSeller: [
      {
        id: "stock-1",
        slug: "honda-civic-2021-sport",
        title: "2021 Honda Civic Sport",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 104500,
        mileage: 44000,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Honda Civic Sport", "#1F66E5"),
      },
      {
        id: "stock-2",
        slug: "toyota-corolla-2021-gli",
        title: "2021 Toyota Corolla GLi",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 117900,
        mileage: 38900,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Toyota Corolla GLi", "#2F67F6"),
      },
      {
        id: "stock-3",
        slug: "volkswagen-jetta-2020-rline",
        title: "2020 Volkswagen Jetta R-Line",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 128900,
        mileage: 42000,
        yearLabel: "2020/2020",
        image: createVehiclePlaceholder("Volkswagen Jetta", "#0F172A"),
      },
      {
        id: "stock-4",
        slug: "honda-city-2022-touring",
        title: "2022 Honda City Touring",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 119500,
        mileage: 28000,
        yearLabel: "2022/2022",
        image: createVehiclePlaceholder("Honda City Touring", "#16A34A"),
      },
    ],
    similarAds: [
      {
        id: "sim-1",
        slug: "nissan-sentra-advance-2021",
        title: "Nissan Sentra Advance 2.0",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 112900,
        mileage: 41200,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Nissan Sentra Advance", "#0F172A"),
        badge: "Abaixo da FIPE",
      },
      {
        id: "sim-2",
        slug: "nissan-sentra-advance-2022",
        title: "Nissan Sentra Advance 2.0",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 112900,
        mileage: 36500,
        yearLabel: "2022/2022",
        image: createVehiclePlaceholder("Nissan Sentra Advance", "#16A34A"),
      },
      {
        id: "sim-3",
        slug: "chevrolet-cruze-ltz-2021",
        title: "Chevrolet Cruze LTZ 1.4 Turbo",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 109900,
        mileage: 47000,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Chevrolet Cruze LTZ", "#8B5CF6"),
      },
      {
        id: "sim-4",
        slug: "honda-civic-exl-2020",
        title: "Honda Civic EXL 2.0",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        price: 118900,
        mileage: 52000,
        yearLabel: "2020/2020",
        image: createVehiclePlaceholder("Honda Civic EXL", "#F59E0B"),
      },
    ],
  };
}

function normalizeAd(raw: Record<string, unknown>, requestedSlug: string): AdDetails {
  const fallback = buildFallbackAd(requestedSlug);

  const sellerRaw =
    getObject(raw.seller) ||
    getObject(raw.dealership) ||
    getObject(raw.store);

  const location = getObject(raw.location);

  const brand = toText(raw.brand, fallback.brand);
  const model = toText(raw.model, fallback.model);
  const version = toText(raw.version, fallback.version);

  const title =
    toText(raw.title) ||
    [toText(raw.year), brand, model, version].filter(Boolean).join(" ").trim() ||
    fallback.title;

  const normalizedSlug =
    toText(raw.slug) ||
    buildAdSlug({
      id: toText(raw.id, fallback.id),
      slug: requestedSlug,
      title,
      brand,
      model,
      version,
      year: toText(raw.year),
    });

  const price = toNumber(raw.price, fallback.price);
  const fipeValue = toNumber(
    raw.fipeValue ?? raw.fipe ?? raw.fipe_price,
    fallback.fipeValue
  );

  const phone = toText(
    sellerRaw.phone ?? sellerRaw.telefone ?? sellerRaw.mobile,
    fallback.seller.phone
  );

  const whatsapp = normalizeWhatsapp(
    sellerRaw.whatsapp ?? sellerRaw.whatsApp ?? sellerRaw.phone,
    digitsOnly(phone)
  );

  const stockFromSeller = normalizeRelatedAds(
    raw.stockFromSeller ?? raw.sameSellerAds ?? raw.seller_ads,
    `${brand} ${model}`
  );

  const similarAds = normalizeRelatedAds(
    raw.similarAds ?? raw.relatedAds ?? raw.recommendations,
    `${brand} ${model}`
  );

  const badges = normalizeBadges(raw, sellerRaw, price, fipeValue);

  return {
    id: toText(raw.id, fallback.id),
    slug: normalizedSlug,
    title,
    brand,
    model,
    version,
    yearLabel: toText(raw.yearLabel ?? raw.year_model ?? raw.year, fallback.yearLabel),
    price,
    fipeValue,
    mileage: toNumber(raw.mileage ?? raw.km, fallback.mileage),
    city: toText(raw.city, toText(location.city, fallback.city)),
    state: toText(raw.state, toText(location.state, fallback.state)),
    transmission: toText(raw.transmission, fallback.transmission),
    fuel: toText(raw.fuel ?? raw.fuel_type, fallback.fuel),
    bodyStyle: toText(raw.bodyStyle ?? raw.body ?? raw.body_type, fallback.bodyStyle),
    color: toText(raw.color, fallback.color),
    plateFinal: toText(raw.plateFinal ?? raw.plate_end, fallback.plateFinal),
    publishedLabel: normalizePublishedLabel(
      raw.publishedLabel ?? raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at,
      fallback.publishedLabel
    ),
    badges: badges.length > 0 ? badges : fallback.badges,
    images: normalizeImages(
      raw.images ?? raw.photos ?? raw.gallery,
      `${brand} ${model}`,
      raw.image_url ?? raw.image ?? raw.cover_image
    ),
    description: toText(raw.description, fallback.description),
    features: normalizeFeatureList(raw.features, fallback.features),
    weight: normalizeWeight(
      raw.weight ??
        raw.listingWeight ??
        raw.planWeight ??
        raw.positionWeight ??
        sellerRaw.weight ??
        fallback.weight
    ),
    seller: {
      name: toText(
        sellerRaw.name ?? sellerRaw.dealership_name ?? sellerRaw.store_name,
        fallback.seller.name
      ),
      city: toText(sellerRaw.city, fallback.seller.city),
      state: toText(sellerRaw.state, fallback.seller.state),
      rating: toNumber(sellerRaw.rating, fallback.seller.rating),
      reviewCount: toNumber(
        sellerRaw.reviewCount ?? sellerRaw.reviews,
        fallback.seller.reviewCount
      ),
      phone,
      whatsapp: whatsapp || fallback.seller.whatsapp,
      type: normalizeSellerType(sellerRaw.type ?? raw.seller_type, fallback.seller.type),
      address: toText(sellerRaw.address, fallback.seller.address),
      stockCount: toNumber(
        sellerRaw.stockCount ?? sellerRaw.totalAds,
        fallback.seller.stockCount
      ),
    },
    finance: {
      monthlyFrom: toNumber(
        getObject(raw.finance).monthlyFrom,
        fallback.finance.monthlyFrom
      ),
      entryLabel: toText(
        getObject(raw.finance).entryLabel,
        fallback.finance.entryLabel
      ),
    },
    stockFromSeller: stockFromSeller.length > 0 ? stockFromSeller : fallback.stockFromSeller,
    similarAds: similarAds.length > 0 ? similarAds : fallback.similarAds,
  };
}

function extractPayload(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== "object") return null;

  const obj = json as Record<string, unknown>;

  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }

  if (obj.ad && typeof obj.ad === "object" && !Array.isArray(obj.ad)) {
    return obj.ad as Record<string, unknown>;
  }

  if (obj.listing && typeof obj.listing === "object" && !Array.isArray(obj.listing)) {
    return obj.listing as Record<string, unknown>;
  }

  if (!Array.isArray(obj)) {
    return obj;
  }

  return null;
}

export async function getAdDetails(slug: string): Promise<AdDetails> {
  const fallback = buildFallbackAd(slug);

  const bases = Array.from(
    new Set(
      [process.env.NEXT_PUBLIC_API_URL, process.env.API_URL]
        .filter(Boolean)
        .map((item) => String(item).replace(/\/$/, ""))
    )
  );

  if (!bases.length) return fallback;

  const candidatePaths = [
    `/ads/${slug}`,
    `/ads/slug/${slug}`,
    `/public/ads/${slug}`,
    `/public/ads/slug/${slug}`,
    `/public/listings/${slug}`,
    `/catalog/ads/${slug}`,
    `/api/ads/${slug}`,
    `/api/ads/slug/${slug}`,
  ];

  for (const base of bases) {
    for (const path of candidatePaths) {
      try {
        const response = await fetch(`${base}${path}`, {
          headers: {
            Accept: "application/json",
          },
          next: {
            revalidate: 60,
          },
        });

        if (!response.ok) continue;

        const json = await response.json();
        const raw = extractPayload(json);

        if (raw) {
          return normalizeAd(raw, slug);
        }
      } catch {
        // fallback silencioso
      }
    }
  }

  return fallback;
}
