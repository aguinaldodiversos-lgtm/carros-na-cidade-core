/**
 * Valida o DV do CNPJ tradicional e alfanumérico (RFB, julho/2026).
 * O código com DV correto NÃO comprova inscrição ativa nem estabelecimento físico.
 * Os primeiros 12 caracteres aceitam A-Z/0-9; os dois últimos são numéricos.
 */
export function normalizeCnpj(input) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[.\-/\s]/g, "");
}

export function isValidCnpj(input) {
  const cnpj = normalizeCnpj(input);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;

  const digit = (base, weights) => {
    const total = weights.reduce(
      (sum, weight, index) => sum + (base.charCodeAt(index) - 48) * weight,
      0
    );
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (first !== Number(cnpj[12])) return false;
  const second = digit(cnpj.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return second === Number(cnpj[13]);
}
