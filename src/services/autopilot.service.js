const { Pool } = require("pg");
const { runAutopilotCampaigns } = require("./autopilotCampaign.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   OBTER RADAR DE CIDADES
===================================================== */
async function getCityRadar() {
  try {
    const result = await pool.query(`
      SELECT
        c.name AS city,
        COUNT(a.id) FILTER (WHERE a.status = 'active') AS ads_count,
        COUNT(al.id) AS alerts_count
      FROM cities c
      LEFT JOIN ads a ON a.city = c.name
      LEFT JOIN alerts al ON al.city = c.name
      GROUP BY c.name
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
  } catch (err) {
    console.error("Erro ao gerar radar de cidades:", err);
    return [];
  }
}

/* =====================================================
   REGISTRAR AÇÃO
===================================================== */
async function registerAction(city, type, description) {
  try {
    await pool.query(
      `
      INSERT INTO autopilot_actions (city, action_type, description)
      VALUES ($1, $2, $3)
    `,
      [city, type, description]
    );
  } catch (err) {
    console.error("Erro ao registrar ação do autopilot:", err);
  }
}

/* =====================================================
   EXECUÇÃO DO AUTOPILOTO
===================================================== */
async function runAutopilot() {
  try {
    console.log("🤖 Autopilot rodando...");

    const radar = await getCityRadar();

    if (!radar.length) {
      console.log("⚠️ Nenhum dado de radar disponível");
      return;
    }

    const strategicCities = r
