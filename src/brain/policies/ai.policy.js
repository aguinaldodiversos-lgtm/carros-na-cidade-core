import crypto from "crypto";
import { resolveAiStagePolicy } from "./ai-stage.policy.js";

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export class AiPolicy {
  constructor({ logger, cache }) {
    this.logger = logger;
    this.cache = cache;
  }

  isEnabled() {
    return String(process.env.AI_ENABLED || "true") === "true";
  }

  mode() {
    return String(process.env.AI_MODE || "hybrid");
  }

  requirePremiumFor() {
    return new Set(parseCsv(process.env.AI_REQUIRE_PREMIUM_FOR));
  }

  budgetDailyUsd() {
    const n = Number(process.env.AI_BUDGET_DAILY_USD || 0);
    return Number.isFinite(n) ? n : 0;
  }

  stagePolicy({ task, context }) {
    return resolveAiStagePolicy({
      stage: context?.stage,
      task,
      forcePremium: context?.forcePremium,
    });
  }

  async canUsePremium({ task, context }) {
    if (!this.isEnabled()) return false;

    const mode = this.mode();
    if (mode === "local") return false;
    if (mode === "premium") return true;

    const stagePolicy = this.stagePolicy({ task, context });

    if (context?.forcePremium) return true;
    if (this.requirePremiumFor().has(task)) return true;
    if (stagePolicy.allowPremium === false) return false;

    const budget = this.budgetDailyUsd();
    if (!budget || budget <= 0) return true;

    const dayKey = new Date().toISOString().slice(0, 10);
    const spendKey = `ai:spend:${dayKey}`;
    const spent = Number((await this.cache.get(spendKey)) || 0);

    return spent < budget;
  }

  resolveExecutionMode({ task, context }) {
    const globalMode = this.mode();

    if (globalMode === "local" || globalMode === "premium") {
      return globalMode;
    }

    const stagePolicy = this.stagePolicy({ task, context });
    return stagePolicy.preferredMode || "local";
  }

  async notePremiumSpend(costUsdEstimate = 0) {
    if (!costUsdEstimate || costUsdEstimate <= 0) return;

    const dayKey = new Date().toISOString().slice(0, 10);
    const spendKey = `ai:spend:${dayKey}`;

    await this.cache.incrByFloat(spendKey, costUsdEstimate);
    await this.cache.expire(spendKey, 60 * 60 * 24 * 2);
  }

  cacheTtlSeconds(task) {
    switch (task) {
      case "ad_description_short":
        return 60 * 60 * 24 * 30;
      case "whatsapp_message":
        return 60 * 60 * 24 * 7;
      case "lead_scoring":
        return 60 * 60 * 12;
      case "seo_city_page":
      case "seo_money_page":
        return 60 * 60 * 24 * 14;
      case "banner_prompt_only":
        return 60 * 60 * 24 * 2;
      default:
        return 60 * 60 * 24;
    }
  }

  shouldCache() {
    return true;
  }

  cacheKey({ task, input, context }) {
    const pii = Boolean(context?.pii);

    const normalized = {
      task,
      input: pii ? "[PII_REDACTED]" : input,
      context: {
        tenantId: context?.tenantId || null,
        city: context?.city || null,
        stage: context?.stage || "discovery",
        locale: context?.locale || "pt-BR",
        quality: context?.quality || "medium",
      },
    };

    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(normalized))
      .digest("hex");

    return `ai:cache:${task}:${hash}`;
  }
}
