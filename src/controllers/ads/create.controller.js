const { Pool } = require("pg");
const slugify = require("../../utils/slugify");
const { improveAdText } = require("../../services/ads/adAI.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   VALIDAÇÕES
===================================================== */
function isValidYear(year) {
  const currentYear = new Date().getFullYear();
  return year >= 1980 && year <= currentYear + 1;
}

function isValidPrice(price) {
  return price > 0;
}

function isValidKm(km) {
  if (km === undefined || km === null) return true;
  return km >= 0;
}

/* =====================================================
   CONTROLLER
===================================================== */
async function createAd(req, res) {
  try {
    const userId = req.user.id;

    const {
      brand,
      model,
      year,
      price,
      km,
      city_id,
      description,
      highlighted,
    } = req.body;

    /* =====================================================
       VALIDAÇÕES BÁSICAS
    ===================================================== */
    if (!brand || !model || !year || !price || !city_id) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes",
      });
    }

    if (!isValidPrice(price)) {
      return res.status(400).json({
        error: "Preço inválido",
      });
    }

    if (!isValidYear(year)) {
      return res.status(400).json({
        error: "Ano inválido",
      });
    }

    if (!isValidKm(km)) {
      return res.status(400).json({
        error: "Quilometragem inválida",
      });
    }

    /* =====================================================
       BUSCAR PLANO DO USUÁRIO
    ===================================================== */
    const userResult = await pool.query(
      `
      SELECT id, plan, document_type
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    /* =====================================================
       LIMITES DO PLANO GRÁTIS
    ===================================================== */
    if (!user.plan || user.plan === "free") {
      const limit = user.document_type === "cnpj" ? 20 : 3;

      const countResult = await pool.query(
        `
        SELECT COUNT(*)::int AS total
        FROM ads
        WHERE user_id = $1
          AND status = 'active'
        `,
        [userId]
      );

      const totalAds = countResult.rows[0].total;

      if (totalAds >= limit) {
        return res.status(400).json({
          error: "Limite do plano grátis atingido",
          message:
            user.document_type === "cnpj"
              ? "Plano grátis permite até 20 anúncios para CNPJ."
              : "Plano grátis permite até 3 anúncios para CPF.",
        });
      }
    }

    /* =====================================================
       DEFINIR PESO DO ANÚNCIO
    ===================================================== */
    let weight = 1;

    if (user.plan === "start") weight = 2;
    if (user.plan === "pro") weight = 3;
    if (highlighted) weight = 4;

    /* =====================================================
       MELHORAR DESCRIÇÃO COM IA
    ===================================================== */
    let improvedDescription = description;

    try {
      improvedDescription = await improveAdText({
        brand,
        model,
        year,
        price,
        description,
        weight,
      });
    } catch (err) {
      console.warn("IA não respondeu, usando texto original");
    }

    /* =====================================================
       GERAR SLUG
    ===================================================== */
    const slugBase = `${brand}-${model}-${year}`;
    const slug = slugify(slugBase + "-" + Date.now());

    /* =====================================================
       INSERIR ANÚNCIO
    ===================================================== */
    const insertResult = await pool.query(
      `
      INSERT INTO ads (
        user_id,
        brand,
        model,
        year,
        price,
        km,
        city_id,
        description,
        slug,
        weight,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',NOW())
      RETURNING *
      `,
      [
        userId,
        brand,
        model,
        year,
        price,
        km || null,
        city_id,
        improvedDescription,
        slug,
        weight,
      ]
    );

    const ad = insertResult.rows[0];

    console.log(`🚗 Anúncio criado: ${ad.id} | peso: ${weight}`);

    return res.json({
      success: true,
      ad,
    });
  } catch (err) {
    console.error("Erro ao criar anúncio:", err);
    return res.status(500).json({
      error: "Erro interno no servidor",
    });
  }
}

module.exports = createAd;
