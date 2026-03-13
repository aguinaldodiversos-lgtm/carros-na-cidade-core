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
  seller: SellerSummary;
  finance: FinanceSummary;
  stockFromSeller: RelatedAd[];
  similarAds: RelatedAd[];
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(
      value
        .replace(/[R$\s.]/g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "")
    );
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getImageFromUnknown(item: unknown): string | null {
  if (typeof item === "string" && item.trim()) return item;

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
      maybe.large;

    if (typeof url === "string" && url.trim()) return url;
  }

  return null;
}

function createVehiclePlaceholder(label: string, accent = "#2F67F6") {
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
      <text x="640" y="585" text-anchor="middle" fill="#1D2440" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700">${label}</text>
      <text x="640" y="625" text-anchor="middle" fill="#6E748A" font-family="Arial, Helvetica, sans-serif" font-size="22">Carros na Cidade</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeImages(images: unknown, fallbackLabel: string): string[] {
  const list = Array.isArray(images) ? images : [];
  const normalized = list.map(getImageFromUnknown).filter(Boolean) as string[];

  if (normalized.length) return normalized;

  return [
    createVehiclePlaceholder(`${fallbackLabel} • Foto 1`, "#2F67F6"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 2`, "#1F9D55"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 3`, "#F59E0B"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 4`, "#0F172A"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 5`, "#8B5CF6"),
    createVehiclePlaceholder(`${fallbackLabel} • Foto 6`, "#14B8A6"),
  ];
}

function normalizeRelatedAds(value: unknown, fallbackTitle: string): RelatedAd[] {
  if (!Array.isArray(value) || value.length === 0) return [];

  return value.slice(0, 4).map((item, index) => {
    const obj = (item ?? {}) as Record<string, unknown>;

    return {
      id: toText(obj.id, `ad-${index + 1}`),
      slug: toText(obj.slug, `veiculo-${index + 1}`),
      title:
        toText(obj.title) ||
        [toText(obj.year), toText(obj.brand), toText(obj.model), toText(obj.version)]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        `${fallbackTitle} ${index + 1}`,
      city:
        toText(obj.city) ||
        toText((obj.location as Record<string, unknown> | undefined)?.city, "São Paulo"),
      state:
        toText(obj.state) ||
        toText((obj.location as Record<string, unknown> | undefined)?.state, "SP"),
      price: toNumber(obj.price, 0),
      mileage: toNumber(obj.mileage, 0),
      yearLabel: toText(obj.yearLabel) || toText(obj.year, "2021/2022"),
      image:
        getImageFromUnknown(obj.image) ||
        getImageFromUnknown(obj.photo) ||
        createVehiclePlaceholder(`${fallbackTitle} ${index + 1}`),
      badge:
        toText(obj.badge) ||
        (obj.isBelowFipe ? "Abaixo da FIPE" : undefined) ||
        (obj.isHighlight ? "Destaque" : undefined),
    };
  });
}

function buildFallbackAd(slug: string): AdDetails {
  const normalizedSlug = slug?.replace(/-/g, " ").trim() || "corolla-xei";
  const title =
    normalizedSlug.includes("corolla")
      ? "2021 Toyota Corolla XEi 2.0 Flex Automático"
      : normalizedSlug
          .split(" ")
          .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
          .join(" ");

  const images = [
    createVehiclePlaceholder("Toyota Corolla • Principal", "#2F67F6"),
    createVehiclePlaceholder("Toyota Corolla • Lateral", "#1F66E5"),
    createVehiclePlaceholder("Toyota Corolla • Traseira", "#0F172A"),
    createVehiclePlaceholder("Toyota Corolla • Painel", "#16A34A"),
    createVehiclePlaceholder("Toyota Corolla • Bancos", "#8B5CF6"),
    createVehiclePlaceholder("Toyota Corolla • Rodas", "#F59E0B"),
  ];

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
    city: "São Paulo",
    state: "SP",
    transmission: "Automático",
    fuel: "Flex",
    bodyStyle: "Sedã",
    color: "Prata",
    plateFinal: "3",
    publishedLabel: "Publicado há 2 dias",
    badges: ["Destaque", "Loja Premium"],
    images,
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
    seller: {
      name: "Premium Motors",
      city: "São Paulo",
      state: "SP",
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
        city: "São Paulo",
        state: "SP",
        price: 104500,
        mileage: 44000,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Honda Civic Sport", "#1F66E5"),
      },
      {
        id: "stock-2",
        slug: "toyota-corolla-2021-gli",
        title: "2021 Toyota Corolla GLi",
        city: "São Paulo",
        state: "SP",
        price: 117900,
        mileage: 38900,
        yearLabel: "2021/2021",
        image: createVehiclePlaceholder("Toyota Corolla GLi", "#2F67F6"),
      },
    ],
    similarAds: [
      {
        id: "sim-1",
        slug: "nissan-sentra-advance-2021",
        title: "Nissan Sentra Advance 2.0",
        city: "São Paulo",
        state: "SP",
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
        city: "São Paulo",
        state: "SP",
        price: 112900,
        mileage: 36500,
        yearLabel: "2022/2022",
        image: createVehiclePlaceholder("Nissan Sentra Advance", "#16A34A"),
      },
    ],
  };
}

function normalizeAd(raw: Record<string, unknown>, slug: string): AdDetails {
  const sellerRaw =
    (raw.seller as Record<string, unknown> | undefined) ||
    (raw.dealership as Record<string, unknown> | undefined) ||
    (raw.store as Record<string, unknown> | undefined) ||
    {};

  const brand = toText(raw.brand, "Toyota");
  const model = toText(raw.model, "Corolla");
  const version = toText(raw.version, "XEi 2.0 Flex Automático");
  const title =
    toText(raw.title) ||
    [toText(raw.year), brand, model, version].filter(Boolean).join(" ");

  const price = toNumber(raw.price, 119990);
  const fipeValue = toNumber(raw.fipeValue ?? raw.fipe ?? raw.fipe_price, 115700);

  const badges = new Set<string>();

  const rawBadges = Array.isArray(raw.badges) ? raw.badges : [];
  rawBadges.forEach((badge) => {
    if (typeof badge === "string" && badge.trim()) badges.add(badge.trim());
  });

  const weight = toNumber(raw.weight, 1);
  if (raw.isHighlight || weight === 4) badges.add("Destaque");
  if (toText(sellerRaw.type).toLowerCase() === "premium") badges.add("Loja Premium");
  if (price > 0 && fipeValue > 0 && price < fipeValue) badges.add("Abaixo da FIPE");

  const stockFromSeller =
    normalizeRelatedAds(
      raw.stockFromSeller ?? raw.sameSellerAds ?? raw.seller_ads,
      `${brand} ${model}`
    ) || [];

  const similarAds =
    normalizeRelatedAds(raw.similarAds ?? raw.relatedAds ?? raw.recommendations, `${brand} ${model}`) ||
    [];

  const fallback = buildFallbackAd(slug);

  return {
    id: toText(raw.id, fallback.id),
    slug: toText(raw.slug, slug),
    title: title || fallback.title,
    brand,
    model,
    version,
    yearLabel: toText(raw.yearLabel ?? raw.year, fallback.yearLabel),
    price: price || fallback.price,
    fipeValue: fipeValue || fallback.fipeValue,
    mileage: toNumber(raw.mileage ?? raw.km, fallback.mileage),
    city:
      toText(raw.city) ||
      toText((raw.location as Record<string, unknown> | undefined)?.city, fallback.city),
    state:
      toText(raw.state) ||
      toText((raw.location as Record<string, unknown> | undefined)?.state, fallback.state),
    transmission: toText(raw.transmission, fallback.transmission),
    fuel: toText(raw.fuel, fallback.fuel),
    bodyStyle: toText(raw.bodyStyle ?? raw.body, fallback.bodyStyle),
    color: toText(raw.color, fallback.color),
    plateFinal: toText(raw.plateFinal ?? raw.plate_end, fallback.plateFinal),
    publishedLabel: toText(raw.publishedLabel ?? raw.updatedAt ?? raw.createdAt, fallback.publishedLabel),
    badges: Array.from(badges).length ? Array.from(badges) : fallback.badges,
    images: normalizeImages(raw.images ?? raw.photos ?? raw.gallery, `${brand} ${model}`),
    description: toText(raw.description, fallback.description),
    features:
      Array.isArray(raw.features) && raw.features.length
        ? raw.features.filter((item): item is string => typeof item === "string" && !!item.trim())
        : fallback.features,
    seller: {
      name: toText(sellerRaw.name, fallback.seller.name),
      city: toText(sellerRaw.city, fallback.seller.city),
      state: toText(sellerRaw.state, fallback.seller.state),
      rating: toNumber(sellerRaw.rating, fallback.seller.rating),
      reviewCount: toNumber(sellerRaw.reviewCount ?? sellerRaw.reviews, fallback.seller.reviewCount),
      phone: toText(sellerRaw.phone, fallback.seller.phone),
      whatsapp: toText(sellerRaw.whatsapp, fallback.seller.whatsapp),
      type:
        (toText(sellerRaw.type, fallback.seller.type).toLowerCase() as SellerSummary["type"]) ||
        fallback.seller.type,
      address: toText(sellerRaw.address, fallback.seller.address),
      stockCount: toNumber(sellerRaw.stockCount ?? sellerRaw.totalAds, fallback.seller.stockCount),
    },
    finance: {
      monthlyFrom: toNumber(
        (raw.finance as Record<string, unknown> | undefined)?.monthlyFrom,
        fallback.finance.monthlyFrom
      ),
      entryLabel: toText(
        (raw.finance as Record<string, unknown> | undefined)?.entryLabel,
        fallback.finance.entryLabel
      ),
    },
    stockFromSeller: stockFromSeller.length ? stockFromSeller : fallback.stockFromSeller,
    similarAds: similarAds.length ? similarAds : fallback.similarAds,
  };
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
    `/public/ads/${slug}`,
    `/public/listings/${slug}`,
    `/catalog/ads/${slug}`,
    `/api/ads/${slug}`,
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
        const raw =
          (json?.data as Record<string, unknown> | undefined) ||
          (json?.ad as Record<string, unknown> | undefined) ||
          (json as Record<string, unknown>);

        if (raw && typeof raw === "object") {
          return normalizeAd(raw, slug);
        }
      } catch {
        // fallback silencioso
      }
    }
  }

  return fallback;
}
