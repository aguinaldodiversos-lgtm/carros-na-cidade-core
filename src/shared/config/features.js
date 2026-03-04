// src/shared/config/features.js
export const features = {
  bannerWorkerEnabled: (process.env.ENABLE_BANNER_WORKER || "false") === "true",

  // local-first
  localAIEnabled: (process.env.LOCAL_AI_ENABLED || "true") === "true",

  // premium only when needed
  premiumAIEnabled: (process.env.PREMIUM_AI_ENABLED || "false") === "true",
};
