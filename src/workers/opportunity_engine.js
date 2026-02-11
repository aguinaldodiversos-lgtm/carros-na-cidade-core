require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runOpportunityEngine() {
  try {
    console.log("🔍 Rodando Opportunity Engine...");

    // 1) Buscar todas as cidades
    const citiesResult = await pool.query(`
      SELECT id FROM cities
    `);

    const cities = citiesResult.rows;

    for (const city of cities) {
      const cityId = city.id;

      // 2) Calcular demanda (alertas ativos)
      const demandResult = await pool.query(
        `
        SELECT COUNT(*)::int AS demand
        FROM alerts
        WHERE city_id = $1
      `,
        [cityId]
      );

      const demand = demandResult.rows[0].demand || 0;

      // 3) Calcular oferta (anúncios ativos)
      const supplyResult = await pool.query(
        `
        SELECT COUNT(*)::int AS supply
        FROM ads
        WHERE city_id = $1
        AND status = 'active'
      `,
        [cityId]
      );

      const supply = supplyResult.rows[0].supply || 0;

      // 4) Calcular score
      const opportunityScore = demand - supply;

      // 5) Definir prioridade
      let priority = "low";

      if (opportunityScore >= 50) priority = "critical";
      else if (opportunityScore >= 20) priority = "high";
      else if (opportunityScore >= 5) priority = "medium";

      // 6) Inserir registro
      await pool.query(
        `
        INSERT INTO city_opportunities (
          city_id,
          demand_index,
          supply_index,
          opportunity_score,
          priority_level
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
        [cityId, demand, supply, opportunityScore, priority]
      );
    }

    console.log("✅ Opportunity Engine finalizado");
  } catch (err) {
    console.error("❌ Erro no Opportunity Engine:", err);
  }
}

// Executa a cada 6 horas
setInterval(runOpportunityEngine, 6 * 60 * 60 * 1000);

// Executa ao iniciar
runOpportunityEngine();
