/**
 * Normaliza telefone brasileiro para apenas dígitos com prefixo 55 quando possível.
 * @param {string|undefined|null} input
 * @returns {string|null}
 */
export function normalizeBrazilPhoneDigits(input) {
  if (input === undefined || input === null) return null;

  const d = String(input).replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) {
    return d;
  }

  if (d.length === 10 || d.length === 11) {
    return `55${d}`;
  }

  if (d.length >= 8 && d.length <= 13) {
    return d.startsWith("55") ? d : `55${d}`;
  }

  return null;
}
