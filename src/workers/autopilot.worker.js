import "dotenv/config";
import pg from "pg";
import { logger } from "../shared/logger.js";

import seoPagesService from "../services/seo/seoPages.service.js";
import dealerAcquisitionService from "../services/acquisition/dealerAcquisition.service.js";
import localCampaignService from "../services/campaigns/localCampaign.service.js";

const { Pool } = pg;
const { garantirSEO } = seoPagesService;
const { ativarAquisicaoDeLojistas } = dealerAcquisitionService;
const { criarCampanhaLocal } = localCampaignService;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LEAD_META = Number(process.env.AUTOPILOT_LEAD_META || 20);
const ESTOQUE_MINIMO = Number(process.env.AUTOPILOT_ESTOQUE_MINIMO || 30);

let autopilotInterval = null;
let autopilotRunning = false;
let autopilotStarted = false;

async function getCidadeFoco() {
  const result = await pool.query(
    `
    SELECT value
    FROM system_settings
    WHERE key = 'cidade_foco'
    LIMIT 1
    `
  );

  if (result.rows.length === 0) return null;

  return Number.parseInt(result.rows[0].value, 10);
}

async function processarCidade(cidade, cidadeFocoId) {
  try {
    const isCidadeFoco = cidade.id === cidadeFocoId;

    const oppResult = await pool.query(
      `
      SELECT priority_level
      FROM city_opportunities
      WHERE city_id = $1
      LIMIT 1
      `,
      [cidade.id]
    );

    if (oppResult.rows.length === 0) return;

    const oportunidade = oppResult.rows[0].priority_level;

    const tierAtiva = ["critical", "high", "medium"].includes(oportunidade);
    if (!isCidadeFoco && !tierAtiva) {
      return;
    }

    logger.info(
      {
        cityId: cidade.id,
        cityName: cidade.name,
        isCidadeFoco,
        prioridade: oportunidade,
      },
      "[autopilot.worker] Processando cidade"
    );

    await garantirSEO(cidade, pool);

    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM alerts
      WHERE city_id = $1
      `,
      [cidade.id]
    );

    const totalLeads = leadsResult.rows[0]?.total || 0;
    const metaLeads = isCidadeFoco ? LEAD_META * 2 : LEAD_META;

    if (totalLeads < metaLeads) {
      await criarCampanhaLocal(cidade, pool);

      logger.info(
        {
          cityId: cidade.id,
          totalLeads,
          metaLeads,
        },
        "[autopilot.worker] Campanha local acionada"
      );
    }

    const stockResult = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM ads
      WHERE city_id = $1
        AND status = 'active'
      `,
      [cidade.id]
    );

    const estoque = stockResult.rows[0]?.total || 0;
    const metaEstoque = isCidadeFoco ? ESTOQUE_MINIMO * 2 : ESTOQUE_MINIMO;

    if (estoque < metaEstoque) {
      await ativarAquisicaoDeLojistas(cidade, pool);

      logger.info(
        {
          cityId: cidade.id,
          estoque,
          metaEstoque,
        },
        "[autopilot.worker] Aquisição de lojistas acionada"
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
        cityId: cidade?.id,
        cityName: cidade?.name,
      },
      "[autopilot.worker] Erro ao processar cidade"
    );
  }
}

async function runAutopilotWorker() {
  if (autopilotRunning) {
    logger.warn("[autopilot.worker] Execução já em andamento; nova rodada ignorada");
    return;
  }

  autopilotRunning = true;

  try {
    logger.info("[autopilot.worker] Iniciando processamento");

    const cidadeFocoId = await getCidadeFoco();

    if (!cidadeFocoId) {
      logger.warn("[autopilot.worker] Nenhuma cidade foco definida");
    }

    const citiesResult = await pool.query(`
      SELECT id, name, slug
      FROM cities
    `);

    for (const cidade of citiesResult.rows) {
      await processarCidade(cidade, cidadeFocoId);
    }

    logger.info("[autopilot.worker] Processamento finalizado com sucesso");
  } catch (error) {
    logger.error({ error }, "[autopilot.worker] Erro no processamento");
  } finally {
    autopilotRunning = false;
  }
}

export async function startAutopilotWorker() {
  if (autopilotStarted) {
    logger.warn("[autopilot.worker] Worker já inicializado");
    return;
  }

  autopilotStarted = true;

  const intervalMs = Number(
    process.env.AUTOPILOT_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  logger.info({ intervalMs }, "[autopilot.worker] Inicializando worker");

  await runAutopilotWorker();

  autopilotInterval = setInterval(() => {
    runAutopilotWorker().catch((error) => {
      logger.error({ error }, "[autopilot.worker] Erro na execução agendada");
    });
  }, intervalMs);

  logger.info("[autopilot.worker] Agendamento configurado");
}

export async function stopAutopilotWorker() {
  if (!autopilotStarted) {
    logger.info("[autopilot.worker] Nenhum worker ativo para encerrar");
    return;
  }

  if (autopilotInterval) {
    clearInterval(autopilotInterval);
    autopilotInterval = null;
  }

  autopilotStarted = false;

  logger.info("[autopilot.worker] Worker encerrado com sucesso");
}
