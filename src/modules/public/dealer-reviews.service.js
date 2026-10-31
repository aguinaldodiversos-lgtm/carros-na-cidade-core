import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

function safeAuthorName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Cliente";
  return (parts[0] + (parts.length > 1 ? " " + parts.at(-1).charAt(0) + "." : "")).slice(0, 60);
}

export async function listPublicDealerReviews(dealerId) {
  const result = await pool.query(
    "SELECT id, reviewer_name AS author, rating, body, created_at FROM dealer_reviews " +
      "WHERE advertiser_id = $1 AND status = 'published' ORDER BY created_at DESC, id DESC LIMIT 30",
    [dealerId]
  );
  return result.rows;
}

export async function submitDealerReview(slug, userId, input) {
  const rating = Number(input?.rating);
  const body = String(input?.body ?? "").trim();
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    body.length < 15 ||
    body.length > 500
  ) {
    throw new AppError("Escolha 1 a 5 estrelas e escreva entre 15 e 500 caracteres.", 400);
  }
  const result = await pool.query(
    "SELECT a.id, a.user_id::text AS owner_id, u.name AS reviewer_name " +
      "FROM advertisers a JOIN users u ON u.id::text = $2 " +
      "WHERE a.slug = $1 AND COALESCE(a.status, 'active') = 'active' LIMIT 1",
    [
      String(slug || "")
        .trim()
        .toLowerCase(),
      String(userId),
    ]
  );
  const dealer = result.rows[0];
  if (!dealer) throw new AppError("Loja não encontrada.", 404);
  if (dealer.owner_id === String(userId)) {
    throw new AppError("Não é permitido avaliar a própria loja.", 403);
  }
  try {
    const inserted = await pool.query(
      "INSERT INTO dealer_reviews (advertiser_id, reviewer_user_id, reviewer_name, rating, body) " +
        "VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [dealer.id, String(userId), safeAuthorName(dealer.reviewer_name), rating, body]
    );
    return { id: inserted.rows[0].id };
  } catch (err) {
    if (err?.code === "23505") throw new AppError("Você já avaliou esta loja.", 409);
    throw err;
  }
}

