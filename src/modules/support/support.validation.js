// Validação de entrada dos chamados de suporte. Cada helper normaliza (trim)
// e lança AppError(400) com mensagem clara quando inválido — nunca deixa
// passar valor cru. Reutilizado por rotas de usuário e admin.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_LIMITS,
  SUPPORT_TICKET_STATUSES,
} from "./support.constants.js";

/** Assunto: string não-vazia, entre SUBJECT_MIN e SUBJECT_MAX chars (pós-trim). */
export function validateSubject(raw) {
  const subject = typeof raw === "string" ? raw.trim() : "";
  if (
    subject.length < SUPPORT_LIMITS.SUBJECT_MIN ||
    subject.length > SUPPORT_LIMITS.SUBJECT_MAX
  ) {
    throw new AppError(
      `O assunto deve ter entre ${SUPPORT_LIMITS.SUBJECT_MIN} e ${SUPPORT_LIMITS.SUBJECT_MAX} caracteres.`,
      400
    );
  }
  return subject;
}

/** Corpo da mensagem: string não-vazia, entre BODY_MIN e BODY_MAX chars. */
export function validateBody(raw) {
  const body = typeof raw === "string" ? raw.trim() : "";
  if (body.length < SUPPORT_LIMITS.BODY_MIN) {
    throw new AppError("A mensagem não pode ficar em branco.", 400);
  }
  if (body.length > SUPPORT_LIMITS.BODY_MAX) {
    throw new AppError(
      `A mensagem pode ter no máximo ${SUPPORT_LIMITS.BODY_MAX} caracteres.`,
      400
    );
  }
  return body;
}

/** Categoria: opcional. Se ausente/vazia → null. Se presente, precisa estar
 * na lista permitida. */
export function validateCategory(raw) {
  if (raw == null) return null;
  const category = String(raw).trim().toLowerCase();
  if (category === "") return null;
  if (!SUPPORT_CATEGORIES.includes(category)) {
    throw new AppError("Categoria inválida.", 400);
  }
  return category;
}

/** Status (mudança manual pelo admin): precisa estar na lista permitida. */
export function validateStatus(raw) {
  const status = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!SUPPORT_TICKET_STATUSES.includes(status)) {
    throw new AppError(
      `Status inválido. Use um de: ${SUPPORT_TICKET_STATUSES.join(", ")}.`,
      400
    );
  }
  return status;
}

/** Converte o :id da rota para inteiro positivo. Id malformado é tratado como
 * "não encontrado" (404) para não vazar existência nem detalhes de parsing. */
export function parseTicketId(raw) {
  const id = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("Chamado não encontrado.", 404);
  }
  return id;
}
