import { query } from "../../infrastructure/database/db.js";
import {
  incrementCounter,
  observeHistogram,
  setGauge,
} from "./metrics.registry.js";

export async function startWorkerRun(workerName, meta = {}) {
  const result = await query(
    `
    INSERT INTO worker_runs (worker_name, run_key, status, meta, started_at)
    VALUES ($1, $2, 'running', $3::jsonb, NOW())
    RETURNING id
    `,
    [workerName, meta.runKey || null, JSON.stringify(meta)]
  );

  incrementCounter("worker_runs_started_total", 1, { worker: workerName });

  return result.rows[0]?.id;
}

export async function finishWorkerRun(runId, workerName, status, meta = {}) {
  const durationMs = Number(meta.durationMs || 0);
  const error = meta.error || null;

  await query(
    `
    UPDATE worker_runs
    SET
      status = $2,
      finished_at = NOW(),
      duration_ms = $3,
      error = $4,
      meta = COALESCE(meta, '{}'::jsonb) || $5::jsonb
    WHERE id = $1
    `,
    [runId, status, durationMs, error, JSON.stringify(meta)]
  );

  incrementCounter("worker_runs_finished_total", 1, {
    worker: workerName,
    status,
  });

  if (durationMs > 0) {
    observeHistogram("worker_run_duration_ms", durationMs, {
      worker: workerName,
      status,
    });
  }

  setGauge("worker_last_status", status === "success" ? 1 : 0, {
    worker: workerName,
  });
}
