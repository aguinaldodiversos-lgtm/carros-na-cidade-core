const axios = require("axios");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   CONFIG
===================================================== */

const TARGET_CITIES = [
  "Campinas",
  "Sorocaba",
  "Jundiaí",
  "São Paulo",
  "Santos",
];

/* =====================================================
   FUNÇÃO SIMPLES DE EXTRAÇÃO DE NÚMEROS
===================================================== */

function extractNumber(text) {
  const match = text.replace(/\./g, "").match(/\d+/);
  return match ? parseInt(match[0]) : 0;
}

/* =====================================================
   WEBMOTORS
===================================================== */

async function fetchWebmotors(city) {
  try {
    const url = `https://www.webmotors.com.br/carros/estoque/${encodeURIComponent(
      city
    )}`;

    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 10000,
    });

    const html = res.data;

    const match = html.match(/(\d+\.?\d*) resultados/i);
    const count = match ? extractNumber(match[1]) : 0;

    return count;
  } catch (err) {
    console.error(`Erro Webmotors (${city}):`, err.message);
    return 0;
  }
}

/* =====================================================
   OLX
===================================================== */

async function fetchOlx(city) {
  try {
    const url = `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios?o=1&q=${encodeURIComponent(
      city
    )}`;

    const res = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 10000,
    });

    const html = res.data;

    const match = html.match(/(\d+\.?\d*) anúncios/i);
    const count = match ? extractNumber(match[1]) : 0;

    return count;
  } catch (err) {
    console.error(`Erro OLX (${city}):`, err.message);
    return 0;
  }
}

/* =====================================================
   SALVAR NO BANCO
===================================================== */

async function saveStat(city, competitor, adsCount) {
  await pool.query(
    `
    INSERT INTO competitor_stats (city, competitor, ads_count)
    VALUES ($1, $2, $3)
  `,
    [city, competitor, adsCount]
  );
}

/* =====================================================
   COLETA GERAL
===================================================== */

async function runCompetitorScan() {
  console.log("📡 Iniciando scan de concorrentes...");

  for (const city of TARGET_CITIES) {
    try {
      const webmotors = await fetchWebmotors(city);
      const olx = await fetchOlx(city);

      await saveStat(city, "webmotors", webmotors);
      await saveStat(city, "olx", olx);

      console.log(
        `📊 ${city}: Webmotors=${webmotors} | OLX=${olx}`
      );
    } catch (err) {
      console.error(`Erro ao processar cidade ${city}:`, err.message);
    }
  }
}

module.exports = { runCompetitorScan };
