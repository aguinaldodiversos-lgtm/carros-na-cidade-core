router.get("/opportunities", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        co.*,
        c.name AS city_name,
        c.state
      FROM city_opportunities co
      JOIN cities c ON c.id = co.city_id
      ORDER BY co.opportunity_score DESC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar oportunidades" });
  }
});
