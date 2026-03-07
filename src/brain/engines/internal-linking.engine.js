import { logger } from "../../shared/logger.js";
import * as linkingRepository from "../../read-models/seo/linking.repository.js";

function buildAnchorText(cluster) {
  if (cluster.brand && cluster.model) {
    return `${cluster.brand} ${cluster.model}`;
  }

  if (cluster.brand) {
    return `Carros ${cluster.brand}`;
  }

  if (cluster.cluster_type === "city_opportunities") {
    return "Oportunidades na cidade";
  }

  if (cluster.cluster_type === "city_below_fipe") {
    return "Carros abaixo da FIPE";
  }

  return "Ver mais veículos";
}

export async function runInternalLinkingEngine(cityId) {
  logger.info({ cityId }, "[brain.internal-linking] Iniciando linking interno");

  const clusters = await linkingRepository.listClusterPathsByCity(cityId);

  for (const source of clusters) {
    for (const target of clusters) {
      if (source.path === target.path) continue;

      const sameBrand =
        source.brand &&
        target.brand &&
        String(source.brand).toLowerCase() === String(target.brand).toLowerCase();

      const sameModel =
        source.model &&
        target.model &&
        String(source.model).toLowerCase() === String(target.model).toLowerCase();

      let score = 0;

      if (sameBrand) score += 30;
      if (sameModel) score += 25;
      if (target.money_page) score += 20;
      score += Math.min(20, Number(target.priority || 0) / 5);

      if (score < 20) continue;

      await linkingRepository.upsertInternalLink({
        sourcePath: source.path,
        targetPath: target.path,
        anchorText: buildAnchorText(target),
        cityId,
        brand: target.brand,
        model: target.model,
        linkType: "territorial",
        score,
      });
    }
  }

  logger.info(
    { cityId, totalClusters: clusters.length },
    "[brain.internal-linking] Linking interno finalizado"
  );

  return { cityId, totalClusters: clusters.length };
}
