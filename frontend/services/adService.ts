import type { BoostOption, DashboardAd, DashboardAdStatus } from "@/lib/dashboard-types";
import type { PaymentStatus } from "@/services/planStore";

type MutableAd = DashboardAd & {
  created_at: string;
  updated_at: string;
};

type BoostPaymentRecord = {
  mercado_pago_id: string;
  ad_id: string;
  user_id: string;
  boost_option_id: string;
  days: number;
  amount: number;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
};

const nowIso = () => new Date().toISOString();

const adSeed: MutableAd[] = [
  {
    id: "ad-cpf-1001",
    user_id: "user-cpf-demo",
    title: "Toyota Corolla Altis 2023",
    price: 112900,
    image_url: "/images/corolla.jpeg",
    status: "active",
    is_featured: false,
    featured_until: null,
    priority_level: "normal",
    views: 284,
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ad-cpf-1002",
    user_id: "user-cpf-demo",
    title: "Honda Civic Touring 2021",
    price: 98900,
    image_url: "/images/civic.jpeg",
    status: "active",
    is_featured: true,
    featured_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    priority_level: "high",
    views: 521,
    expires_at: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ad-cpf-1003",
    user_id: "user-cpf-demo",
    title: "Hyundai HB20 Comfort 2020",
    price: 74900,
    image_url: "/images/hb20.jpeg",
    status: "paused",
    is_featured: false,
    featured_until: null,
    priority_level: "normal",
    views: 113,
    expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ad-cnpj-2001",
    user_id: "user-cnpj-demo",
    title: "Jeep Compass Longitude 2022",
    price: 129900,
    image_url: "/images/compass.jpeg",
    status: "active",
    is_featured: true,
    featured_until: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
    priority_level: "high",
    views: 911,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ad-cnpj-2002",
    user_id: "user-cnpj-demo",
    title: "Volkswagen T-Cross Comfortline 2021",
    price: 97900,
    image_url: "/images/banner1.jpg",
    status: "active",
    is_featured: false,
    featured_until: null,
    priority_level: "normal",
    views: 442,
    expires_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
  {
    id: "ad-cnpj-2003",
    user_id: "user-cnpj-demo",
    title: "BYD Yuan Plus 2023",
    price: 235990,
    image_url: "/images/banner2.jpg",
    status: "paused",
    is_featured: false,
    featured_until: null,
    priority_level: "normal",
    views: 190,
    expires_at: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: nowIso(),
    updated_at: nowIso(),
  },
];

const boostOptionsSeed: BoostOption[] = [
  {
    id: "boost-7d",
    days: 7,
    price: 39.9,
    label: "Destaque por 7 dias",
    description: "Prioridade alta nas buscas e badge de destaque por 7 dias.",
  },
  {
    id: "boost-30d",
    days: 30,
    price: 129.9,
    label: "Destaque por 30 dias",
    description: "Exibicao premium no topo, carrossel principal e reforco de recomendacao IA.",
  },
];

const boostPayments: BoostPaymentRecord[] = [];

function cloneAd(ad: MutableAd): DashboardAd {
  return {
    id: ad.id,
    user_id: ad.user_id,
    title: ad.title,
    price: ad.price,
    image_url: ad.image_url,
    status: ad.status,
    is_featured: ad.is_featured,
    featured_until: ad.featured_until,
    priority_level: ad.priority_level,
    views: ad.views,
    expires_at: ad.expires_at,
  };
}

function resolveFeatureExpiration(ad: MutableAd) {
  if (!ad.featured_until) return;
  if (new Date(ad.featured_until).getTime() > Date.now()) return;
  ad.is_featured = false;
  ad.featured_until = null;
  ad.priority_level = "normal";
}

function getMutableAdById(adId: string) {
  const ad = adSeed.find((item) => item.id === adId);
  if (!ad) return null;
  resolveFeatureExpiration(ad);
  return ad;
}

function setAdStatus(ad: MutableAd, status: DashboardAdStatus) {
  ad.status = status;
  ad.updated_at = nowIso();
}

export function listAdsByUser(userId: string) {
  const userAds = adSeed.filter((ad) => ad.user_id === userId);
  userAds.forEach(resolveFeatureExpiration);

  return userAds
    .slice()
    .sort((a, b) => {
      if (a.status === b.status) return b.views - a.views;
      return a.status === "active" ? -1 : 1;
    })
    .map(cloneAd);
}

export function getAdById(adId: string) {
  const ad = getMutableAdById(adId);
  return ad ? cloneAd(ad) : null;
}

export function getAdByIdForUser(adId: string, userId: string) {
  const ad = getMutableAdById(adId);
  if (!ad || ad.user_id !== userId) return null;
  return cloneAd(ad);
}

export function getBoostOptions() {
  return boostOptionsSeed.map((option) => ({ ...option }));
}

export function getBoostOptionById(optionId: string) {
  return boostOptionsSeed.find((option) => option.id === optionId) ?? null;
}

export function pauseAd(userId: string, adId: string) {
  const ad = getMutableAdById(adId);
  if (!ad || ad.user_id !== userId) return null;
  setAdStatus(ad, "paused");
  return cloneAd(ad);
}

export function activateAd(userId: string, adId: string) {
  const ad = getMutableAdById(adId);
  if (!ad || ad.user_id !== userId) return null;
  setAdStatus(ad, "active");
  return cloneAd(ad);
}

export function deleteAd(userId: string, adId: string) {
  const index = adSeed.findIndex((ad) => ad.id === adId && ad.user_id === userId);
  if (index < 0) return false;
  adSeed.splice(index, 1);
  return true;
}

export function registerBoostPaymentIntent(data: {
  mercado_pago_id: string;
  ad_id: string;
  user_id: string;
  boost_option_id: string;
  days: number;
  amount: number;
}) {
  const existing = boostPayments.find(
    (payment) => payment.mercado_pago_id === data.mercado_pago_id
  );
  if (existing) return existing;

  const created: BoostPaymentRecord = {
    ...data,
    status: "pending",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  boostPayments.push(created);
  return created;
}

export function getBoostPaymentByMercadoPagoId(mercadoPagoId: string) {
  return boostPayments.find((payment) => payment.mercado_pago_id === mercadoPagoId) ?? null;
}

export function updateBoostPaymentStatus(mercadoPagoId: string, status: PaymentStatus) {
  const payment = boostPayments.find((item) => item.mercado_pago_id === mercadoPagoId);
  if (!payment) return null;
  payment.status = status;
  payment.updated_at = nowIso();
  return payment;
}

export function applyBoostToAd(adId: string, days: number) {
  const ad = getMutableAdById(adId);
  if (!ad) return null;

  const baseTime = ad.featured_until
    ? Math.max(new Date(ad.featured_until).getTime(), Date.now())
    : Date.now();
  const boostedUntil = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

  ad.is_featured = true;
  ad.featured_until = boostedUntil;
  ad.priority_level = "high";
  ad.status = "active";
  ad.updated_at = nowIso();

  return cloneAd(ad);
}
