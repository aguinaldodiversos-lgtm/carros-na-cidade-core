/**
 * Circuit breaker simples por provedor (local | premium).
 * Após N falhas em uma janela, abre o circuito por um período (menos custo e menos tempestade em cascata).
 */

export class ProviderCircuitBreaker {
  /**
   * @param {object} opts
   * @param {string} opts.name
   * @param {{ warn?: Function }} opts.logger
   * @param {number} [opts.failureThreshold]
   * @param {number} [opts.windowMs]
   * @param {number} [opts.openDurationMs]
   */
  constructor({
    name,
    logger,
    failureThreshold = Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD || 5),
    windowMs = Number(process.env.AI_CIRCUIT_WINDOW_MS || 60_000),
    openDurationMs = Number(process.env.AI_CIRCUIT_OPEN_MS || 30_000),
  }) {
    this.name = name;
    this.logger = logger;
    this.failureThreshold = Number.isFinite(failureThreshold) ? failureThreshold : 5;
    this.windowMs = Number.isFinite(windowMs) ? windowMs : 60_000;
    this.openDurationMs = Number.isFinite(openDurationMs) ? openDurationMs : 30_000;
    /** @type {number[]} */
    this.failureTimestamps = [];
    this.openUntil = 0;
  }

  isOpen() {
    return Date.now() < this.openUntil;
  }

  recordSuccess() {
    this.failureTimestamps = [];
    this.openUntil = 0;
  }

  recordFailure() {
    const now = Date.now();
    this.failureTimestamps = this.failureTimestamps.filter((t) => now - t < this.windowMs);
    this.failureTimestamps.push(now);

    if (this.failureTimestamps.length >= this.failureThreshold) {
      this.openUntil = now + this.openDurationMs;
      this.failureTimestamps = [];
      this.logger?.warn?.(
        {
          component: "brain.ai",
          event: "circuit_open",
          provider: this.name,
          openUntil: this.openUntil,
          openDurationMs: this.openDurationMs,
        },
        "[brain.ai] circuit breaker OPEN"
      );
    }
  }
}
