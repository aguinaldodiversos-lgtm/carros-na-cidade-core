function normalizeStage(stage) {
  const s = String(stage || "discovery")
    .toLowerCase()
    .trim();
  const known = new Set([
    "discovery",
    "seed",
    "expansion",
    "dominance",
    "optimization",
    "maturity",
  ]);
  if (!s) return "discovery";
  return known.has(s) ? s : s;
}

/**
 * Política de roteamento local vs premium por estágio do território e tipo de tarefa.
 * Objetivo: operação rápida barata (local) por defeito; premium quando o impacto de receita/SEO justifica.
 */
export function resolveAiStagePolicy({ stage, task, forcePremium = false }) {
  const normalizedStage = normalizeStage(stage);

  if (forcePremium) {
    return {
      preferredMode: "premium",
      allowPremium: true,
      quality: "high",
      reason: "FORCE_PREMIUM",
    };
  }

  if (task === "lead_scoring" || task === "whatsapp_message") {
    return {
      preferredMode: "local",
      allowPremium: false,
      quality: "medium",
      reason: "FAST_OPERATIONAL_TASK",
    };
  }

  if (task === "seo_money_page") {
    if (normalizedStage === "dominance" || normalizedStage === "expansion") {
      return {
        preferredMode: "premium",
        allowPremium: true,
        quality: "high",
        reason: "MONEY_PAGE_HIGH_STAGE",
      };
    }

    return {
      preferredMode: "local",
      allowPremium: true,
      quality: "medium",
      reason: "MONEY_PAGE_LOW_STAGE",
    };
  }

  if (task === "seo_city_page") {
    if (normalizedStage === "dominance") {
      return {
        preferredMode: "premium",
        allowPremium: true,
        quality: "high",
        reason: "CITY_PAGE_DOMINANCE",
      };
    }

    if (normalizedStage === "expansion") {
      return {
        preferredMode: "local",
        allowPremium: true,
        quality: "high",
        reason: "CITY_PAGE_EXPANSION",
      };
    }

    if (normalizedStage === "seed") {
      return {
        preferredMode: "local",
        allowPremium: false,
        quality: "medium",
        reason: "CITY_PAGE_SEED",
      };
    }

    return {
      preferredMode: "local",
      allowPremium: false,
      quality: "low",
      reason: "CITY_PAGE_DISCOVERY",
    };
  }

  if (task === "banner_prompt_only") {
    if (normalizedStage === "dominance" || normalizedStage === "expansion") {
      return {
        preferredMode: "premium",
        allowPremium: true,
        quality: "high",
        reason: "BANNER_CREATIVE_HIGH_STAGE",
      };
    }
    if (normalizedStage === "seed") {
      return {
        preferredMode: "local",
        allowPremium: false,
        quality: "medium",
        reason: "BANNER_CREATIVE_SEED",
      };
    }
    return {
      preferredMode: "local",
      allowPremium: true,
      quality: "medium",
      reason: "BANNER_CREATIVE_DEFAULT",
    };
  }

  if (task === "ad_description_short") {
    if (normalizedStage === "dominance" || normalizedStage === "optimization") {
      return {
        preferredMode: "local",
        allowPremium: true,
        quality: "high",
        reason: "DESCRIPTION_HOT_MARKET_OPTIONAL_PREMIUM",
      };
    }
    return {
      preferredMode: "local",
      allowPremium: false,
      quality: "medium",
      reason: "DESCRIPTION_SCALE",
    };
  }

  return {
    preferredMode: "local",
    allowPremium: false,
    quality: "medium",
    reason: "DEFAULT_POLICY",
  };
}
