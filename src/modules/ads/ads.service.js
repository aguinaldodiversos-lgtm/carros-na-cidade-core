// src/modules/ads/ads.service.js

import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { checkAdLimit } from "./ads.plan-limit.service.js";
import { generateText } from "../ai/ai.service.js";

/* =====================================================
   UTIL — NORMALIZAÇÃO SEGURA WHATSAPP (NÃO ALTERA DDD)
===================================================== */

function normalizeWhatsAppNumber(input) {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");

  if (digits.length < 10) {
    throw new AppError("Número de WhatsApp inválido", 400);
  }

  // Se já começa com 55, mantém
  if (digits.startsWith("55")) {
    return digits;
  }

  // Caso contrário, adiciona 55 (Brasil)
  return `55${digits}`;
}

function generateWhatsAppLink(number, ad) {
  if (!number) return null;

  const message = `Olá! Tenho interesse no ${ad.title} anunciado no Carros na Cidade. Ainda está disponível?`;

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/* =====================================================
   CONFIGURAÇÕES DE RANKING
===================================================== */

const PLAN_WEIGHT = {
  free: 1,
  start: 2,
  pro: 3,
};

function calculatePlanScore(plan, highlighted) {
  let score = PLAN_WEIGHT[plan] || 1;

  if (highlighted) score += 4;

  return score;
}

async function getCityDemand(cityId) {
  const result = await pool.query(
    `SELECT demand_score FROM city_metrics WHERE city_id = $1`,
    [cityId]
  );

  return result.rows[0]?.demand_score || 1;
}

async function recalculateRanking(ad, userPlan, highlighted) {
  const demand = await getCityDemand(ad.city_id);
  const baseScore = calculatePlanScore(userPlan, highlighted);
  return baseScore * demand;
}

/* =====================================================
   LISTAR ANÚNCIOS
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

  return result.rows.map((ad) => ({
    ...ad,
    whatsapp_link: generateWhatsAppLink(ad.whatsapp_number, ad),
  }));
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

  return {
    ...ad,
    whatsapp_link: generateWhatsAppLink(ad.whatsapp_number, ad),
  };
}

/* =====================================================
   CRIAR ANÚNCIO
===================================================== */

export async function create(data, user) {
  await checkAdLimit(user.id, user.plan);

  const whatsapp_number = normalizeWhatsAppNumber(data.whatsapp_number);

  const rankingScore = await recalculateRanking(
    { city_id: data.city_id },
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
      whatsapp_number,
      status,
      highlighted,
      ranking_score,
      created_at,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6,'active',false,$7,NOW(),NOW())
    RETURNING *
    `,
    [
      user.id,
      data.title,
      data.description || "",
      data.price,
      data.city_id,
      whatsapp_number,
      rankingScore,
    ]
  );

  return {
    ...result.rows[0],
    whatsapp_link: generateWhatsAppLink(
      whatsapp_number,
      result.rows[0]
    ),
  };
}

/* =====================================================
   ATUALIZAR ANÚNCIO
===================================================== */

export async function update(id, data, user) {
  const ad = await show(id);

  if (ad.user_id !== user.id) {
    throw new AppError("Sem permissão", 403);
  }

  const whatsapp_number = data.whatsapp_number
    ? normalizeWhatsAppNumber(data.whatsapp_number)
    : ad.whatsapp_number;

  const updatedFields = {
    title: data.title ?? ad.title,
    description: data.description ?? ad.description,
    price: data.price ?? ad.price,
    city_id: data.city_id ?? ad.city_id,
  };

  const rankingScore = await recalculateRanking(
    updatedFields,
    user.plan,
    ad.highlighted
  );

  const result = await pool.query(
    `
    UPDATE ads
    SET title = $1,
        description = $2,
        price = $3,
        city_id = $4,
        whatsapp_number = $5,
        ranking_score = $6,
        updated_at = NOW()
    WHERE id = $7
    RETURNING *
    `,
    [
      updatedFields.title,
      updatedFields.description,
      updatedFields.price,
      updatedFields.city_id,
      whatsapp_number,
      rankingScore,
      id,
    ]
  );

  return {
    ...result.rows[0],
    whatsapp_link: generateWhatsAppLink(
      whatsapp_number,
      result.rows[0]
    ),
  };
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
    true
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
   IA — MELHORAR DESCRIÇÃO
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
