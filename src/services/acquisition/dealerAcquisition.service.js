const axios = require("axios");

const GOOGLE_TEXT_SEARCH =
  "https://maps.googleapis.com/maps/api/place/textsearch/json";

const GOOGLE_PLACE_DETAILS =
  "https://maps.googleapis.com/maps/api/place/details/json";

/* =====================================================
   BUSCAR LOJAS NA CIDADE
===================================================== */
async function buscarLojasGoogle(cidade) {
  try {
    const query = `revenda de carros em ${cidade.name}`;

    const response = await axios.get(GOOGLE_TEXT_SEARCH, {
      params: {
        query,
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });

    const results = response.data.results || [];

    return results.map((place) => ({
      name: place.name,
      address: place.formatted_address,
      place_id: place.place_id,
    }));
  } catch (err) {
    console.error("Erro ao buscar lojas no Google:", err.message);
    return [];
  }
}

/* =====================================================
   BUSCAR DETALHES DA LOJA (TELEFONE)
===================================================== */
async function buscarDetalhesLoja(place_id) {
  try {
    const response = await axios.get(GOOGLE_PLACE_DETAILS, {
      params: {
        place_id,
        fields: "name,formatted_phone_number,international_phone_number",
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });

    const result = response.data.result;

    if (!result) return null;

    return {
      name: result.name,
      phone:
        result.international_phone_number ||
        result.formatted_phone_number ||
        null,
    };
  } catch (err) {
    console.error("Erro ao buscar detalhes da loja:", err.message);
    return null;
  }
}

module.exports = {
  buscarLojasGoogle,
  buscarDetalhesLoja,
};
