import { slugify } from "../../../shared/utils/slugify.js";
import * as seoContentRepository from "./seo-content.repository.js";
import { AiOrchestrator } from "../../../brain/orchestrator/ai.orchestrator.js";
import { createRedisClient, createCache } from "../../../brain/cache/ai.cache.js";
import { logger } from "../../../shared/logger.js";

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

export async function generateSeoArticle({ city, brand, model }) {
  const orchestrator = getOrchestrator();

  const result = await orchestrator.generate({
    task: "seo_city_page",
    input: {
      city,
      brand,
      model,
      objective: "Gerar artigo local para página de busca automotiva",
    },
    context: {
      locale: "pt-BR",
      quality: "high",
      city,
    },
  });

  const title = `${brand} ${model} em ${city}`;
  const slug = slugify(`${brand}-${model}-em-${city}`);

  return {
    title,
    slug,
    content: typeof result.output === "string" ? result.output : JSON.stringify(result.output),
    meta: result.meta || {},
    provider: result.provider,
  };
}

export async function generateCityDemandArticles(cidade) {
  const models = await seoContentRepository.listTopDemandModelsByCity(cidade.id, 2);
  const createdPosts = [];

  for (const row of models) {
    const { brand, model } = row;

    const exists = await seoContentRepository.blogPostExists({
      city: cidade.name,
      brand,
      model,
    });

    if (exists) {
      continue;
    }

    const article = await generateSeoArticle({
      city: cidade.name,
      brand,
      model,
    });

    const created = await seoContentRepository.createBlogPost({
      title: article.title,
      content: article.content,
      city: cidade.name,
      brand,
      model,
      slug: article.slug,
    });

    createdPosts.push(created);
  }

  return createdPosts;
}
