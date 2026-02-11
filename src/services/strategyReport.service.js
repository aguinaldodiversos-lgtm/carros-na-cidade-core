const { Pool } = require("pg");
const { Resend } = require("resend");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const resend = new Resend(process.env.RESEND_API_KEY);

async function generateStrategyReport() {
  // 1. Oportunidades por cidade
  const opportunities = await pool.query(`
    SELECT
      al.city,
      COUNT(DISTINCT al.id) AS total_alerts,
      COUNT(DISTINCT ad.id) AS total_ads,
      CASE
        WHEN COUNT(DISTINCT ad.id) = 0
          THEN COUNT(DISTINCT al.id)
        ELSE
          COUNT(DISTINCT al.id)::float / COUNT(DISTINCT ad.id)
      END AS opportunity_score
    FROM alerts al
    LEFT JOIN ads ad
      ON LOWER(ad.city) = LOWER(al.city)
      AND ad.status = 'active'
    GROUP BY al.city
    HAVING COUNT(DISTINCT al.id) > 0
    ORDER BY opportunity_score DESC
    LIMIT 5
  `);

  // 2. Marcas mais procuradas
  const brands = await pool.query(`
    SELECT
      brand,
      COUNT(*) AS total
    FROM alerts
    WHERE brand IS NOT NULL
    GROUP BY brand
    ORDER BY total DESC
    LIMIT 5
  `);

  return {
    opportunities: opportunities.rows,
    brands: brands.rows,
  };
}

async function sendStrategyReport() {
  try {
    const data = await generateStrategyReport();

    let html = `<h2>Relatório estratégico – Carros na Cidade</h2>`;

    html += `<h3>Cidades com maior potencial</h3><ul>`;
    data.opportunities.forEach((c) => {
      html += `<li>
        <strong>${c.city}</strong><br/>
        ${c.total_alerts} alertas / ${c.total_ads} anúncios<br/>
        Score: ${Number(c.opportunity_score).toFixed(1)}
      </li>`;
    });
    html += `</ul>`;

    html += `<h3>Marcas mais procuradas</h3><ul>`;
    data.brands.forEach((b) => {
      html += `<li>${b.brand} – ${b.total} alertas</li>`;
    });
    html += `</ul>`;

    await resend.emails.send({
      from: "Carros na Cidade <no-reply@carrosnacidade.com>",
      to: process.env.STRATEGY_EMAIL,
      subject: "Relatório estratégico semanal",
      html,
    });

    console.log("📊 Relatório estratégico enviado");
  } catch (err) {
    console.error("Erro ao enviar relatório estratégico:", err);
  }
}

module.exports = { sendStrategyReport };
