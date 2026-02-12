require("dotenv").config();
const { Pool } = require("pg");
const { scoreLead } = require("../services/leadScoring.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function runLeadScoring() {
  try {
    console.log("🎯 Rodando Lead Scoring...");

    const leads = await pool.query(`
      SELECT dl.*
      FROM dealer_leads dl
      LEFT JOIN dealer_lead_scores ls
        ON ls.dealer_lead_id = dl.id
      WHERE ls.id IS NULL
      LIMIT 50
    `);

    for (const lead of leads.rows) {
      const result = await scoreLead(lead);
      console.log(
        `Lead ${lead.id} score: ${result.score} (${result.priority})`
      );
    }

    console.log("✅ Lead Scoring finalizado");
  } catch (err) {
    console.error("❌ Erro no Lead Scoring:", err);
  }
}

function startLeadScoringWorker() {
  setInterval(runLeadScoring, 15 * 60 * 1000); // a cada 15 min
  runLeadScoring();
}

module.exports = { startLeadScoringWorker };
