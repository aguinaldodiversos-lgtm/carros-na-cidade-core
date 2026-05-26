import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-reports.repository.js";

/**
 * Conjunto canônico de status de denúncia. Espelha a CHECK constraint
 * `ad_reports_status_check` definida em migration 026. Não pode aceitar
 * valor fora dessa lista — DB rejeitaria de qualquer forma, mas a
 * validação aqui dá mensagem clara.
 */
export const REPORT_STATUSES = Object.freeze([
  "new",
  "in_review",
  "resolved",
  "dismissed",
]);

/**
 * Status que exigem `reason` (decisão editorial registrada na auditoria).
 * "in_review" não exige — é apenas marca-de-leitura administrativa.
 */
const REPORT_STATUSES_REQUIRING_REASON = new Set(["resolved", "dismissed"]);

function isValidReportStatus(value) {
  return typeof value === "string" && REPORT_STATUSES.includes(value);
}

export async function listReports(filters) {
  return repo.list(filters);
}

export async function getReportById(id) {
  const report = await repo.findById(id);
  if (!report) throw new AppError("Denúncia não encontrada", 404);
  const history = await repo.findActionHistory(id);
  return { ...report, history };
}

export async function getReportsSummary() {
  const counts = await repo.countByStatus();
  return {
    counts,
    total: counts.new + counts.in_review + counts.resolved + counts.dismissed,
  };
}

/**
 * Muda o status da denúncia, registra `admin_actions` e devolve o
 * estado atualizado. `reason` é obrigatório para `resolved`/`dismissed`
 * (decisão editorial); opcional para `in_review`/`new`.
 *
 * `target_type='ad_report'` permite que a página de detalhe leia o
 * histórico inteiro via repo.findActionHistory sem schema novo.
 */
export async function changeReportStatus(adminUserId, reportId, newStatus, reason = null) {
  if (!isValidReportStatus(newStatus)) {
    throw new AppError(
      `Status invalido: ${newStatus}. Valores aceitos: ${REPORT_STATUSES.join(", ")}`,
      400
    );
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;

  if (REPORT_STATUSES_REQUIRING_REASON.has(newStatus) && !trimmedReason) {
    throw new AppError(`Motivo (reason) e obrigatorio para status "${newStatus}".`, 400);
  }

  const current = await repo.findById(reportId);
  if (!current) throw new AppError("Denúncia não encontrada", 404);

  if (current.status === newStatus) {
    // No-op semântico: não atualizamos updated_at nem auditamos.
    return current;
  }

  const updated = await repo.updateStatus(reportId, newStatus);

  await recordAdminAction({
    adminUserId,
    action: "change_report_status",
    targetType: "ad_report",
    targetId: reportId,
    oldValue: { status: current.status },
    newValue: { status: newStatus },
    reason: trimmedReason,
  });

  return updated;
}
