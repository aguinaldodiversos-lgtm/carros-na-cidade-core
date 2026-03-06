import "dotenv/config";
import pg from "pg";
import { logger } from "../shared/logger.js";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let strategyInterval = null;
let strategyRunning = false;
let strategyStarted = false;

async function runStrategyWorker() {
  if (strategyRunning) {
    logger.warn("[strategy.worker] Execução já em andamento; nova rodada ignorada");
    return;
  }

  strategyRunning = true;

  try {
    logger.info("[strategy.worker] Iniciando processamento");

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

      let campaigns = [];

      if (priority_level === "critical") {
        campaigns = ["dealer_acquisition", "seo_city"];
      } else if (priority_level === "high") {
        campaigns = ["dealer_acquisition"];
      } else if (priority_level === "medium") {
        campaigns = ["seo_city"];
      }

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

        logger.info(
          {
            cityId: city_id,
            campaignType: type,
            opportunityScore: opportunity_score,
            priorityLevel: priority_level,
          },
          "[strategy.worker] Campanha criada"
        );
      }
    }

    logger.info("[strategy.worker] Processamento finalizado com sucesso");
  } catch (error) {
    logger.error({ error }, "[strategy.worker] Erro no processamento");
  } finally {
    strategyRunning = false;
  }
}

export async function startStrategyWorker() {
  if (strategyStarted) {
    logger.warn("[strategy.worker] Worker já inicializado");
    return;
  }

  strategyStarted = true;

  const intervalMs = Number(
    process.env.STRATEGY_WORKER_INTERVAL_MS || 4 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[strategy.worker] Inicializando worker");

  await runStrategyWorker();

  strategyInterval = setInterval(() => {
    runStrategyWorker().catch((error) => {
      logger.error({ error }, "[strategy.worker] Erro na execução agendada");
    });
  }, intervalMs);

  logger.info("[strategy.worker] Agendamento configurado");
}

export async function stopStrategyWorker() {
  if (!strategyStarted) {
    logger.info("[strategy.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (strategyInterval) {
    clearInterval(strategyInterval);
    strategyInterval = null;
  }

  strategyStarted = false;

  logger.info("[strategy.worker] Worker encerrado com sucesso");
}
