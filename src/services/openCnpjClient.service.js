const axios = require("axios");

const BASE_URL = "https://api.opencnpj.org";

async function getCompanyByCnpj(cnpj) {
  try {
    const cleanCnpj = cnpj.replace(/\D/g, "");

    const response = await axios.get(`${BASE_URL}/${cleanCnpj}`, {
      timeout: 10000,
    });

    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null;
    }

    console.error("Erro ao consultar OpenCNPJ:", err.message);
    return null;
  }
}

module.exports = { getCompanyByCnpj };
