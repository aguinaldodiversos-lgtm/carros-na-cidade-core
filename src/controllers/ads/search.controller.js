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
      ano_min,
      ano_max,
      body_type,
      fuel_type,
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

    if (ano_min) {
      conditions.push(`year >= $${index++}`);
      values.push(ano_min);
    }

    if (ano_max) {
      conditions.push(`year <= $${index++}`);
      values.push(ano_max);
    }

    if (body_type) {
      conditions.push(`body_type = $${index++}`);
      values.push(body_type);
    }

    if (fuel_type) {
      conditions.push(`fuel_type = $${index++}`);
      values.push(fuel_type);
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
        year,
        body_type,
        fuel_type,
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
        year DESC NULLS LAST,
        price ASC,
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
