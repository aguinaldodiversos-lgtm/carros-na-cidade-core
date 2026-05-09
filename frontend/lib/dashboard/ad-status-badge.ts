/**
 * Mapeamento de status de anúncio (`DashboardAd.status`) para a variante
 * do badge exibido no card. Função pura, isolada do componente para que
 * o backend test runner (vitest sem jsdom) cubra o contrato sem precisar
 * de DOM.
 *
 * Regras (alinhadas a AD_STATUS no backend):
 *   pending_review → "pending_review"
 *   rejected       → "rejected"
 *   blocked        → "blocked"
 *   sold           → "sold"
 *   expired        → "expired"
 *   active         → "highlighted" (se is_featured) | "active"
 *   demais         → "paused"
 */

export type AdBadgeVariant =
  | "active"
  | "paused"
  | "highlighted"
  | "pending_review"
  | "rejected"
  | "sold"
  | "expired"
  | "blocked";

export const AD_BADGE_STYLE: Record<
  AdBadgeVariant,
  { bg: string; label: string }
> = {
  highlighted: { bg: "#e43358", label: "Destaque" },
  active: { bg: "#198754", label: "Ativo" },
  pending_review: { bg: "#d97706", label: "Em análise" },
  rejected: { bg: "#b91c1c", label: "Rejeitado" },
  paused: { bg: "#8f98af", label: "Pausado" },
  sold: { bg: "#475569", label: "Vendido" },
  expired: { bg: "#6b7280", label: "Expirado" },
  blocked: { bg: "#7f1d1d", label: "Bloqueado" },
};

/**
 * Status que NÃO devem mostrar o badge "Destaque" mesmo quando
 * `is_featured` for true. Em moderação ou bloqueio o estado de
 * destaque é irrelevante e induziria o usuário ao erro.
 */
const HIDE_HIGHLIGHT_STATUSES = new Set<string>([
  "pending_review",
  "rejected",
  "blocked",
  "sold",
  "expired",
  "paused",
]);

export function resolveAdBadgeVariant(
  status: string,
  highlighted: boolean
): AdBadgeVariant {
  if (status === "pending_review") return "pending_review";
  if (status === "rejected") return "rejected";
  if (status === "blocked") return "blocked";
  if (status === "sold") return "sold";
  if (status === "expired") return "expired";
  if (highlighted && !HIDE_HIGHLIGHT_STATUSES.has(status) && status === "active") {
    return "highlighted";
  }
  if (status === "active") return "active";
  return "paused";
}
