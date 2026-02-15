const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function getAdMetrics(req, res) {
  try {
    const { adId } = req.params;

    // visitas
    const visitsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS visits
      FROM analytics
      WHERE ad_id = $1
      `,
      [adId]
    );

    // interessados (alertas que combinaram)
    const leadsResult = await pool.query(
      `
      SELECT COUNT(*)::int AS leads
      FROM dealer_leads
      WHERE ad_id = $1
      `,
      [adId]
    );

    const visits = visitsResult.rows[0].visits || 0;
    const leads = leadsResult.rows[0].leads || 0;

    let demandText = "Procura moderada";

    if (leads >= 5) demandText = "Alta procura por esse veículo";
    else if (leads >= 2) demandText = "Boa procura por esse veículo";

    return res.json({
      visits,
      leads,
      demandText,
    });
  } catch (err) {
    console.error("Erro ao buscar métricas do anúncio:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

module.exports = { getAdMetrics };
