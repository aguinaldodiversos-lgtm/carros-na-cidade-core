import { pool } from "../../../infrastructure/database/db.js";
import { AppError } from "../../../shared/middlewares/error.middleware.js";

function assertPositiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(label + " inválido.", 400);
  }
  return id;
}

/** Consulta exclusivamente administrativa. Inclui reviews ocultas para auditoria. */
export async function listDealerReviewsForAdmin(advertiserId) {
  const id = assertPositiveId(advertiserId, "Anunciante");
  const result = await pool.query(
    "SELECT id, reviewer_name AS author, rating, body, status, created_at, " +
      "hidden_at, hidden_by_user_id FROM dealer_reviews " +
      "WHERE advertiser_id = $1 ORDER BY created_at DESC, id DESC LIMIT 100",
    [id]
  );
  return result.rows;
}

/**
 * Somente admin (rota protegida com requireAdmin).
 * Ocultação lógica, com justificativa obrigatória e registro de auditoria
 * na MESMA transação. Nunca apaga o comentário, a conta ou os anúncios.
 */
export async function hideDealerReviewByAdmin(adminUserId, advertiserId, reviewId, reasonInput) {
  const advertiser = assertPositiveId(advertiserId, "Anunciante");
  const review = assertPositiveId(reviewId, "Avaliação");
  const reason = String(reasonInput ?? "").trim();
  if (reason.length < 15 || reason.length > 500) {
    throw new AppError("Informe motivo administrativo entre 15 e 500 caracteres.", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      "SELECT id, advertiser_id, status FROM dealer_reviews " +
        "WHERE id = $1 AND advertiser_id = $2 FOR UPDATE",
      [review, advertiser]
    );
    const current = found.rows[0];
    if (!current) throw new AppError("Avaliação não encontrada nesta loja.", 404);
    if (current.status !== "published") {
      throw new AppError("Avaliação já está oculta.", 409);
    }

    await client.query(
      "UPDATE dealer_reviews SET status = 'hidden', hidden_at = NOW(), " +
        "hidden_by_user_id = $1, updated_at = NOW() " +
        "WHERE id = $2 AND advertiser_id = $3",
      [String(adminUserId), review, advertiser]
    );
    await client.query(
      "INSERT INTO admin_actions " +
        "(admin_user_id, action, target_type, target_id, old_value, new_value, reason) " +
        "VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)",
      [
        String(adminUserId),
        "hide_dealer_review",
        "dealer_review",
        String(review),
        JSON.stringify({ advertiser_id: advertiser, status: "published" }),
        JSON.stringify({ advertiser_id: advertiser, status: "hidden" }),
        reason,
      ]
    );
    await client.query("COMMIT");
    return { id: review, status: "hidden" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
