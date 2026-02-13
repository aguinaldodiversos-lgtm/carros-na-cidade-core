const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function metricsMiddleware(req, res, next) {
  req.trackMetric = async (table, idField, idValue, metricType) => {
    try {
      if (!idValue) return;

      const tableName =
        table === "advertiser" ? "advertiser_metrics" : "event_metrics";

      const field =
        table === "advertiser" ? "advertiser_id" : "event_id";

      await pool.query(
        `
        INSERT INTO ${tableName} (${field}, metric_type)
        VALUES ($1, $2)
        `,
        [idValue, metricType]
      );
    } catch (err) {
      console.error("Erro ao registrar métrica:", err);
    }
  };

  next();
}

module.exports = metricsMiddleware;
