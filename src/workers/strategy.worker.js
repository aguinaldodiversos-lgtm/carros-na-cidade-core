require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runStrategyWorker() {
  try {
    console.log("🧠 Rodando Strategy Worker...");

    // 1) Buscar últimas oportunidades por cidade
    const opportunities = await pool.query(`
      SELECT DISTINCT ON (co.city_id)
        co.city_id,
        co.opportunity_score,
        co.priority_level
      FROM city_opportunities co
      ORDER BY co.city_id, co.created_at DESC
    `);

    for (const opp of opportunities.rows) {
      const { city_id, opportunity_score, priority_level } = opp;

      // 2) Verificar se já existe campanha ativa para a cidade
      const existing = await pool.query(
        `
        SELECT id
        FROM autopilot_campaigns
        WHERE city_id = $1
        AND status IN ('pending', 'running')
        LIMIT 1
        `,
        [city_id]
      );

      if (existing.rowCount > 0) {
        continue;
      }

      // 3) Definir campanhas conforme prioridade
      let campaigns = [];

      if (priority_level === "critical") {
        campaigns = ["dealer_acquisition", "seo_city"];
      } else if (priority_level === "high") {
        campaigns = ["dealer_acquisition"];
      } else if (priority_level === "medium") {
        campaigns = ["seo_city"];
      }

      // 4) Criar campanhas
      for (const type of campaigns) {
        await pool.query(
          `
          INSERT INTO autopilot_campaigns (
            city_id,
            campaign_type,
            opportunity_score,
            status
          )
          VALUES ($1, $2, $3, 'pending')
        `,
          [city_id, type, opportunity_score]
        );

        console.log(
          `📢 Campanha criada: ${type} para cidade ${city_id}`
        );
      }
    }

    console.log("✅ Strategy Worker finalizado");
  } catch (err) {
    console.error("❌ Erro no Strategy Worker:", err);
  }
}

// Executa a cada 4 horas
setInterval(runStrategyWorker, 4 * 60 * 60 * 1000);

// Executa ao iniciar
runStrategyWorker();
