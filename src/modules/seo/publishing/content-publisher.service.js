import { AiOrchestrator } from "../../../brain/orchestrator/ai.orchestrator.js";
import { createRedisClient, createCache } from "../../../brain/cache/ai.cache.js";
import { logger } from "../../../shared/logger.js";
import * as contentPublisherRepository from "./content-publisher.repository.js";

let orchestratorInstance = null;

function getOrchestrator() {
  if (orchestratorInstance) return orchestratorInstance;

  const redis = createRedisClient({ logger });
  const cache = createCache({ redis });

  orchestratorInstance = new AiOrchestrator({
    logger,
    cache,
    aiQueue: null,
  });

  return orchestratorInstance;
}

function buildPublicationTitle(cluster) {
  if (cluster.cluster_type === "city_home") {
    return `Carros em ${cluster.city_name}${cluster.city_state ? ` - ${cluster.city_state}` : ""}`;
  }

  if (cluster.cluster_type === "city_opportunities") {
    return `Oportunidades de carros em ${cluster.city_name}${cluster.city_state ? ` - ${cluster.city_state}` : ""}`;
  }

  if (cluster.cluster_type === "city_below_fipe") {
    return `Carros abaixo da FIPE em ${cluster.city_name}${cluster.city_state ? ` - ${cluster.city_state}` : ""}`;
  }

  if (cluster.cluster_type === "city_brand_model") {
    return `${cluster.brand} ${cluster.model} em ${cluster.city_name}${cluster.city_state ? ` - ${cluster.city_state}` : ""}`;
  }

  if (cluster.cluster_type === "city_brand") {
    return `${cluster.brand} em ${cluster.city_name}${cluster.city_state ? ` - ${cluster.city_state}` : ""}`;
  }

  return `Veículos em ${cluster.city_name}`;
}

function buildExcerpt(title) {
  return `${title}. Veja ofertas locais, oportunidades e anúncios relevantes da sua região.`;
}

function resolveTask(cluster) {
  if (cluster.money_page) return "seo_money_page";
  return "seo_city_page";
}

export async function publishClusterContent(cluster) {
  const orchestrator = getOrchestrator();
  const task = resolveTask(cluster);

  const result = await orchestrator.generate({
    task,
    input: {
      city: cluster.city_name,
      state: cluster.city_state,
      brand: cluster.brand,
      model: cluster.model,
      clusterType: cluster.cluster_type,
      path: cluster.path,
      objective: "Gerar página SEO territorial para portal automotivo",
    },
    context: {
      locale: "pt-BR",
      city: cluster.city_name,
      stage: cluster.stage || "discovery",
      quality: cluster.money_page ? "high" : "medium",
      forcePremium: Boolean(cluster.money_page && Number(cluster.ranking_priority || 0) >= 90),
    },
  });

  const title = buildPublicationTitle(cluster);
  const content =
    typeof result.output === "string"
      ? result.output
      : JSON.stringify(result.output);

  const publication = await contentPublisherRepository.upsertSeoPublication({
    clusterPlanId: cluster.id,
    path: cluster.path,
    title,
    content,
    excerpt: buildExcerpt(title),
    cityId: cluster.city_id,
    brand: cluster.brand || null,
    model: cluster.model || null,
    publicationType: cluster.cluster_type,
    contentProvider: result.provider,
    contentStage: cluster.stage || "discovery",
    isMoneyPage: Boolean(cluster.money_page),
    status: "published",
  });

  await contentPublisherRepository.markClusterPublished(cluster.id);

  return publication;
}
