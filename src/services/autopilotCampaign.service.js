const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CRIAR CAMPANHA
===================================================== */
async function createCampaign(city, channel, type, budget) {
  await pool.query(
    `
    INSERT INTO autopilot_campaigns
    (city, channel, campaign_type, budget)
    VALUES ($1, $2, $3, $4)
  `,
    [city, channel, type, budget]
  );

  console.log(
    `📢 Campanha criada: ${type} em ${city} via ${channel}`
  );
}

/* =====================================================
   EXECUÇÃO DE CAMPANHAS AUTOMÁTICAS
===================================================== */
async function runAutopilotCampaigns(cities) {
  for (const city of cities) {
    if (city.score > 5) {
      // Campanha Google
      await createCampaign(
        city.city,
        "google",
        "city_search",
        50
      );

      // Campanha Meta
      await createCampaign(
        city.city,
        "meta",
        "city_awareness",
        30
      );
    }
  }
}

module.exports = { runAutopilotCampaigns };
