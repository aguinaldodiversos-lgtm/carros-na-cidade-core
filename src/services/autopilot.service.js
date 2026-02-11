const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   OBTER RADAR DE CIDADES
===================================================== */
async function getCityRadar() {
  const result = await pool.query(`
    SELECT
      COALESCE(a.city, al.city) AS city,
      COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') AS ads_count,
      COUNT(DISTINCT al.id) AS alerts_count
    FROM ads a
    FULL JOIN alerts al ON al.city = a.city
    GROUP BY city
  `);

  return result.rows.map((row) => {
    const alerts = parseInt(row.alerts_count || 0);
    const ads = parseInt(row.ads_count || 0);

    const score = alerts / (ads + 1);

    return {
      city: row.city,
      alerts,
      ads,
      score,
    };
  });
}

/* =====================================================
   REGISTRAR AÇÃO
===================================================== */
async function registerAction(city, type, description) {
  await pool.query(
    `
    INSERT INTO autopilot_actions (city, action_type, description)
    VALUES ($1, $2, $3)
    `,
    [city, type, description]
  );
}

/* =====================================================
   EXECUÇÃO DO AUTOPILOTO
===================================================== */
async function runAutopilot() {
  try {
    console.log("🤖 Autopilot rodando...");

    const radar = await getCityRadar();

    const strategicCities = radar
      .filter((c) => c.score > 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    for (const city of strategicCities) {
      const description = `Cidade estratégica detectada: ${city.city} (score ${city.score.toFixed(
        2
      )})`;

      await registerAction(city.city, "city_campaign", description);

      console.log("🚀 Ação automática:", description);
    }
  } catch (err) {
    console.error("Erro no autopilot:", err);
  }
}

module.exports = { runAutopilot };
