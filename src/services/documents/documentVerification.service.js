const axios = require("axios");

/* =====================================================
   VALIDAR CPF (regra matemática local)
===================================================== */
function validateCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");

  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  let remainder;

  for (let i = 1; i <= 9; i++)
    sum += parseInt(cpf.substring(i - 1, i)) * (11 - i);

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.substring(9, 10))) return false;

  sum = 0;
  for (let i = 1; i <= 10; i++)
    sum += parseInt(cpf.substring(i - 1, i)) * (12 - i);

  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;

  return remainder === parseInt(cpf.substring(10, 11));
}

/* =====================================================
   VALIDAR CNPJ (API externa)
===================================================== */
async function validateCNPJ(cnpj) {
  try {
    const clean = cnpj.replace(/\D/g, "");

    if (clean.length !== 14) {
      return { valid: false };
    }

    // API pública de CNPJ
    const response = await axios.get(
      `https://receitaws.com.br/v1/cnpj/${clean}`,
      { timeout: 8000 }
    );

    if (response.data.status === "ERROR") {
      return { valid: false };
    }

    return {
      valid: true,
      company_name: response.data.nome,
      city: response.data.municipio,
    };
  } catch (err) {
    console.error("Erro ao validar CNPJ:", err.message);
    return { valid: false };
  }
}

/* =====================================================
   FUNÇÃO PRINCIPAL
===================================================== */
async function verifyDocument({ type, number }) {
  const clean = number.replace(/\D/g, "");

  if (type === "cpf") {
    const valid = validateCPF(clean);
    return { valid };
  }

  if (type === "cnpj") {
    return await validateCNPJ(clean);
  }

  return { valid: false };
}

module.exports = {
  verifyDocument,
};
