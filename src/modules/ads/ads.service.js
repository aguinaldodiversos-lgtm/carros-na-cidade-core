// src/modules/ads/ads.service.js

import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { checkAdLimit } from "./ads.plan-limit.service.js";
import { generateText } from "../ai/ai.service.js";

/* =====================================================
   CONFIGURAÇÕES DE RANKING
===================================================== */

const PLAN_WEIGHT = {
  free: 1,
  start: 2,
  pro: 3,
};

/* =====================================================
   FUNÇÕES AUXILIARES DE RANKING
===================================================== */

function calculatePlanScore(plan, highlighted) {
  let score = PLAN_WEIGHT[plan] || 1;

  if (highlighted) {
    score += 4; // peso fixo para destaque
  }

  return score;
}

async function getCityDemand(cityId) {
  const result = await pool.query(
    `SELECT demand_score FROM city_metrics WHERE city_id = $1`,
    [cityId]
  );

  return Number(result.rows[0]?.demand_score || 1);
}

async function getSellerScore(sellerId) {
  const result = await pool.query(
    `SELECT score FROM seller_scores WHERE seller_id = $1`,
    [sellerId]
  );

  return Number(result.rows[0]?.score || 0);
}

/* =====================================================
   RECALCULAR RANKING COMPLETO
===================================================== */

export async function recalculateRanking(
  ad,
  userPlan,
  highlighted,
  sellerId
) {
  const demand = await getCityDemand(ad.city_id);
  const baseScore = calculatePlanScore(userPlan, highlighted);
  const sellerScore = await getSellerScore(sellerId);

  // vendedor com score alto sobe mais
  const sellerWeight = 1 + sellerScore / 100;

  const finalScore = baseScore * demand * sellerWeight;

  return Number(finalScore.toFixed(4));
}

/* =====================================================
   LISTAR ANÚNCIOS (RANKING OTIMIZADO)
===================================================== */

export async function list(filters = {}) {
  const { city_id, min_price, max_price } = filters;

  let query = `
    SELECT *
    FROM ads
    WHERE status = 'active'
  `;

  const params = [];

  if (city_id) {
    params.push(city_id);
    query += ` AND city_id = $${params.length}`;
  }

  if (min_price) {
    params.push(min_price);
    query += ` AND price >= $${params.length}`;
  }

  if (max_price) {
    params.push(max_price);
    query += ` AND price <= $${params.length}`;
  }

  query += `
    ORDER BY ranking_score DESC, created_at DESC
    LIMIT 100
  `;

  const result = await pool.query(query, params);
  return result.rows;
}

/* =====================================================
   BUSCAR POR ID
===================================================== */

export async function show(id) {
  const result = await pool.query(
    `SELECT * FROM ads WHERE id = $1`,
    [id]
  );

  const ad = result.rows[0];

  if (!ad || ad.status === "deleted") {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return ad;
}

/* =====================================================
   CRIAR ANÚNCIO
===================================================== */

export async function create(data, user) {
  await checkAdLimit(user.id, user.plan);

  const fakeAd = {
    city_id: data.city_id,
  };

  const rankingScore = await recalculateRanking(
    fakeAd,
    user.plan,
    false,
    user.id
  );

  const result = await pool.query(
    `
    INSERT INTO ads (
      user_id,
      title,
      description,
      price,
      city_id,
      status,
      highlighted,
      ranking_score,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,'active',false,$6,NOW(),NOW())
    RETURNING *
    `,
    [
      user.id,
      data.title,
      data.description || "",
      data.price,
      data.city_id,
      rankingScore,
    ]
  );

  return result.rows[0];
}

/* =====================================================
   ATUALIZAR ANÚNCIO
===================================================== */

export async function update(id, data, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  const updatedFields = {
    title: data.title ?? ad.title,
    description: data.description ?? ad.description,
    price: data.price ?? ad.price,
    city_id: data.city_id ?? ad.city_id,
  };

  const rankingScore = await recalculateRanking(
    updatedFields,
    user.plan,
    ad.highlighted,
    user.id
  );

  const result = await pool.query(
    `
    UPDATE ads
    SET title = $1,
        description = $2,
        price = $3,
        city_id = $4,
        ranking_score = $5,
        updated_at = NOW()
    WHERE id = $6
    RETURNING *
    `,
    [
      updatedFields.title,
      updatedFields.description,
      updatedFields.price,
      updatedFields.city_id,
      rankingScore,
      id,
    ]
  );

  return result.rows[0];
}

/* =====================================================
   REMOVER ANÚNCIO (SOFT DELETE)
===================================================== */

export async function remove(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  await pool.query(
    `
    UPDATE ads
    SET status = 'deleted',
        updated_at = NOW()
    WHERE id = $1
    `,
    [id]
  );

  return { message: "Anúncio removido com sucesso" };
}

/* =====================================================
   DESTACAR ANÚNCIO
===================================================== */

export async function highlight(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  const rankingScore = await recalculateRanking(
    ad,
    user.plan,
    true,
    user.id
  );

  const result = await pool.query(
    `
    UPDATE ads
    SET highlighted = true,
        ranking_score = $1,
        updated_at = NOW()
    WHERE id = $2
    RETURNING *
    `,
    [rankingScore, id]
  );

  return result.rows[0];
}

/* =====================================================
   ANÁLISE DE PREÇO (IA futura)
===================================================== */

export async function priceAnalysis(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  return {
    current_price: ad.price,
    suggested_price: ad.price,
    message: "Análise dinâmica futura via IA",
  };
}

/* =====================================================
   MELHORIA DE DESCRIÇÃO COM IA LOCAL
===================================================== */

export async function aiImprove(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  const prompt = `
Melhore a descrição abaixo para venda automotiva,
de forma persuasiva e profissional:

${ad.description}
`;

  const improved = await generateText(prompt);

  return {
    improved_description: improved,
  };
}
