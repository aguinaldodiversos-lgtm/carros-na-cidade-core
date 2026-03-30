import {
  getCityProfile,
  getFinancingStatsByCity,
  getFipeStatsByCity,
  type MarketStat,
} from "@/services/marketService";
import { type ListingCar } from "@/lib/car-data";
import { buildSimilarVehicles, type VehicleDetail } from "@/lib/vehicle/public-vehicle";

const AI_API_BASE = process.env.NEXT_PUBLIC_AI_API_URL;

async function requestAI<T>(endpoint: string, fallback: T): Promise<T> {
  if (!AI_API_BASE) {
    return fallback;
  }

  try {
    const response = await fetch(`${AI_API_BASE}${endpoint}`, {
      next: { revalidate: 1800 },
    });

    if (!response.ok) {
      return fallback;
    }

    const data = (await response.json()) as T;
    return data;
  } catch {
    return fallback;
  }
}

export async function getAIFipeInsights(cidade: string) {
  const city = getCityProfile(cidade);
  const fallback = [
    `Busca por hatchs compactos em ${city.name} segue em alta nas ultimas semanas.`,
    `Preco de SUVs de entrada em ${city.name} ficou mais competitivo que a media estadual.`,
    `Anuncios com historico de manutencao completo geram mais cliques e conversao local.`,
  ];

  return requestAI(`/insights/fipe/${city.slug}`, fallback);
}

export async function getAIFipeStats(cidade: string): Promise<MarketStat[]> {
  const fallback = getFipeStatsByCity(cidade);
  return requestAI(`/stats/fipe/${cidade}`, fallback);
}

export async function getAIFinancingStats(cidade: string): Promise<MarketStat[]> {
  const fallback = getFinancingStatsByCity(cidade);
  return requestAI(`/stats/financing/${cidade}`, fallback);
}

export async function getAIFinancingInsights(cidade: string) {
  const city = getCityProfile(cidade);
  const fallback = [
    `Em ${city.name}, entradas acima de 20% reduzem sensivelmente o custo total.`,
    "Prazo de 48 meses tem concentrado o melhor equilibrio entre parcela e juros.",
    "Modelos com maior liquidez local tendem a ter condicoes de credito mais favoraveis.",
  ];
  return requestAI(`/insights/financing/${city.slug}`, fallback);
}

export async function getAIBlogInsights(cidade: string) {
  const city = getCityProfile(cidade);
  const fallback = [
    `Tendencias de busca em ${city.name}: SUVs compactos e sedans economicos.`,
    "Alta de interesse por conteudo sobre custos de revisao e seguro automotivo.",
    "Comparativos de consumo e custo por km seguem como pauta mais acessada.",
  ];
  return requestAI(`/insights/blog/${city.slug}`, fallback);
}

export type VehiclePriceSignal = {
  label: string;
  score: number;
  reason: string;
};

export async function getAIVehiclePriceSignal(vehicle: VehicleDetail): Promise<VehiclePriceSignal> {
  const fallback: VehiclePriceSignal = vehicle.isBelowFipe
    ? {
        label: "Preco competitivo na sua regiao",
        score: 92,
        reason: `Valor ${vehicle.price} esta abaixo da referencia FIPE (${vehicle.fipePrice}) para ${vehicle.city}.`,
      }
    : {
        label: "Preco alinhado ao mercado local",
        score: 78,
        reason: `Anuncio em linha com a faixa de negociacao para veiculos similares em ${vehicle.city}.`,
      };

  return requestAI(`/vehicle/${vehicle.id}/price-signal`, fallback);
}

export async function getAIVehicleInsights(vehicle: VehicleDetail): Promise<string[]> {
  const fallback = [
    `Liquidez projetada alta para ${vehicle.model} em ${vehicle.city}.`,
    "Historico de procura crescente para configuracoes automaticas nos ultimos 30 dias.",
    "Tendencia de valorizacao moderada para este segmento no curto prazo.",
  ];

  return requestAI(`/vehicle/${vehicle.id}/insights`, fallback);
}

export async function getAISimilarVehicles(vehicle: VehicleDetail): Promise<ListingCar[]> {
  const fallback = buildSimilarVehicles(vehicle);
  return requestAI(`/vehicle/${vehicle.id}/similar`, fallback);
}

export type AdBoostMetrics = {
  ad_id: string;
  visibility_score: number;
  rank_score: number;
  recommendation_score: number;
  exposure_score: number;
  updated_at: string;
};

type BoostInput = {
  adId: string;
  userId: string;
  boostDays: number;
  priorityLevel: "normal" | "high";
};

const adBoostMetricsStore = new Map<string, AdBoostMetrics>();

export function getAdBoostMetrics(adId: string) {
  return adBoostMetricsStore.get(adId) ?? null;
}

function buildFallbackBoostMetrics(input: BoostInput): AdBoostMetrics {
  const visibilityBase = input.priorityLevel === "high" ? 88 : 66;
  const dayWeight = Math.min(input.boostDays, 30) * 0.6;
  const visibility = Math.min(99, Math.round(visibilityBase + dayWeight));
  const rank = Math.min(99, Math.round(visibility * 0.92));
  const recommendation = Math.min(99, Math.round(visibility * 0.87));
  const exposure = Math.min(99, Math.round(visibility * 0.9));

  return {
    ad_id: input.adId,
    visibility_score: visibility,
    rank_score: rank,
    recommendation_score: recommendation,
    exposure_score: exposure,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Métricas de “boost” para UI (scores). Chama serviço **opcional** em NEXT_PUBLIC_AI_API_URL,
 * não a API core do portal (`NEXT_PUBLIC_API_URL`). Checkout de destaque pago usa POST /api/payments/create (BoostCheckout).
 */
export async function applyAdBoostMetrics(input: BoostInput): Promise<AdBoostMetrics> {
  const fallback = buildFallbackBoostMetrics(input);

  if (!AI_API_BASE) {
    adBoostMetricsStore.set(input.adId, fallback);
    return fallback;
  }

  try {
    const response = await fetch(`${AI_API_BASE}/ads/${input.adId}/boost`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ad_id: input.adId,
        user_id: input.userId,
        boost_days: input.boostDays,
        priority_level: input.priorityLevel,
      }),
    });

    if (!response.ok) {
      adBoostMetricsStore.set(input.adId, fallback);
      return fallback;
    }

    const payload = (await response.json()) as Partial<AdBoostMetrics>;
    const normalized: AdBoostMetrics = {
      ad_id: payload.ad_id ?? input.adId,
      visibility_score: payload.visibility_score ?? fallback.visibility_score,
      rank_score: payload.rank_score ?? fallback.rank_score,
      recommendation_score: payload.recommendation_score ?? fallback.recommendation_score,
      exposure_score: payload.exposure_score ?? fallback.exposure_score,
      updated_at: payload.updated_at ?? new Date().toISOString(),
    };

    adBoostMetricsStore.set(input.adId, normalized);
    return normalized;
  } catch {
    adBoostMetricsStore.set(input.adId, fallback);
    return fallback;
  }
}
