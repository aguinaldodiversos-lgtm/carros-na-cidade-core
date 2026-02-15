const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function getAdMetrics(req, res) {
  try {
    const { adId } = req.params;

    // validação básica
    if (!adId || isNaN(adId)) {
      return res.status(400).json({
        error: "ID do anúncio inválido",
      });
    }

    // verificar se anúncio existe
    const adResult = await pool.query(
      `
      SELECT id, user_id
      FROM ads
      WHERE id = $1
      LIMIT 1
      `,
      [adId]
    );

    if (adResult.rows.length === 0) {
      return res.status(404).json({
        error: "Anúncio não encontrado",
      });
    }

    // (opcional) proteger acesso ao dono do anúncio
    // se existir req.user
    if (req.user && adResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({
        error: "Acesso não autorizado",
      });
    }

    // buscar métricas em paralelo
    const [visitsResult, leadsResult] = await Promise.all([
      pool.query(
        `
        SELECT COUNT(*)::int AS visits
        FROM analytics
        WHERE ad_id = $1
        `,
        [adId]
      ),
      pool.query(
        `
        SELECT COUNT(*)::int AS leads
        FROM dealer_leads
        WHERE ad_id = $1
        `,
        [adId]
      ),
    ]);

    const visits = visitsResult.rows[0].visits || 0;
    const leads = leadsResult.rows[0].leads || 0;

    let demandText = "Procura moderada";

    if (leads >= 5) demandText = "Alta procura por esse veículo";
    else if (leads >= 2) demandText = "Boa procura por esse veículo";
    else if (leads === 0 && visits >= 20)
      demandText = "Muitas visualizações, mas poucos contatos";

    return res.json({
      visits,
      leads,
      demandText,
    });
  } catch (err) {
    console.error("Erro ao buscar métricas do anúncio:", err);
    res.status(500).json({
      error: "Erro interno ao buscar métricas",
    });
  }
}

module.exports = { getAdMetrics };
