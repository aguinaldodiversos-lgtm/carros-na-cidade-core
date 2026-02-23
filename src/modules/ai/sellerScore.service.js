import { pool } from "../../infrastructure/database/db.js";

export async function recalculateSellerScore(sellerId) {
  const result = await pool.query(
    `
    SELECT total_leads, total_responses
    FROM seller_scores
    WHERE seller_id = $1
    `,
    [sellerId]
  );

  if (result.rows.length === 0) return;

  const { total_leads, total_responses } = result.rows[0];

  const responseRate =
    total_leads > 0 ? total_responses / total_leads : 0;

  const score = responseRate * 100;

  await pool.query(
    `
    UPDATE seller_scores
    SET score = $1,
        updated_at = NOW()
    WHERE seller_id = $2
    `,
    [score, sellerId]
  );
}
