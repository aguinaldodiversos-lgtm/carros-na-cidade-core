// Constantes do módulo de chamados de suporte (single source of truth do
// backend). O espelho no frontend fica em frontend/lib/support/api.ts —
// mantenha os valores em sincronia.

/** Status de um chamado. Só o admin muda manualmente; transições automáticas
 * (aberto→em_andamento na resposta do admin, resolvido→aberto quando o
 * usuário responde) ficam na camada de serviço. */
export const SUPPORT_TICKET_STATUS = Object.freeze({
  OPEN: "aberto",
  IN_PROGRESS: "em_andamento",
  RESOLVED: "resolvido",
});

export const SUPPORT_TICKET_STATUSES = Object.freeze([
  SUPPORT_TICKET_STATUS.OPEN,
  SUPPORT_TICKET_STATUS.IN_PROGRESS,
  SUPPORT_TICKET_STATUS.RESOLVED,
]);

/** Papel de quem escreveu a mensagem (snapshot gravado na linha). */
export const SUPPORT_AUTHOR_ROLE = Object.freeze({
  USER: "user",
  ADMIN: "admin",
});

/** Categorias permitidas para triagem (opcional no chamado). */
export const SUPPORT_CATEGORIES = Object.freeze([
  "conta",
  "plano",
  "anuncios",
  "pagamento",
  "outro",
]);

/** Limites de tamanho de entrada. Validados no backend E espelhados no front. */
export const SUPPORT_LIMITS = Object.freeze({
  SUBJECT_MIN: 3,
  SUBJECT_MAX: 120,
  BODY_MIN: 1,
  BODY_MAX: 5000,
});
