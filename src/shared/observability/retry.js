import { logger } from "../logger.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt, baseDelayMs, maxDelayMs) {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.25));
  return exp + jitter;
}

export async function withRetry(
  fn,
  {
    name = "anonymous",
    retries = 3,
    baseDelayMs = 400,
    maxDelayMs = 5000,
    shouldRetry = () => true,
  } = {}
) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn({ attempt });
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error)) {
        break;
      }

      const delay = computeDelay(attempt, baseDelayMs, maxDelayMs);

      logger.warn(
        {
          name,
          attempt,
          delay,
          error: error?.message || String(error),
        },
        "[retry] tentativa falhou, reprocessando"
      );

      await sleep(delay);
    }
  }

  throw lastError;
}
