const { Pool } = require("pg");
const axios = require("axios");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CONFIG
===================================================== */

const COMPETITORS = [
  { name: "webmotors" },
  { name: "olx" },
  { name: "mercadolivre" },
  { name: "icarros" },
];

/* =====================================================
   DEMANDA INTERNA
===================================================== */

async function getInternalDemand() {
  const result = await pool.query(`
    SELECT
      city,
      brand,
      model,
      COUNT(*) AS total_alerts
    FROM alerts
    WHERE brand IS NOT NULL
      AND model IS NOT NULL
    GROUP BY city, brand, model
  `);

  return result.rows;
}

/* =====================================================
   OFERTA INTERNA
===================================================== */

async function getInternalSupply() {
  const result = await pool.query(`
    SELECT
      city,
      brand,
      model,
      COUNT(*) AS ads_count
    FROM ads
    WHERE status = 'active'
    GROUP BY city, brand, model
  `);

  return result.rows;
}

/* =====================================================
   SIMULAÇÃO DE DADOS DE CONCORRENTES
   (depois pode virar scraping real)
===================================================== */

async function getCompetitorSupply(city) {
  // simulação inicial
  return {
    webmotors: Math.floor(Math.random() * 5000),
    olx: Math.floor(Math.random() * 3000),
    mercadolivre: Math.floor(Math.random() * 2000),
    icarros: Math.floor(Math.random() * 1500),
  };
}

/* =====================================================
   CÁLCULO DE OPORTUNIDADES
===================================================== */

function calculateOpportunities(demand, supply) {
  const supplyMap = {};

  supply.forEach((s) => {
    const key = `${s.city}_${s.brand}_${s.model}`;
    supplyMap[key] = parseInt(s.ads_count);
  });

  const opportunities = demand.map((d) => {
    const key = `${d.city}_${d.brand}_${d.model}`;
    const ads = supplyMap[key] || 0;

    const score = d.total_alerts / (ads + 1);

    let level = "baixo";
    if (score > 10) level = "critico";
    else if (score > 5) level = "alto";
    else if (score > 2) level = "medio";

    return {
      city: d.city,
      brand: d.brand,
      model: d.model,
      alerts: d.total_alerts,
      ads,
      score,
      level,
    };
  });

  return opportunities.sort((a, b) => b.score - a.score);
}

/* =====================================================
   GERA RECOMENDAÇÕES
===================================================== */

function generateRecommendations(opps) {
  const recs = [];

  opps.slice(0, 5).forEach((o) => {
    if (o.level === "critico") {
      recs.push(
        `Alta demanda por ${o.brand} ${o.model} em ${o.city}. Priorizar campanha local.`
      );
    } else if (o.level === "alto") {
      recs.push(
        `Boa oportunidade para ${o.brand} ${o.model} em ${o.city}.`
      );
    }
  });

  return recs;
}

/* =====================================================
   RELATÓRIO COMPLETO
===================================================== */

async function generateMarketIntelligence() {
  const demand = await getInternalDemand();
  const supply = await getInternalSupply();

  const opportunities = calculateOpportunities(demand, supply);
  const recommendations = generateRecommendations(opportunities);

  return {
    opportunities: opportunities.slice(0, 20),
    recommendations,
  };
}

module.exports = {
  generateMarketIntelligence,
};
