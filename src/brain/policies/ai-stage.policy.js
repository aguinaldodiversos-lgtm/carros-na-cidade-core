function normalizeStage(stage) {
  return stage || "discovery";
}

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

  if (task === "ad_description_short") {
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
