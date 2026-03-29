/**
 * API de orquestração do autopilot de crescimento por cidade.
 * Reexporta o pipeline completo para jobs/cron/admin sem duplicar workers.
 */
export { runGrowthBrainPipeline, runOpportunityScoringOnly } from "./growth-brain-pipeline.js";
