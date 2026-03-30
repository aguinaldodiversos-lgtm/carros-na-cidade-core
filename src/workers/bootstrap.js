import { logger } from "../shared/logger.js";
import { startWorkersBootstrap, stopWorkersBootstrap } from "./bootstrap/bootstrap.service.js";

export { startWorkersBootstrap, stopWorkersBootstrap };

if (import.meta.url === `file://${process.argv[1]}`) {
  startWorkersBootstrap().catch((error) => {
    logger.error({ error }, "❌ Falha fatal ao iniciar bootstrap diretamente");
    process.exit(1);
  });
}
