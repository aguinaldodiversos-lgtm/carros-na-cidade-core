/**
 * Contrato do payload exposto por GET /api/ads/:id/publication-options
 * (Fase 4). Reflete o shape devolvido pelo service backend
 * `ads.publication-options.service.js`. Aqui só TIPAMOS — preço,
 * limite, ações e razões SEMPRE vêm do backend.
 */

export type PublicationActionId =
  | "publish_free"
  | "publish_with_subscription"
  | "boost_7d"
  | "subscribe_start"
  | "subscribe_pro"
  | "upgrade_to_pro";

export type PublicationActionBase = {
  id: PublicationActionId;
  enabled: boolean;
  reason?: string | null;
};

export type PublicationActionPublishFree = PublicationActionBase & {
  id: "publish_free";
};

export type PublicationActionPublishWithSubscription = PublicationActionBase & {
  id: "publish_with_subscription";
  plan_id: string;
  subscription_status: string;
};

export type PublicationActionBoost7d = PublicationActionBase & {
  id: "boost_7d";
  ad_id: string;
  price_cents: number;
  days: number;
  already_active: boolean;
  highlight_until: string | null;
  note: string | null;
};

export type PublicationActionSubscribeStart = PublicationActionBase & {
  id: "subscribe_start";
  plan_id: string;
  price_cents: number;
};

export type PublicationActionSubscribePro = PublicationActionBase & {
  id: "subscribe_pro";
  plan_id: string;
  price_cents: number;
};

/** Forma comum para reuso em UI (label/cta variam, payload é igual). */
export type PublicationActionSubscribePlan =
  | PublicationActionSubscribeStart
  | PublicationActionSubscribePro;

export type PublicationActionUpgradeToPro = PublicationActionBase & {
  id: "upgrade_to_pro";
  plan_id: string;
};

export type PublicationAction =
  | PublicationActionPublishFree
  | PublicationActionPublishWithSubscription
  | PublicationActionBoost7d
  | PublicationActionSubscribeStart
  | PublicationActionSubscribePro
  | PublicationActionUpgradeToPro;

export type PublicationOptionsAd = {
  id: string;
  title: string;
  status: "active" | "paused";
  highlight_until: string | null;
  highlight_active: boolean;
};

export type PublicationOptionsUser = {
  id: string;
  type: "CPF" | "CNPJ" | "pending";
  cnpj_verified: boolean;
  document_verified: boolean;
};

export type PublicationOptionsAdLimit = {
  used: number;
  total: number;
  available: number;
};

export type PublicationOptionsPayload = {
  ad: PublicationOptionsAd;
  user: PublicationOptionsUser;
  current_plan: { id: string; name: string; ad_limit: number } | null;
  active_subscription: { plan_id: string; status: string } | null;
  ad_limit: PublicationOptionsAdLimit;
  eligibility: { can_publish_free: boolean; reason: string | null };
  actions: PublicationAction[];
};

/**
 * `price_cents` (em centavos) → string formatada em pt-BR.
 * Frontend NUNCA calcula valor — apenas formata o que veio do backend.
 */
export function formatBrlFromCents(priceCents: number): string {
  if (!Number.isFinite(priceCents)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(priceCents / 100);
}
