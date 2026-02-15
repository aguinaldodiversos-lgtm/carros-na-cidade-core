require("dotenv").config();
const { Pool } = require("pg");

const {
  calcularOportunidade,
  classificarOportunidade,
} = require("../services/strategy/opportunity.service");

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

      // 2) Calcular alertas (demanda)
      const demandResult = await pool.query(
        `
        SELECT COUNT(*)::int AS demand
        FROM alerts
        WHERE city_id = $1
      `,
        [cityId]
      );

      const alertDemand = demandResult.rows[0].demand || 0;

      // 3) Calcular anúncios ativos (oferta)
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

      // 4) Simular concorrência (por enquanto fixo)
      // Depois pode vir de scraping ou API externa
      const concorrenciaEstimado = 10;

      // 5) Calcular score com lógica estratégica
      const score = calcularOportunidade({
        buscas: 0,
        alertas: alertDemand,
        total_anuncios: supply,
        concorrentes_estimados: concorrenciaEstimado,
      });

      const priority = classificarOportunidade(score);

      // 6) Upsert na tabela
      await pool.query(
        `
        INSERT INTO city_opportunities (
          city_id,
          demand_index,
          supply_index,
          opportunity_score,
          priority_level,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (city_id)
        DO UPDATE SET
          demand_index = EXCLUDED.demand_index,
          supply_index = EXCLUDED.supply_index,
          opportunity_score = EXCLUDED.opportunity_score,
          priority_level = EXCLUDED.priority_level,
          updated_at = NOW()
      `,
        [cityId, alertDemand, supply, score, priority]
      );

      console.log(
        `📊 Cidade ${cityId} → score: ${score.toFixed(
          2
        )} | prioridade: ${priority}`
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
