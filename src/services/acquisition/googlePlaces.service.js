const axios = require("axios");

const GOOGLE_PLACES_URL =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";

/* =====================================================
   BUSCAR LOJAS DE CARROS NA CIDADE
===================================================== */
async function buscarLojasGoogle(cidade) {
  try {
    const query = `revenda de carros em ${cidade.name}`;

    const response = await axios.get(GOOGLE_PLACES_URL, {
      params: {
        query,
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });

    const results = response.data.results || [];

    const lojas = results.map((place) => ({
      name: place.name,
      address: place.formatted_address,
      place_id: place.place_id,
    }));

    return lojas;
  } catch (err) {
    console.error("Erro ao buscar lojas no Google:", err.message);
    return [];
  }
}

module.exports = {
  buscarLojasGoogle,
};
