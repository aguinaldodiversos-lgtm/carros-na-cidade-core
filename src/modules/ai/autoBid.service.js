// src/modules/ai/autoBid.service.js

/* =====================================================
   CONFIGURAÇÕES GLOBAIS
===================================================== */

const BASE_BID = 1.0;
const MAX_BID = 10.0;
const MIN_BID = 0.5;

/* =====================================================
   CÁLCULO DE AUTOBID INTELIGENTE
===================================================== */

export function calculateAutoBid(cityData = {}) {
  let bid = BASE_BID;

  const {
    roas = 0,
    roi = 0,
    conversion_rate = 0,
    cpa = 0,
    demand_score = 1,
    cluster = "STABLE",
    growth_score = 0,
  } = cityData;

  /* ===============================
     1️⃣ ROAS (Retorno sobre Ads)
  =============================== */

  if (roas > 4) bid += 1.2;
  else if (roas > 3) bid += 0.8;
  else if (roas > 2) bid += 0.4;

  /* ===============================
     2️⃣ ROI líquido
  =============================== */

  if (roi > 1) bid += 0.8;
  else if (roi > 0.5) bid += 0.4;

  /* ===============================
     3️⃣ Taxa de conversão
  =============================== */

  if (conversion_rate > 0.05) bid += 0.7;
  else if (conversion_rate > 0.03) bid += 0.4;

  /* ===============================
     4️⃣ CPA (quanto menor melhor)
  =============================== */

  if (cpa > 0 && cpa < 20) bid += 0.6;
  else if (cpa > 0 && cpa < 40) bid += 0.3;

  /* ===============================
     5️⃣ Demanda da cidade
  =============================== */

  bid *= demand_score;

  /* ===============================
     6️⃣ Cluster estratégico
  =============================== */

  switch (cluster) {
    case "DOMINANT":
      bid += 1.0;
      break;

    case "EXPANSION_OPPORTUNITY":
      bid += 1.5;
      break;

    case "EMERGING":
      bid += 0.8;
      break;

    case "DECLINING":
      bid -= 0.8;
      break;

    default:
      break;
  }

  /* ===============================
     7️⃣ Growth Score (IA)
  =============================== */

  if (growth_score > 80) bid += 1.0;
  else if (growth_score > 60) bid += 0.6;

  /* ===============================
     8️⃣ Proteção contra extremos
  =============================== */

  if (bid > MAX_BID) bid = MAX_BID;
  if (bid < MIN_BID) bid = MIN_BID;

  return Number(bid.toFixed(2));
}
