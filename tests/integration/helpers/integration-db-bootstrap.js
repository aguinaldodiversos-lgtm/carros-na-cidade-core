import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./integration-test-constants.js";
import { resetBrainAiStackForTests } from "../../../src/brain/orchestrator/brain-stack.js";

/**
 * Executado no carregamento do `vitest.config.js` (antes dos testes).
 *
 * - `TEST_DATABASE_URL` tem prioridade sobre `DATABASE_URL` (banco dedicado a testes).
 * - Se nenhum estiver definido, usa Postgres local padrão (alinhado a `docker-compose.test.yml`, porta **5433**).
 * - `JWT_SECRET` / `JWT_REFRESH_SECRET`: valores seguros só para Vitest se ausentes (login/refresh nos testes).
 *
 * A suíte `tests/integration/ads-pipeline.integration.test.js` **não** entra no `npm test` padrão;
 * use `npm run test:integration:ads` (ver `docs/testing/integration-ads.md`).
 *
 * Para desligar integração com DB real ao rodar Vitest manualmente: `SKIP_INTEGRATION_ADS=1`.
 * CHECK em `public.ads` (`tests/ads/fuel-transmission-contract.test.js`): só roda com
 * `RUN_PG_ADS_CHECK_TESTS=1` (ex.: `npm run test:pg-contract`); `SKIP_PG_INTEGRATION_TESTS=1` desliga.
 */
export function applyVitestIntegrationEnv() {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = "test";
  }

  const testUrl = String(process.env.TEST_DATABASE_URL || "").trim();
  if (testUrl) {
    process.env.DATABASE_URL = testUrl;
  } else if (!String(process.env.DATABASE_URL || "").trim()) {
    process.env.DATABASE_URL = INTEGRATION_TEST_DATABASE_URL_DEFAULT;
  }

  if (!String(process.env.JWT_SECRET || "").trim()) {
    process.env.JWT_SECRET = "vitest-integration-jwt-secret-minimum-32-characters-long";
  }
  if (!String(process.env.JWT_REFRESH_SECRET || "").trim()) {
    process.env.JWT_REFRESH_SECRET = "vitest-integration-refresh-secret-minimum-32-chars-long";
  }

  // Suíte ads (runner define RUN_INTEGRATION_ADS_TESTS=1): IA só no gateway local, sem custo OpenAI.
  if (process.env.RUN_INTEGRATION_ADS_TESTS === "1") {
    if (!String(process.env.AI_MODE || "").trim()) {
      process.env.AI_MODE = "local";
    }
    resetBrainAiStackForTests();
  }
}
