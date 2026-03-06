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

export class AiOrchestrator {
  constructor({ logger, cache, aiQueue }) {
    this.logger = logger;
    this.cache = cache;
    this.aiQueue = aiQueue;

    this.policy = new AiPolicy({ logger, cache });
    this.local = new LocalAiProvider({ logger });
    this.premium = new PremiumAiProvider({ logger });
  }

  async generate(payload) {
    const parsed = OrchestratorInputSchema.parse(payload);
    const { task, input, context } = parsed;

    if (!this.policy.isEnabled()) {
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
        return OrchestratorResultSchema.parse({
          ok: true,
          task,
          provider: "cache",
          cached: true,
          output: JSON.parse(cached),
        });
      }
    }

    const prompt = buildPrompt({ task, input, context });

    const canPremium = await this.policy.canUsePremium({ task, context });
    const mode = this.policy.mode();

    const order =
      mode === "premium"
        ? ["premium", "local"]
        : mode === "local"
          ? ["local"]
          : canPremium
            ? ["local", "premium"]
            : ["local"];

    const t0 = Date.now();
    let lastErr = null;

    for (const provider of order) {
      try {
        const res =
          provider === "local"
            ? await this.local.generate({ task, prompt, context })
            : await this.premium.generate({ task, prompt, context });

        const latencyMs = res.latencyMs ?? Date.now() - t0;

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
          latencyMs,
          cached: false,
          costUsdEstimate: res.costUsdEstimate || 0,
          tenantId: context?.tenantId,
          userId: context?.userId,
          requestId: context?.requestId,
          ok: true,
          error: null,
        });

        return OrchestratorResultSchema.parse({
          ok: true,
          task,
          provider: res.provider,
          model: res.model,
          latencyMs,
          cached: false,
          costUsdEstimate: res.costUsdEstimate || 0,
          output: res.output,
          meta: res.meta || {},
        });
      } catch (err) {
        lastErr = err;
        this.logger.warn(
          {
            task,
            provider,
            error: err?.message || String(err),
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

    return OrchestratorResultSchema.parse({
      ok: false,
      task,
      provider: "template",
      cached: false,
      output: fallback,
      error: lastErr?.message || "AI_FAILED",
      meta: { reason: "FALLBACK_TEMPLATE" },
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
