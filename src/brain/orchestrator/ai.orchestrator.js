// src/brain/orchestrator/ai.orchestrator.js
// Orquestrador: decisão (ordem dos provedores) vs execução (chamada + retry + circuit breaker + dedupe).

import {
  OrchestratorInputSchema,
  OrchestratorResultSchema,
} from "../schemas/ai.schemas.js";
import { AiPolicy } from "../policies/ai.policy.js";
import { auditAiCall } from "../audit/ai.audit.js";
import { LocalAiProvider } from "../providers/local.provider.js";
import { PremiumAiProvider } from "../providers/premium.provider.js";
import { buildPrompt } from "../prompts/prompt.builder.js";
import { buildFallback } from "../prompts/fallback.builder.js";
import { resolveProviderOrder } from "./provider-order.js";
import { ProviderCircuitBreaker } from "./circuit-breaker.js";
import { getOrDedupeInFlight } from "./in-flight-dedupe.js";
import { withRetry } from "./retry.js";

export class AiOrchestrator {
  constructor({ logger, cache, aiQueue }) {
    this.logger = logger;
    this.cache = cache;
    this.aiQueue = aiQueue;

    this.policy = new AiPolicy({ logger, cache });
    this.local = new LocalAiProvider({ logger });
    this.premium = new PremiumAiProvider({ logger });

    this.breakers = {
      local: new ProviderCircuitBreaker({ name: "local", logger }),
      premium: new ProviderCircuitBreaker({ name: "premium", logger }),
    };
  }

  /**
   * @param {"local"|"premium"} name
   */
  _dispatchProvider(name, { task, prompt, context }) {
    if (name === "local") {
      if (!this.local.isConfigured()) {
        throw new Error("AI_LOCAL_URL não configurado");
      }
      return this.local.generate({ task, prompt, context });
    }
    if (!this.premium.isConfigured()) {
      throw new Error("OPENAI_API_KEY não configurado");
    }
    return this.premium.generate({ task, prompt, context });
  }

  async _runSingleProviderAttempt(providerName, { task, prompt, context }) {
    const t0 = Date.now();
    const res = await withRetry(
      () => this._dispatchProvider(providerName, { task, prompt, context }),
      {
        logger: this.logger,
        label: `${task}:${providerName}`,
      }
    );
    const latencyMs = res.latencyMs ?? Date.now() - t0;
    return { ...res, latencyMs };
  }

  async generate(payload) {
    const parsed = OrchestratorInputSchema.parse(payload);
    const { task, input, context } = parsed;
    const generateStartedAt = Date.now();

    if (!this.policy.isEnabled()) {
      this.logger.info(
        {
          component: "brain.ai",
          event: "generate_disabled",
          task,
          provider: "template",
          model: null,
          fallbackTriggered: true,
          reason: "AI_DISABLED",
          latencyMs: 0,
          requestId: context?.requestId,
          userId: context?.userId,
        },
        "[brain.ai] política IA desligada — resposta template"
      );

      return OrchestratorResultSchema.parse({
        ok: true,
        task,
        provider: "template",
        cached: false,
        output: buildFallback(task, input),
        meta: { reason: "AI_DISABLED" },
      });
    }

    const cacheKey = this.policy.cacheKey({ task, input, context });
    const shouldCache = this.policy.shouldCache(task);

    if (shouldCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        this.logger.info(
          {
            component: "brain.ai",
            event: "generate_cache_hit",
            task,
            provider: "cache",
            model: null,
            latencyMs: Date.now() - generateStartedAt,
            requestId: context?.requestId,
            userId: context?.userId,
          },
          "[brain.ai] cache hit"
        );

        return OrchestratorResultSchema.parse({
          ok: true,
          task,
          provider: "cache",
          cached: true,
          output: JSON.parse(cached),
          meta: { reason: "CACHE_HIT" },
        });
      }
    }

    const prompt = buildPrompt({ task, input, context });
    const canPremium = await this.policy.canUsePremium({ task, context });
    const executionMode = this.policy.resolveExecutionMode({ task, context });
    const order = resolveProviderOrder({ executionMode, canPremium });

    const dedupeKey = `inflight:${cacheKey}`;
    const t0 = Date.now();

    return getOrDedupeInFlight(dedupeKey, async () => {
      let lastErr = null;

      for (const providerName of order) {
        const breaker = this.breakers[providerName];
        if (breaker.isOpen()) {
          lastErr = new Error(`CIRCUIT_OPEN:${providerName}`);
          this.logger.warn(
            {
              component: "brain.ai",
              event: "provider_skipped",
              task,
              provider: providerName,
              reason: "circuit_open",
              requestId: context?.requestId,
              userId: context?.userId,
            },
            "[brain.ai] provider skipped (circuit open)"
          );
          continue;
        }

        try {
          const res = await this._runSingleProviderAttempt(providerName, {
            task,
            prompt,
            context,
          });

          breaker.recordSuccess();

          if (shouldCache) {
            const ttl = this.policy.cacheTtlSeconds(task);
            await this.cache.set(cacheKey, JSON.stringify(res.output), ttl);
          }

          if (res.provider === "premium") {
            await this.policy.notePremiumSpend(res.costUsdEstimate || 0);
          }

          await auditAiCall({
            logger: this.logger,
            task,
            provider: res.provider,
            model: res.model,
            latencyMs: res.latencyMs,
            cached: false,
            costUsdEstimate: res.costUsdEstimate || 0,
            tenantId: context?.tenantId,
            userId: context?.userId,
            requestId: context?.requestId,
            ok: true,
            error: null,
          });

          this.logger.info(
            {
              component: "brain.ai",
              event: "generate_success",
              task,
              provider: res.provider,
              model: res.model,
              latencyMs: res.latencyMs,
              executionMode,
              stage: context?.stage || "discovery",
              requestId: context?.requestId,
              userId: context?.userId,
              fallbackTriggered: false,
            },
            "[brain.ai] generate ok"
          );

          return OrchestratorResultSchema.parse({
            ok: true,
            task,
            provider: res.provider,
            model: res.model,
            latencyMs: res.latencyMs,
            cached: false,
            costUsdEstimate: res.costUsdEstimate || 0,
            output: res.output,
            meta: {
              ...(res.meta || {}),
              executionMode,
              stage: context?.stage || "discovery",
            },
          });
        } catch (err) {
          lastErr = err;
          breaker.recordFailure();

          this.logger.warn(
            {
              component: "brain.ai",
              event: "provider_failed",
              task,
              provider: providerName,
              executionMode,
              stage: context?.stage || "discovery",
              error: err?.message || String(err),
              requestId: context?.requestId,
              userId: context?.userId,
            },
            "[brain.ai] Provider failed"
          );
        }
      }

      const fallback = buildFallback(task, input);

      await auditAiCall({
        logger: this.logger,
        task,
        provider: "template",
        model: null,
        latencyMs: Date.now() - t0,
        cached: false,
        costUsdEstimate: 0,
        tenantId: context?.tenantId,
        userId: context?.userId,
        requestId: context?.requestId,
        ok: false,
        error: lastErr?.message || "AI_FAILED",
      });

      this.logger.warn(
        {
          component: "brain.ai",
          event: "generate_fallback",
          task,
          executionMode,
          provider: "template",
          model: null,
          fallbackTriggered: true,
          latencyMs: Date.now() - t0,
          error: lastErr?.message || "AI_FAILED",
          requestId: context?.requestId,
          userId: context?.userId,
        },
        "[brain.ai] generate fallback template"
      );

      return OrchestratorResultSchema.parse({
        ok: false,
        task,
        provider: "template",
        cached: false,
        output: fallback,
        error: lastErr?.message || "AI_FAILED",
        meta: {
          reason: "FALLBACK_TEMPLATE",
          executionMode,
          stage: context?.stage || "discovery",
        },
      });
    });
  }

  async enqueue(payload, opts = {}) {
    if (!this.aiQueue) {
      throw new Error("AI Queue not configured");
    }

    const parsed = OrchestratorInputSchema.parse(payload);
    const priority = Number(opts.priority || 3);

    const job = await this.aiQueue.add(`ai:${parsed.task}`, parsed, {
      priority,
      jobId: opts.jobId,
    });

    return { jobId: job.id };
  }
}
