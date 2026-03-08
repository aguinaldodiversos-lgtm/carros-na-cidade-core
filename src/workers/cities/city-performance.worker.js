import { logger } from "../../shared/logger.js";
import { refreshCityPerformanceDaily } from "../../brain/metrics/city-performance.service.js";
import { startWorkerRun, finishWorkerRun } from "../../shared/observability/worker.metrics.js";

let started = false;
let running = false;
let intervalRef = null;

async function runOnce() {
  if (running) return;
  running = true;

  const runId = await startWorkerRun("city-performance-worker");
  const startedAt = Date.now();

  try {
    const result = await refreshCityPerformanceDaily();

    await finishWorkerRun(runId, "city-performance-worker", "success", {
      durationMs: Date.now() - startedAt,
      total: result.total,
    });
  } catch (error) {
    logger.error(
      { error: error?.message || String(error) },
      "[city-performance.worker] erro"
    );

    await finishWorkerRun(runId, "city-performance-worker", "failed", {
      durationMs: Date.now() - startedAt,
      error: error?.message || String(error),
    });
  } finally {
    running = false;
  }
}

export async function startCityPerformanceWorker() {
  if (started) return;
  started = true;

  const intervalMs = Number(
    process.env.CITY_PERFORMANCE_WORKER_INTERVAL_MS || 6 * 60 * 60 * 1000
  );

  await runOnce();

  intervalRef = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error: error?.message || String(error) },
        "[city-performance.worker] erro agendado"
      );
    });
  }, intervalMs);
}

export async function stopCityPerformanceWorker() {
  if (intervalRef) clearInterval(intervalRef);
  intervalRef = null;
  started = false;
}
