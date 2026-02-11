const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function getCityDemand(city) {
  const result = await pool.query(
    `
    SELECT brand, model, COUNT(*) AS total_alerts
    FROM alerts
    WHERE city = $1
    GROUP BY brand, model
    ORDER BY total_alerts DESC
  `,
    [city]
  );

  return result.rows;
}

async function getCitySupply(city) {
  const result = await pool.query(
    `
    SELECT brand, model, COUNT(*) AS ads_count
    FROM ads
    WHERE city = $1
      AND status = 'active'
    GROUP BY brand, model
  `,
    [city]
  );

  return result.rows;
}

function generateCityStrategy(city, demand, supply) {
  const supplyMap = {};

  supply.forEach((s) => {
    const key = `${s.brand}_${s.model}`;
    supplyMap[key] = parseInt(s.ads_count);
  });

  const opportunities = demand.map((d) => {
    const key = `${d.brand}_${d.model}`;
    const ads = supplyMap[key] || 0;
    const score = d.total_alerts / (ads + 1);

    return {
      city,
      brand: d.brand,
      model: d.model,
      alerts: d.total_alerts,
      ads,
      score,
    };
  });

  opportunities.sort((a, b) => b.score - a.score);

  const recommendations = opportunities.slice(0, 3).map((o) => {
    return `Alta demanda por ${o.brand} ${o.model} em ${o.city}. Priorizar campanha local.`;
  });

  return {
    city,
    opportunities: opportunities.slice(0, 10),
    recommendations,
  };
}

async function buildCityStrategy(city) {
  const demand = await getCityDemand(city);
  const supply = await getCitySupply(city);

  return generateCityStrategy(city, demand, supply);
}

module.exports = {
  buildCityStrategy,
};
