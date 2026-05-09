import crypto from "node:crypto";

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import {
  AD_REPORTS_RATE_LIMIT,
  AD_REPORT_DESCRIPTION_MAX_LENGTH,
  AD_REPORT_REASONS,
} from "./ad-reports.constants.js";
import * as adReportsRepository from "./ad-reports.repository.js";

/**
 * Valida + persiste uma denúncia.
 *
 * Regras:
 *   - reason: obrigatório, deve estar na whitelist canônica.
 *   - description: opcional, máx. 1000 chars (truncamos com sinalização
 *     no log; controller informa o usuário só se quiser).
 *   - reporter_user_id: vem do auth middleware quando logado, null caso
 *     contrário. Aceita anônimo para reduzir fricção do fluxo.
 *   - rate limit: por IP global (10/h) e por IP×ad (3/h). Hash sha256.
 *
 * Não bloqueia o anúncio. A moderação (futura) consome a tabela.
 */
export function hashIp(ip) {
  if (typeof ip !== "string" || !ip.trim()) return null;
  return crypto.createHash("sha256").update(ip.trim()).digest("hex");
}

function normalizeReason(reason) {
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim().toLowerCase();
  return AD_REPORT_REASONS.includes(trimmed) ? trimmed : null;
}

function normalizeDescription(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, AD_REPORT_DESCRIPTION_MAX_LENGTH);
}

export async function createReport({
  adId,
  reason,
  description,
  reporterUserId,
  reporterIp,
}) {
  const numericAdId = Number(adId);
  if (!Number.isInteger(numericAdId) || numericAdId <= 0) {
    throw new AppError("ID do anúncio inválido", 400);
  }

  const normalizedReason = normalizeReason(reason);
  if (!normalizedReason) {
    throw new AppError("Motivo da denúncia inválido ou ausente", 400);
  }

  const normalizedDescription = normalizeDescription(description);

  const exists = await adReportsRepository.adExistsForReport(numericAdId);
  if (!exists) {
    throw new AppError("Anúncio não encontrado", 404);
  }

  const ipHash = hashIp(reporterIp);

  if (ipHash) {
    const recentSameAd = await adReportsRepository.countRecentByIpHashAndAd(
      ipHash,
      numericAdId,
      AD_REPORTS_RATE_LIMIT.WINDOW_SECONDS
    );
    if (recentSameAd >= AD_REPORTS_RATE_LIMIT.MAX_PER_AD_PER_IP) {
      throw new AppError(
        "Você já denunciou este anúncio recentemente. Nossa equipe já está revisando.",
        429
      );
    }

    const recentGlobal = await adReportsRepository.countRecentByIpHash(
      ipHash,
      AD_REPORTS_RATE_LIMIT.WINDOW_SECONDS
    );
    if (recentGlobal >= AD_REPORTS_RATE_LIMIT.MAX_PER_IP) {
      throw new AppError(
        "Limite de denúncias atingido. Tente novamente mais tarde.",
        429
      );
    }
  }

  const inserted = await adReportsRepository.insertReport({
    ad_id: numericAdId,
    reporter_user_id: reporterUserId ? String(reporterUserId) : null,
    reporter_ip_hash: ipHash,
    reason: normalizedReason,
    description: normalizedDescription,
  });

  return {
    id: inserted.id,
    ad_id: inserted.ad_id,
    reason: inserted.reason,
    status: inserted.status,
    created_at: inserted.created_at,
  };
}
