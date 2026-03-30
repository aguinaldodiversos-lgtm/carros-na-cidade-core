import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as dealersRepository from "./dealers.repository.js";

function buildDealerScore(dealer) {
  const activeAds = Number(dealer.active_ads || 0);
  const highlightAds = Number(dealer.highlight_ads || 0);
  const verified = Boolean(dealer.verified);

  let score = activeAds * 2 + highlightAds * 4;

  if (verified) score += 10;

  return score;
}

export async function getTopDealersByCity(citySlug, limit = 20) {
  const dealers = await dealersRepository.listTopDealersByCitySlug(citySlug, limit);

  return dealers.map((dealer) => ({
    ...dealer,
    operational_score: buildDealerScore(dealer),
  }));
}

export async function getDealerProfile(dealerId) {
  const dealer = await dealersRepository.getDealerById(dealerId);

  if (!dealer) {
    throw new AppError("Lojista não encontrado", 404);
  }

  const ads = await dealersRepository.listDealerAds(dealerId, 24);

  return {
    dealer: {
      ...dealer,
      operational_score: buildDealerScore({
        active_ads: ads.length,
        highlight_ads: ads.filter(
          (item) => item.highlight_until && new Date(item.highlight_until) > new Date()
        ).length,
        verified: dealer.verified,
      }),
    },
    ads,
  };
}

export async function getAcquisitionTargetsByCity(cityId, limit = 50) {
  const dealers = await dealersRepository.listDealersForAcquisition(cityId, limit);

  return dealers.map((dealer) => ({
    ...dealer,
    acquisition_priority_score:
      (dealer.verified ? 20 : 0) + Math.max(0, 30 - Number(dealer.active_ads || 0)),
  }));
}
