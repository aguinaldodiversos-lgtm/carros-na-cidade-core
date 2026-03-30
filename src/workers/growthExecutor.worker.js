// src/workers/growthExecutor.worker.js

import { pool } from "../infrastructure/database/db.js";

async function executePendingActions() {
  const actions = await pool.query(
    `
    SELECT * FROM growth_actions
    WHERE status = 'pending'
    ORDER BY priority DESC
    LIMIT 20
    `
  );

  for (const action of actions.rows) {
    try {
      switch (action.action_type) {
        case "IMPROVE_SEO":
          console.log("🔧 Executando melhoria SEO para cidade", action.city_id);
          break;

        case "ACQUIRE_DEALERS":
          console.log("📞 Iniciando aquisição de lojistas", action.city_id);
          break;

        case "RUN_PAID_CAMPAIGN":
          console.log("📢 Ativando campanha paga", action.city_id);
          break;

        default:
          console.log("⚠️ Ação desconhecida", action.action_type);
      }

      await pool.query(`UPDATE growth_actions SET status = 'done' WHERE id = $1`, [action.id]);
    } catch (err) {
      await pool.query(`UPDATE growth_actions SET status = 'failed' WHERE id = $1`, [action.id]);
    }
  }
}

export function startGrowthExecutorWorker() {
  setInterval(executePendingActions, 5 * 60 * 1000);
}
