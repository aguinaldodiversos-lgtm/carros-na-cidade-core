import { addWhatsAppJob } from "../../queues/whatsapp.queue.js";
import { logger } from "../../shared/logger.js";
import { normalizeBrazilPhoneDigits } from "../../shared/utils/brPhone.js";
import { collectCarDealerPlaces, fetchPlaceDetails } from "./google-places.client.js";
import * as dealerLeadsRepo from "./dealer-leads.repository.js";
import * as citiesService from "../cities/cities.service.js";

function getFrontendBaseUrl() {
  return (
    String(process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(
      /\/+$/,
      ""
    ) || "https://carrosnacidade.com"
  );
}

/**
 * Convite curto, local e orientado a ação (anunciar grátis).
 * @param {{ name: string, state?: string|null }} city
 * @param {string} storeName
 */
export function buildDealerAcquisitionMessage(city, storeName) {
  const uf = city.state ? ` (${city.state})` : "";
  const label = storeName?.trim() || "a sua equipe";
  const anunciarUrl = `${getFrontendBaseUrl()}/anunciar`;

  return (
    `Olá! Aqui é do Carros na Cidade — marketplace de veículos com foco em busca local.\n\n` +
    `Estamos fortalecendo a vitrine em ${city.name}${uf} e queremos ${label} entre os primeiros a aparecerem para quem busca carro na região.\n\n` +
    `Dá para publicar anúncios gratuitamente e receber contatos direto no WhatsApp:\n${anunciarUrl}\n\n` +
    `Se fizer sentido, responda "sim" que te explico em uma mensagem como funciona.`
  );
}

/**
 * Processa uma cidade: Places → telefone → dealer_leads → fila WhatsApp.
 * @param {object} city
 * @param {number|string} city.id
 * @param {string} city.name
 * @param {string} [city.state]
 */
export async function runOutreachForCity(city) {
  const maxPlaces = Math.min(
    500,
    Math.max(1, Number(process.env.DEALER_GOOGLE_MAX_PLACES_PER_CITY || 25))
  );

  const places = await collectCarDealerPlaces(city, maxPlaces);

  let created = 0;
  let queued = 0;

  for (const place of places) {
    const details = await fetchPlaceDetails(place.place_id);
    if (!details?.phone) {
      continue;
    }

    const normalized = normalizeBrazilPhoneDigits(details.phone);
    if (!normalized || normalized.length < 12) {
      logger.warn(
        { placeId: place.place_id, phone: details.phone },
        "[dealer-outreach] telefone inválido após normalização"
      );
      continue;
    }

    const name = details.name || place.name || "Loja";

    const { id: leadId, inserted } = await dealerLeadsRepo.upsertDealerLeadFromGoogle({
      cityId: city.id,
      name,
      googlePlaceId: place.place_id,
      phone: normalized,
    });

    if (!leadId) {
      continue;
    }

    if (await dealerLeadsRepo.shouldSkipOutreach(leadId)) {
      continue;
    }

    if (inserted) {
      created += 1;
      await dealerLeadsRepo.bumpCityDealerMetrics(city.id, { pipeline: 1, outreach: 0 });
    }

    const message = buildDealerAcquisitionMessage(city, name);

    const job = await addWhatsAppJob(
      "send-message",
      {
        phone: normalized,
        message,
        cityId: Number(city.id),
        dealerLeadId: leadId,
        origin: "dealer_acquisition",
        channel: "whatsapp",
        createdAt: new Date().toISOString(),
      },
      {
        jobId: `dealer-acq:${leadId}:${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 60000 },
      }
    );

    if (job) {
      queued += 1;
    }
  }

  logger.info(
    {
      cityId: city.id,
      cityName: city.name,
      places: places.length,
      leadsCreated: created,
      whatsappQueued: queued,
    },
    "[dealer-outreach] cidade processada"
  );

  return { places: places.length, created, queued };
}

/**
 * @param {{ limitCities?: number }} opts
 */
export async function runGooglePlacesOutreachPipeline(opts = {}) {
  const limitCities = Math.min(
    200,
    Math.max(1, Number(opts.limitCities || process.env.DEALER_ACQUISITION_CITIES_PER_RUN || 8))
  );

  if (!String(process.env.GOOGLE_PLACES_API_KEY || "").trim()) {
    logger.warn("[dealer-outreach] GOOGLE_PLACES_API_KEY ausente — pipeline ignorado");
    return { skipped: true, reason: "no_api_key" };
  }

  const cities = await citiesService.getCitiesForExpansion(limitCities);

  const summary = { cities: cities.length, totalQueued: 0, totalCreated: 0 };

  for (const city of cities) {
    try {
      const r = await runOutreachForCity(city);
      summary.totalQueued += r.queued;
      summary.totalCreated += r.created;
    } catch (err) {
      logger.error(
        { err: err?.message || String(err), cityId: city.id },
        "[dealer-outreach] falha na cidade"
      );
    }
  }

  logger.info(summary, "[dealer-outreach] pipeline concluído");

  return summary;
}
