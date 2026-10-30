import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

function safeAuthorName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
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
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 15 || body.length > 500) {
    throw new AppError("Escolha 1 a 5 estrelas e escreva entre 15 e 500 caracteres.", 400);
  }
  const result = await pool.query(
    "SELECT a.id, a.user_id::text AS owner_id, u.name AS reviewer_name " +
      "FROM advertisers a JOIN users u ON u.id::text = $2 " +
      "WHERE a.slug = $1 AND COALESCE(a.status, 'active') = 'active' LIMIT 1",
    [String(slug || "").trim().toLowerCase(), String(userId)]
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

export async function listOwnerDealerReviews(userId) {
  const result = await pool.query(
    "SELECT r.id, r.reviewer_name AS author, r.rating, r.body, r.status, r.created_at " +
      "FROM dealer_reviews r JOIN advertisers a ON a.id = r.advertiser_id " +
      "WHERE a.user_id::text = $1 ORDER BY r.created_at DESC LIMIT 100",
    [String(userId)]
  );
  return result.rows;
}

/** A remoção pública é lógica: preserva trilha de auditoria para o administrador. */
export async function hideOwnedDealerReview(userId, reviewId) {
  const id = Number(reviewId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Avaliação inválida.", 400);
  const updated = await pool.query(
    "UPDATE dealer_reviews r SET status = 'hidden', hidden_at = NOW(), " +
      "hidden_by_user_id = $1, updated_at = NOW() FROM advertisers a " +
      "WHERE a.id = r.advertiser_id AND a.user_id::text = $1 AND r.id = $2 " +
      "AND r.status = 'published' RETURNING r.id",
    [String(userId), id]
  );
  if (!updated.rowCount) throw new AppError("Avaliação não encontrada ou já oculta.", 404);
  return { ok: true };
}
