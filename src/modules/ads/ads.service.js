// src/modules/ads/ads.service.js

import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { checkAdLimit } from "./ads.plan-limit.service.js";

/* =====================================================
   PESO DE RANKING POR PLANO
===================================================== */

const PLAN_WEIGHT = {
  free: 1,
  start: 2,
  pro: 3,
};

function calculateRankingScore(plan, isHighlighted) {
  let score = PLAN_WEIGHT[plan] || 1;

  if (isHighlighted) {
    score += 4; // destaque paga mais peso
  }

  return score;
}

/* =====================================================
   LISTAR ANÚNCIOS (COM RANKING)
===================================================== */

export async function list(filters = {}) {
  const { city_id } = filters;

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

  query += `
    ORDER BY ranking_score DESC, created_at DESC
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

  if (!ad) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  return ad;
}

/* =====================================================
   CRIAR ANÚNCIO
===================================================== */

export async function create(data, user) {
  await checkAdLimit(user.id, user.plan);

  const rankingScore = calculateRankingScore(
    user.plan,
    false
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
      created_at
    )
    VALUES ($1,$2,$3,$4,$5,'active',false,$6,NOW())
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

  const result = await pool.query(
    `
    UPDATE ads
    SET title = $1,
        description = $2,
        price = $3,
        city_id = $4,
        updated_at = NOW()
    WHERE id = $5
    RETURNING *
    `,
    [
      data.title,
      data.description,
      data.price,
      data.city_id,
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
    SET status = 'deleted'
    WHERE id = $1
    `,
    [id]
  );

  return { message: "Anúncio removido" };
}

/* =====================================================
   DESTACAR ANÚNCIO (PLANO PRO)
===================================================== */

export async function highlight(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  const newScore = calculateRankingScore(
    user.plan,
    true
  );

  const result = await pool.query(
    `
    UPDATE ads
    SET highlighted = true,
        ranking_score = $1
    WHERE id = $2
    RETURNING *
    `,
    [newScore, id]
  );

  return result.rows[0];
}

/* =====================================================
   ANÁLISE DE PREÇO (placeholder futuro IA)
===================================================== */

export async function priceAnalysis(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  return {
    suggested_price: ad.price,
    message: "Análise futura com IA",
  };
}

/* =====================================================
   MELHORIA DE DESCRIÇÃO IA (placeholder)
===================================================== */

export async function aiImprove(id, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  return {
    improved_description: ad.description,
    message: "Integração futura com IA local",
  };
}
