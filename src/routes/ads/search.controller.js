const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = async (req, res) => {
  try {
    const {
      cidade,
      marca,
      modelo,
      preco_min,
      preco_max,
      limit = 20,
      offset = 0,
    } = req.query;

    let conditions = ["status = 'active'"];
    let values = [];
    let index = 1;

    if (cidade) {
      conditions.push(`LOWER(city) = LOWER($${index++})`);
      values.push(cidade);
    }

    if (marca) {
      conditions.push(`LOWER(brand) = LOWER($${index++})`);
      values.push(marca);
    }

    if (modelo) {
      conditions.push(`LOWER(model) = LOWER($${index++})`);
      values.push(modelo);
    }

    if (preco_min) {
      conditions.push(`price >= $${index++}`);
      values.push(preco_min);
    }

    if (preco_max) {
      conditions.push(`price <= $${index++}`);
      values.push(preco_max);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const query = `
      SELECT
        id,
        title,
        price,
        city,
        state,
        brand,
        model,
        latitude,
        longitude,
        plan,
        highlight_until,
        slug,
        created_at
      FROM ads
      ${whereClause}
      ORDER BY
        highlight_until DESC NULLS LAST,
        plan DESC,
        created_at DESC
      LIMIT $${index++}
      OFFSET $${index++}
    `;

    values.push(limit);
    values.push(offset);

    const result = await pool.query(query, values);

    res.json({
      total: result.rowCount,
      ads: result.rows,
    });
  } catch (err) {
    console.error("Erro na busca de anúncios:", err);
    res.status(500).json({ error: "Erro ao buscar anúncios" });
  }
};
