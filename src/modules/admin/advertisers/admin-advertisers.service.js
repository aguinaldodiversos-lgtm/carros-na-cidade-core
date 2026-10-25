import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { ADVERTISER_STATUS, isValidAdvertiserStatus } from "../../../shared/constants/status.js";
import { recordAdminAction } from "../admin.audit.js";
import { isValidCnpj } from "../../account/cnpj-validation.js";
import * as repo from "./admin-advertisers.repository.js";
import {
  grantAdvertiserPlan,
  revokeAdvertiserPlan,
  expireDueGrantsForUser,
  buildAdvertiserPlanInfo,
} from "./advertiser-plan-grant.service.js";

// Reexporta a concessão manual de plano para que admin.routes continue
// consumindo o módulo de anunciantes como fachada única.
export { grantAdvertiserPlan, revokeAdvertiserPlan };

export async function listAdvertisers(filters) {
  return repo.listAdvertisers(filters);
}

export async function getAdvertiserById(id) {
  const advertiser = await repo.findById(id);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  // Sem usuário vinculado não há plano efetivo a resolver (anunciante legado).
  if (!advertiser.user_id) return advertiser;

  // Auto-cura: expira concessões vencidas (revertendo users.plan_id) antes de
  // exibir, para que o admin sempre veja o estado correto mesmo sem cron.
  await expireDueGrantsForUser(advertiser.user_id);

  const planInfo = await buildAdvertiserPlanInfo(advertiser.user_id);
  return { ...advertiser, ...planInfo };
}

export async function changeAdvertiserStatus(adminUserId, advertiserId, newStatus, reason = null) {
  if (!isValidAdvertiserStatus(newStatus)) {
    throw new AppError(`Status inválido: ${newStatus}`, 400);
  }

  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);

  const oldStatus = advertiser.status;
  const updated = await repo.updateStatus(advertiserId, newStatus, reason);

  await recordAdminAction({
    adminUserId,
    action: "change_advertiser_status",
    targetType: "advertiser",
    targetId: advertiserId,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus, reason },
    reason,
  });

  return updated;
}

/**
 * A verificação é feita somente pelo administrador, com evidência registrada.
 * CNPJ com dígitos verificadores válidos não equivale a consulta à Receita ou
 * confirmação da loja física. O backend exige as duas declarações explícitas.
 */
export async function updateAdvertiserVerification(adminUserId, advertiserId, input) {
  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);
  if (String(advertiser.document_type ?? "").toLowerCase() !== "cnpj") {
    throw new AppError("Verificação de loja disponível apenas para CNPJ.", 403);
  }
  const verified = input?.verified === true;
  if (input?.verified !== true && input?.verified !== false) {
    throw new AppError("Informe verified como booleano.", 400);
  }
  const reason = String(input?.reason ?? "").trim();
  if (reason.length < 15 || reason.length > 800) {
    throw new AppError("Registre uma justificativa de 15 a 800 caracteres.", 400);
  }
  if (verified) {
    if (!isValidCnpj(advertiser.document_number)) {
      throw new AppError("CNPJ inválido. Não é possível verificar a loja.", 422);
    }
    if (!advertiser.address?.trim() || !advertiser.city_id || !advertiser.name?.trim()) {
      throw new AppError("Loja sem endereço e cidade suficientes para averiguação.", 422);
    }
    if (input?.checked_receita !== true || input?.checked_physical_store !== true) {
      throw new AppError(
        "Confirme a consulta oficial do CNPJ e a existência do estabelecimento físico.",
        400
      );
    }
  }
  const updated = await repo.setVerification(advertiserId, verified);
  if (!updated) throw new AppError("Anunciante não encontrado", 404);
  await recordAdminAction({
    adminUserId,
    action: verified ? "verify_physical_store" : "revoke_physical_store_verification",
    targetType: "advertiser",
    targetId: advertiserId,
    oldValue: { verified: Boolean(advertiser.verified) },
    newValue: {
      verified,
      checked_receita: verified,
      checked_physical_store: verified,
    },
    reason,
  });
  return updated;
}

export async function getAdvertiserAds(advertiserId, options) {
  const advertiser = await repo.findById(advertiserId);
  if (!advertiser) throw new AppError("Anunciante não encontrado", 404);
  return repo.getAdvertiserAds(advertiserId, options);
}
