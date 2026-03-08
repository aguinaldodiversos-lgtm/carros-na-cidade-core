import { logger } from "../../shared/logger.js";
import { auditPendingPublications } from "../../modules/seo/publishing/publication-audit.service.js";
import { startWorkerRun, finishWorkerRun } from "../../shared/observability/worker.metrics.js";

let intervalRef = null;
let started = false;
let running = false;

async function runOnce() {
  if (running) return;
  running = true;

  const runId = await startWorkerRun("publication-audit-worker");
  const startedAt = Date.now();

  try {
    const results = await auditPendingPublications(200);

    await finishWorkerRun(runId, "publication-audit-worker", "success", {
      durationMs: Date.now() - startedAt,
      audited: results.length,
    });
  } catch (error) {
    logger.error(
      { error: error?.message || String(error) },
      "[publication-audit.worker] erro"
    );

    await finishWorkerRun(runId, "publication-audit-worker", "failed", {
      durationMs: Date.now() - startedAt,
      error: error?.message || String(error),
    });
  } finally {
    running = false;
  }
}

export async function startPublicationAuditWorker() {
  if (started) return;
  started = true;

  const intervalMs = Number(
    process.env.PUBLICATION_AUDIT_WORKER_INTERVAL_MS || 30 * 60 * 1000
  );

  await runOnce();

  intervalRef = setInterval(() => {
    runOnce().catch((error) => {
      logger.error(
        { error: error?.message || String(error) },
        "[publication-audit.worker] erro agendado"
      );
    });
  }, intervalMs);
}

export async function stopPublicationAuditWorker() {
  if (intervalRef) clearInterval(intervalRef);
  intervalRef = null;
  started = false;
}
