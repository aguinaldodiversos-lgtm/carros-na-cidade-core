import { AiOrchestrator } from "../../../brain/orchestrator/ai.orchestrator.js";
import { createRedisClient, createCache } from "../../../brain/cache/ai.cache.js";
import { logger } from "../../../shared/logger.js";
import { withRetry } from "../../../shared/observability/retry.js";
import { CircuitBreaker } from "../../../shared/observability/circuit-breaker.js";
import { startWorkerRun, finishWorkerRun } from "../../../shared/observability/worker.metrics.js";
import * as contentPublisherRepository from "./content-publisher.repository.js";
import * as publicationAuditService from "./publication-audit.service.js";
import { validatePublicationPayload } from "./publication-validator.service.js";

let orchestratorInstance = null;
const providerCircuit = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeMs: 30000,
});

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

function resolveTask(cluster) {
  return cluster.money_page ? "seo_money_page" : "seo_city_page";
}

export async function publishClusterContent(cluster) {
  const runId = await startWorkerRun("content-publisher", {
    clusterPlanId: cluster.id,
    path: cluster.path,
  });

  const startedAt = Date.now();

  try {
    if (!providerCircuit.canExecute()) {
      throw new Error("AI provider circuit breaker open");
    }

    const orchestrator = getOrchestrator();
    const task = resolveTask(cluster);

    const aiResult = await withRetry(
      async () =>
        orchestrator.generate({
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
            forcePremium: Boolean(
              cluster.money_page && Number(cluster.ranking_priority || 0) >= 90
            ),
          },
        }),
      {
        name: "publish-cluster-content",
        retries: 3,
        baseDelayMs: 600,
        maxDelayMs: 5000,
      }
    );

    providerCircuit.success();

    const rawPublication = {
      clusterPlanId: cluster.id,
      path: cluster.path,
      title: buildPublicationTitle(cluster),
      content:
        typeof aiResult.output === "string"
          ? aiResult.output
          : JSON.stringify(aiResult.output),
      excerpt: null,
      cityId: cluster.city_id,
      brand: cluster.brand || null,
      model: cluster.model || null,
      publicationType: cluster.cluster_type,
      contentProvider: aiResult.provider,
      contentStage: cluster.stage || "discovery",
      isMoneyPage: Boolean(cluster.money_page),
      status: "published",
    };

    const validation = validatePublicationPayload(rawPublication);

    const publication = await contentPublisherRepository.upsertSeoPublication({
      ...validation.normalized,
      clusterPlanId: cluster.id,
      cityId: cluster.city_id,
      brand: cluster.brand || null,
      model: cluster.model || null,
      publicationType: cluster.cluster_type,
      contentProvider: aiResult.provider,
      contentStage: cluster.stage || "discovery",
      isMoneyPage: Boolean(cluster.money_page),
      status: validation.ok ? "published" : "review_required",
    });

    await contentPublisherRepository.markClusterPublished(cluster.id);
    await publicationAuditService.auditSinglePublication(publication);

    await finishWorkerRun(runId, "content-publisher", "success", {
      durationMs: Date.now() - startedAt,
      clusterPlanId: cluster.id,
      publicationId: publication.id,
      score: validation.score,
    });

    return publication;
  } catch (error) {
    providerCircuit.failure();

    await finishWorkerRun(runId, "content-publisher", "failed", {
      durationMs: Date.now() - startedAt,
      clusterPlanId: cluster.id,
      error: error?.message || String(error),
    });

    throw error;
  }
}
