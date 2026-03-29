/**
 * Coalesce chamadas idênticas concorrentes (mesma chave) numa única execução — evita rajadas duplicadas à API.
 */

const inFlight = new Map();

/**
 * @template T
 * @param {string} key
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function getOrDedupeInFlight(key, fn) {
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
