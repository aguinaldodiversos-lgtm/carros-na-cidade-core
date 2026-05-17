/**
 * Worker diário: desativa âncoras sem anúncios ativos.
 *
 * Executar manualmente:
 *   node src/modules/cities/cities.anchor.worker.js
 *
 * Em produção, agendar via cron (ex: às 03:00 UTC):
 *   0 3 * * * node src/modules/cities/cities.anchor.worker.js
 */
import "dotenv/config";
import { deactivateStaleAncoras } from "./cities.anchor.service.js";
import { logger } from "../../shared/logger.js";

async function main() {
  logger.info("[ancora.worker] iniciando job de desativação de âncoras inativas");

  try {
    const { deactivated } = await deactivateStaleAncoras();
    logger.info({ deactivated }, "[ancora.worker] job concluído");
    process.exitCode = 0;
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, "[ancora.worker] falha no job");
    process.exitCode = 1;
  }
}

main();
