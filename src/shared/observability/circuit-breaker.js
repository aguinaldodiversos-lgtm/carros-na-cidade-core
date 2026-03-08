export class CircuitBreaker {
  constructor({
    failureThreshold = 5,
    recoveryTimeMs = 30000,
  } = {}) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeMs = recoveryTimeMs;
    this.failures = 0;
    this.state = "closed";
    this.nextTryAt = 0;
  }

  canExecute() {
    if (this.state === "open" && Date.now() < this.nextTryAt) {
      return false;
    }

    if (this.state === "open" && Date.now() >= this.nextTryAt) {
      this.state = "half-open";
      return true;
    }

    return true;
  }

  success() {
    this.failures = 0;
    this.state = "closed";
    this.nextTryAt = 0;
  }

  failure() {
    this.failures += 1;

    if (this.failures >= this.failureThreshold) {
      this.state = "open";
      this.nextTryAt = Date.now() + this.recoveryTimeMs;
    }
  }
}
