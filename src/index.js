require("dotenv").config();

const app = require("./app");
const runMigrations = require("./database/migrate");

const PORT = process.env.PORT || 3000;

/* =====================================================
   IMPORTAÇÃO SEGURA DOS WORKERS
===================================================== */

let startStrategyWorker;
try {
  ({ startStrategyWorker } = require("./workers/strategy.worker"));
} catch {
  console.warn("⚠️ Strategy worker não encontrado, ignorando...");
}

let startAutopilotWorker;
try {
  ({ startAutopilotWorker } = require("./workers/autopilot.worker"));
} catch {
  console.warn("⚠️ Autopilot worker não encontrado, ignorando...");
}

let startSeoWorker;
try {
  ({ startSeoWorker } = require("./workers/seo.worker"));
} catch {
  console.warn("⚠️ SEO worker não encontrado, ignorando...");
}

let startOpportunityEngine;
try {
  ({ startOpportunityEngine } = require("./workers/opportunity_engine"));
} catch {
  console.warn("⚠️ Opportunity engine não encontrado, ignorando...");
}

let startEventBannerWorker;
try {
  ({ startEventBannerWorker } = require("./workers/event_banner.worker"));
} catch {
  console.warn("⚠️ Event banner worker não encontrado, ignorando...");
}

let startEventDispatchWorker;
try {
  ({ startEventDispatchWorker } = require("./workers/event_dispatch.worker"));
} catch {
  console.warn("⚠️ Event dispatch worker não encontrado, ignorando...");
}

let startDealerAcquisitionWorker;
try {
  ({
    startDealerAcquisitionWorker,
  } = require("./workers/dealer_acquisition.worker"));
} catch {
  console.warn("⚠️ Dealer acquisition worker não encontrado, ignorando...");
}

let startCityMetricsWorker;
try {
  ({ startCityMetricsWorker } = require("./workers/city_metrics.worker"));
} catch {
  console.warn("⚠️ City metrics worker não encontrado, ignorando...");
}

let startDealerReportWorker;
try {
  ({
