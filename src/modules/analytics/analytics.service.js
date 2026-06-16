import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  deriveDeviceType,
  hashUserAgent,
  isPayloadTooLarge,
  normalizeEventInput,
} from "./analytics.constants.js";
import * as repo from "./analytics.repository.js";

/**
 * Serviço do analytics interno (Fase 4.4).
 *
 * - recordEvent: valida + anonimiza + grava (coletor público).
 * - getOverview / getAdMetrics / getPostMetrics: agregações para o admin.
 */

/** period=7d|30d|90d → dias. Default 30. */
export function parsePeriodDays(period) {
  const map = { "7d": 7, "30d": 30, "90d": 90 };
  return map[String(period || "").trim()] || 30;
}

/**
 * Grava um evento. `userAgent` vem do header (server-side) para derivar
 * device_type/hash sem confiar no cliente. Lança AppError em payload
 * inválido/grande — o controller traduz para HTTP.
 */
export async function recordEvent({ body, userAgent }) {
  if (isPayloadTooLarge(body)) {
    throw new AppError("Payload muito grande.", 413);
  }
  const norm = normalizeEventInput(body);
  if (!norm.ok) {
    throw new AppError(norm.error, 400);
  }

  const row = {
    ...norm.value,
    device_type: norm.value.device_type || deriveDeviceType(userAgent),
    user_agent_hash: hashUserAgent(userAgent),
  };

  await repo.insertEvent(row);
  return { ok: true };
}

/**
 * Overview do dashboard admin. `filters`: { period, state, citySlug }.
 * Cards (totals) são janelas fixas (hoje/7d/30d); rankings/timeseries usam
 * o período selecionado.
 */
export async function getOverview({ period, state, citySlug } = {}) {
  const days = parsePeriodDays(period);
  const filters = { days, state: state || null, citySlug: citySlug || null };

  const [
    totals,
    timeseries,
    topCities,
    topRegions,
    topPages,
    topAds,
    topBlogPosts,
    trafficSources,
    commercialEvents,
    lowContactAds,
  ] = await Promise.all([
    repo.getTotals(),
    repo.getTimeseries(filters),
    repo.getTopCities({ ...filters, limit: 15 }),
    repo.getTopRegions({ days, state: filters.state, limit: 15 }),
    repo.getTopPages({ ...filters, limit: 15 }),
    repo.getTopAds({ ...filters, limit: 15 }),
    repo.getTopBlogPosts({ days, limit: 15 }),
    repo.getTrafficSources({ days, state: filters.state, limit: 12 }),
    repo.getCommercialEvents(filters),
    repo.getLowContactAds({ days, minViews: 10, limit: 15 }),
  ]);

  return {
    period: `${days}d`,
    filters: { state: filters.state, city_slug: filters.citySlug },
    totals,
    timeseries,
    topCities,
    topRegions,
    topPages,
    topAds,
    topBlogPosts,
    trafficSources,
    commercialEvents,
    lowContactAds,
  };
}

export async function getAdMetrics(adId) {
  const id = Number.parseInt(adId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("ID de anúncio inválido.", 400);
  return repo.getAdMetrics(id);
}

export async function getPostMetrics(postId) {
  const id = Number.parseInt(postId, 10);
  if (!Number.isInteger(id) || id <= 0) throw new AppError("ID de post inválido.", 400);
  return repo.getPostMetrics(id);
}
