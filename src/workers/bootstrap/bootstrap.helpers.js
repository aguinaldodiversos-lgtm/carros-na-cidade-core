import { logger } from "../../shared/logger.js";

export function isEnabled(envName, defaultValue = "false") {
  return String(process.env[envName] ?? defaultValue).toLowerCase() === "true";
}

export async function resolveWorkerModule(loader) {
  return loader();
}

export async function startWorkerSafe(workerConfig) {
  const { name, env, defaultValue = "false", load, startExport } = workerConfig;

  const enabled = isEnabled(env, defaultValue);

  if (!enabled) {
    logger.info({ worker: name, env }, "⏸️ Worker desativado");
    return {
      name,
      env,
      enabled: false,
      started: false,
      success: true,
      stopAvailable: false,
      error: null,
      load,
      startExport,
      stopExport: workerConfig.stopExport,
    };
  }

  try {
    const mod = await resolveWorkerModule(load);
    const start = mod?.[startExport];
    const stop = mod?.[workerConfig.stopExport];

    if (typeof start !== "function") {
      logger.warn(
        { worker: name, exportName: startExport },
        "⚠️ Worker não iniciado: export de start inválido"
      );

      return {
        name,
        env,
        enabled: true,
        started: false,
        success: false,
        stopAvailable: false,
        error: `Export inválido: ${startExport}`,
        load,
        startExport,
        stopExport: workerConfig.stopExport,
      };
    }

    await start();

    logger.info({ worker: name }, "✅ Worker iniciado com sucesso");

    return {
      name,
      env,
      enabled: true,
      started: true,
      success: true,
      stopAvailable: typeof stop === "function",
      error: null,
      load,
      startExport,
      stopExport: workerConfig.stopExport,
    };
  } catch (error) {
    logger.error(
      {
        worker: name,
        error,
      },
      "❌ Falha ao iniciar worker"
    );

    return {
      name,
      env,
      enabled: true,
      started: false,
      success: false,
      stopAvailable: false,
      error: error?.message || String(error),
      load,
      startExport,
      stopExport: workerConfig.stopExport,
    };
  }
}

export async function stopWorkerSafe(workerConfig) {
  const { name, load, stopExport } = workerConfig;

  try {
    const mod = await resolveWorkerModule(load);
    const stop = mod?.[stopExport];

    if (typeof stop !== "function") {
      logger.warn(
        { worker: name, exportName: stopExport },
        "⚠️ Worker sem rotina de shutdown"
      );

      return {
        name,
        stopped: false,
        success: false,
        error: `Export inválido: ${stopExport}`,
      };
    }

    await stop();

    logger.info({ worker: name }, "🛑 Worker encerrado com sucesso");

    return {
      name,
      stopped: true,
      success: true,
      error: null,
    };
  } catch (error) {
    logger.error(
      {
        worker: name,
        error,
      },
      "❌ Falha ao encerrar worker"
    );

    return {
      name,
      stopped: false,
      success: false,
      error: error?.message || String(error),
    };
  }
}
