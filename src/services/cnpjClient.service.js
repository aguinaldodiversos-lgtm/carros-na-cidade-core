const axios = require("axios");

const CNPJ_API_BASE = process.env.CNPJ_API_BASE;

async function searchCompaniesByCity(cityName) {
  try {
    const response = await axios.get(
      `${CNPJ_API_BASE}/search`,
      {
        params: {
          city: cityName,
          cnae: "4511101",
        },
        timeout: 10000,
      }
    );

    return response.data || [];
  } catch (err) {
    console.error("Erro na API de CNPJ:", err.message);
    return [];
  }
}

module.exports = { searchCompaniesByCity };
