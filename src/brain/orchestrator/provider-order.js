/**
 * Decisão: ordem de execução das IAs (local gateway vs OpenAI premium).
 * Separado da execução para testes e leitura clara.
 */

/**
 * @param {object} opts
 * @param {string} opts.executionMode — resultado de policy.resolveExecutionMode
 * @param {boolean} opts.canPremium
 * @returns {Array<"local"|"premium">}
 */
export function resolveProviderOrder({ executionMode, canPremium }) {
  if (executionMode === "premium") {
    return ["premium", "local"];
  }
  if (executionMode === "local") {
    return canPremium ? ["local", "premium"] : ["local"];
  }
  return canPremium ? ["local", "premium"] : ["local"];
}
