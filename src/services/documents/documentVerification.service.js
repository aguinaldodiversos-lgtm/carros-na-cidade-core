/**
 * Validação local de CPF/CNPJ (dígitos verificadores), sem HTTP nem `require`.
 * Alinhado à lógica do frontend (`frontend/lib/validation/document.ts`).
 */

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function validateCPF(cpf) {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  let firstVerifier = (sum * 10) % 11;
  if (firstVerifier === 10) firstVerifier = 0;
  if (firstVerifier !== Number(digits[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(digits[i]) * (11 - i);
  }
  let secondVerifier = (sum * 10) % 11;
  if (secondVerifier === 10) secondVerifier = 0;
  return secondVerifier === Number(digits[10]);
}

export function validateCNPJ(cnpj) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calc = (base, weights) => {
    const sum = weights.reduce((acc, weight, index) => acc + Number(base[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const firstDigit = calc(digits.slice(0, 12), firstWeights);
  if (firstDigit !== Number(digits[12])) return false;

  const secondDigit = calc(digits.slice(0, 13), secondWeights);
  return secondDigit === Number(digits[13]);
}

/**
 * @param {{ type: "cpf" | "cnpj", number: string }} param0
 * @returns {Promise<{ valid: boolean, company_name?: string | null }>}
 */
export async function verifyDocument({ type, number }) {
  const clean = onlyDigits(number);

  if (type === "cpf") {
    return { valid: validateCPF(clean) };
  }

  if (type === "cnpj") {
    const valid = validateCNPJ(clean);
    return { valid, company_name: null };
  }

  return { valid: false };
}
