/**
 * LEGADO — carregado apenas por `src/routes/integrations/index.js`, **não montado** em `app.js`.
 * Já delega criação a `createAdNormalized` (pipeline oficial). Não duplicar regra de INSERT aqui.
 */
async function createAdFromApi(req, res) {
  try {
    const advertiserId = req.advertiserId;

    const {
      brand,
      model,
      year,
      price,
      mileage,
      city_id,
      description,
    } = req.body;

    if (!brand || !model || !year || !price) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes",
      });
    }

    if (!city_id) {
      return res.status(400).json({
        error: "city_id é obrigatório",
      });
    }

    const { createAdNormalized } = await import(
      "../../modules/ads/ads.create.pipeline.service.js"
    );
    const { default: db } = await import(
      "../../infrastructure/database/db.js"
    );

    const { rows: advRows } = await db.query(
      `SELECT user_id FROM advertisers WHERE id = $1 LIMIT 1`,
      [advertiserId]
    );
    const userId = advRows[0]?.user_id;
    if (!userId) {
      return res.status(400).json({ error: "Anunciante inválido" });
    }

    const { rows: cityRows } = await db.query(
      `SELECT name, state FROM cities WHERE id = $1 LIMIT 1`,
      [city_id]
    );

    const titleRaw = `${brand} ${model} ${year}`.trim();
    const title = titleRaw.length >= 3 ? titleRaw : `${String(brand)} ${String(model)}`.trim();
    const payload = {
      title: title.length >= 3 ? title : "Anúncio",
      description: description ?? "",
      price: Number(price),
      city_id: Number(city_id),
      city: cityRows[0]?.name || "Cidade",
      state: String(cityRows[0]?.state || "SP").slice(0, 2).toUpperCase(),
      brand: String(brand).trim(),
      model: String(model).trim(),
      year: Number(year),
      mileage: mileage != null ? Number(mileage) : 0,
      below_fipe: false,
    };

    const ad = await createAdNormalized(payload, { id: String(userId) }, {});

    return res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    const code = err && typeof err.statusCode === "number" ? err.statusCode : null;
    if (code != null && code >= 400 && code < 500) {
      return res.status(code).json({
        error: err.message || "Requisição inválida",
      });
    }
    console.error("Erro ao criar anúncio via API:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

module.exports = createAdFromApi;
