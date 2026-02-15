const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function autoApproveBanners() {
  try {
    console.log("⏳ Verificando banners pendentes...");

    await pool.query(`
      UPDATE events
      SET banner_status = 'auto_approved'
      WHERE banner_status = 'pending'
        AND banner_generated = true
        AND updated_at < NOW() - INTERVAL '48 hours'
    `);

    console.log("✅ Autoaprovação executada");
  } catch (err) {
    console.error("Erro no auto-approve:", err.message);
  }
}

function startBannerAutoApproveWorker() {
  console.log("⏳ Banner Auto Approve Worker iniciado...");

  // roda a cada 1 hora
  setInterval(autoApproveBanners, 60 * 60 * 1000);
}

module.exports = { startBannerAutoApproveWorker };
