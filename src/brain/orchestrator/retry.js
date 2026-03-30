/**
 * Retry leve com limite (erros de rede / timeout intermitentes).
 */

const DEFAULT_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.AI_PROVIDER_ATTEMPTS || 2)));
const DEFAULT_DELAY_MS = Number(process.env.AI_PROVIDER_RETRY_DELAY_MS || 200);

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {object} [opts]
 * @param {{ debug?: Function }} [opts.logger]
 * @param {string} [opts.label]
 * @param {number} [opts.maxAttempts]
 * @param {number} [opts.delayMs]
 */
export async function withRetry(fn, opts = {}) {
  const maxAttempts = opts.maxAttempts != null ? opts.maxAttempts : DEFAULT_ATTEMPTS;
  const delayMs = opts.delayMs != null ? opts.delayMs : DEFAULT_DELAY_MS;
  const logger = opts.logger;
  const label = opts.label || "ai";

  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      // Evita repetir chamadas quando o provedor nem está configurado.
      if (/não configurado|not configured/i.test(msg)) {
        break;
      }
      if (attempt < maxAttempts) {
        logger?.debug?.(
          {
            component: "brain.ai",
            event: "retry",
            label,
            attempt,
            maxAttempts,
            error: err?.message || String(err),
          },
          "[brain.ai] retry"
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}
