/**
 * Autorização central de edição de anúncio.
 *
 * Ponto único de verdade para responder "este usuário pode editar este
 * anúncio?". Antes desta função a regra estava espalhada (assertOwner inline
 * no panel.service, WHERE adv.user_id no account.service), o que abria espaço
 * para divergência entre os caminhos de leitura e de escrita.
 *
 * Modelo de propriedade (IGUAL para pessoa física e lojista/CNPJ):
 *   ads.advertiser_id → advertisers.id → advertisers.user_id = users.id
 * Ou seja, tanto PF quanto CNPJ apontam para uma linha em `advertisers`
 * cujo `user_id` é o dono. `ownerContext.advertiser_user_id` carrega esse
 * valor (ver ads.repository.findOwnerContextById e
 * account.service.getOwnedAd). Não existe um campo `user_id` direto em `ads`.
 *
 * Admin: `user.role === 'admin'` ignora ownership e status (moderação tem
 * caminho próprio no módulo admin, mas o bypass aqui mantém a função honesta
 * caso seja reutilizada).
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { AD_STATUS } from "./ads.canonical.constants.js";

/**
 * Status em que o DONO pode editar o conteúdo do próprio anúncio.
 *
 *   draft / pending_review / active / paused / rejected / blocked → editável
 *
 * Bloqueados para o dono (somente leitura ou caminho administrativo):
 *   sold / expired / archived / deleted
 *
 * `reserved` não existe como status no domínio (ver shared/constants/status.js),
 * por isso não aparece aqui.
 *
 * POR QUE `blocked` É EDITÁVEL (Fase 4.10A)
 * -----------------------------------------
 * Motivos como "Informação incorreta", "Fotos inadequadas" e "Preço ou condição
 * enganosa" pedem uma correção — e travar a edição deixava o anunciante sem
 * caminho nenhum para atendê-la. Editar é justamente o que a moderação está
 * pedindo que ele faça.
 *
 * Isso NÃO afrouxa o bloqueio, e a razão é que editar e publicar são portas
 * diferentes:
 *
 *   - `status` no corpo da edição continua recusado com 400
 *     (guard em ads.panel.service.updateAd);
 *   - nenhum campo `blocked_*` está em `UPDATE_FIELDS`
 *     (ads.repository), então a edição não tem como tocá-los;
 *   - `AD_STATUS_OWNER_OPERABLE` (activate/pause) e
 *     `AD_STATUS_CAN_RECEIVE_BOOST` seguem SEM `blocked`;
 *   - o pipeline de edição não recalcula status — não existe transição
 *     automática que pudesse trocar `blocked` por `pending_review`.
 *
 * O anúncio corrigido só volta ao ar quando o admin reativa, e a reativação
 * restaura `blocked_previous_status` — que a edição também não altera.
 */
export const AD_STATUS_OWNER_EDITABLE = Object.freeze([
  AD_STATUS.DRAFT,
  AD_STATUS.PENDING_REVIEW,
  AD_STATUS.ACTIVE,
  AD_STATUS.PAUSED,
  AD_STATUS.REJECTED,
  AD_STATUS.BLOCKED,
]);

export function isAdminUser(user) {
  return String(user?.role || "").toLowerCase() === "admin";
}

/**
 * Decisão pura (sem efeitos colaterais) sobre editar um anúncio.
 *
 * @param {{ id?: string|number, role?: string }} user — req.user
 * @param {{ advertiser_user_id?: string|number|null, status?: string|null } | null} ownerContext
 * @returns {{ allowed: boolean, reason: string, httpStatus?: number, status?: string }}
 */
export function canUserEditAd(user, ownerContext) {
  if (!ownerContext) {
    return { allowed: false, reason: "not_found", httpStatus: 404 };
  }

  if (isAdminUser(user)) {
    return { allowed: true, reason: "admin" };
  }

  const ownerId = ownerContext.advertiser_user_id;
  if (ownerId == null || user?.id == null) {
    // Sem vínculo de dono resolvido: tratamos como "não encontrado" para não
    // vazar a existência do anúncio a quem não é dono.
    return { allowed: false, reason: "not_found", httpStatus: 404 };
  }

  if (String(ownerId) !== String(user.id)) {
    return { allowed: false, reason: "forbidden", httpStatus: 403 };
  }

  const status = String(ownerContext.status || "");
  if (!AD_STATUS_OWNER_EDITABLE.includes(status)) {
    return { allowed: false, reason: "status_locked", httpStatus: 409, status };
  }

  return { allowed: true, reason: "owner" };
}

/**
 * Apenas ownership (sem checar status). Usado por fluxos que têm sua própria
 * regra de status — ex.: DELETE/soft-delete, que pode incidir sobre estados
 * que a edição de conteúdo recusa.
 *
 * @returns {{ allowed: boolean, reason: string, httpStatus?: number }}
 */
export function canUserOwnAd(user, ownerContext) {
  if (!ownerContext || ownerContext.advertiser_user_id == null) {
    return { allowed: false, reason: "not_found", httpStatus: 404 };
  }
  if (isAdminUser(user)) {
    return { allowed: true, reason: "admin" };
  }
  if (user?.id == null || String(ownerContext.advertiser_user_id) !== String(user.id)) {
    return ownerContext.advertiser_user_id == null
      ? { allowed: false, reason: "not_found", httpStatus: 404 }
      : { allowed: false, reason: "forbidden", httpStatus: 403 };
  }
  return { allowed: true, reason: "owner" };
}

function throwFromVerdict(verdict) {
  if (verdict.httpStatus === 404) {
    throw new AppError("Anúncio não encontrado", 404);
  }
  if (verdict.httpStatus === 403) {
    throw new AppError("Sem permissão para alterar este anúncio", 403);
  }
  if (verdict.httpStatus === 409) {
    throw new AppError(
      "Este anúncio não pode ser editado no status atual. Anúncios vendidos, expirados, arquivados, bloqueados ou removidos não aceitam edição pelo anunciante.",
      409,
      true,
      { code: "AD_STATUS_NOT_EDITABLE", status: verdict.status ?? null }
    );
  }
  // Fallback defensivo — não deveria ocorrer.
  throw new AppError("Sem permissão para alterar este anúncio", 403);
}

/**
 * Garante que o usuário pode EDITAR o conteúdo do anúncio (ownership + status).
 * Lança AppError 404/403/409 conforme o caso. Retorna o veredito em caso de
 * sucesso.
 */
export function assertCanEditAd(user, ownerContext) {
  const verdict = canUserEditAd(user, ownerContext);
  if (!verdict.allowed) {
    throwFromVerdict(verdict);
  }
  return verdict;
}

/**
 * Garante apenas a propriedade do anúncio (sem checar status). Lança 404/403.
 */
export function assertAdOwner(user, ownerContext) {
  const verdict = canUserOwnAd(user, ownerContext);
  if (!verdict.allowed) {
    throwFromVerdict(verdict);
  }
  return verdict;
}
