import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";
import * as adsRepository from "./ads.repository.js";

function assertOwner(ownerContext, userId) {
  if (!ownerContext) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  const owners = [ownerContext.user_id, ownerContext.advertiser_user_id]
    .filter(Boolean)
    .map(Number);

  if (!owners.includes(Number(userId))) {
    throw new AppError("Sem permissão para alterar este anúncio", 403);
  }
}

async function findAdvertiserByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id FROM advertisers WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function createAd(data, user) {
  const advertiser = await findAdvertiserByUserId(user.id);

  const slug = slugify(
    `${data.brand}-${data.model}-${data.year}-${Date.now()}`
  );

  return adsRepository.createAd({
    ...data,
    user_id: user.id,
    advertiser_id: advertiser?.id || null,
    plan: user.plan || "free",
    slug,
    status: "active",
  });
}

export async function updateAd(id, data, user) {
  const ownerContext = await adsRepository.findOwnerContextById(id);
  assertOwner(ownerContext, user.id);

  const updated = await adsRepository.updateAd(id, data);

  if (!updated) {
    throw new AppError("Falha ao atualizar anúncio", 500);
  }

  return updated;
}

export async function removeAd(id, user) {
  const ownerContext = await adsRepository.findOwnerContextById(id);
  assertOwner(ownerContext, user.id);

  const removed = await adsRepository.softDeleteAd(id);

  if (!removed) {
    throw new AppError("Falha ao remover anúncio", 500);
  }

  return removed;
}
