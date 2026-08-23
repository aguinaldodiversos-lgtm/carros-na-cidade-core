// Constantes do domínio de notificações internas (fonte única do backend).
// Espelho no frontend: frontend/lib/notifications/api.ts — manter em sincronia.

/**
 * Limites de entrada. Validados no backend E espelhados no front.
 *
 * Os textos são curtos de propósito: o sino é um resumo, não um documento. Um
 * `body` de 2 KB não cabe no dropdown e ainda multiplicaria o custo de uma
 * tabela que cresce por evento, não por usuário.
 */
export const NOTIFICATION_LIMITS = Object.freeze({
  EVENT_TYPE_MAX: 64,
  TITLE_MIN: 1,
  TITLE_MAX: 120,
  BODY_MIN: 1,
  BODY_MAX: 500,
  ENTITY_TYPE_MAX: 40,
  ENTITY_ID_MAX: 64,
  ACTION_PATH_MAX: 512,
  IDEMPOTENCY_KEY_MIN: 1,
  IDEMPOTENCY_KEY_MAX: 200,
  /** Teto do JSON serializado de `payload`. Não é depósito de dados. */
  PAYLOAD_MAX_BYTES: 4096,
});

/** Paginação da listagem. `limit` do cliente é sempre clampado a estes valores. */
export const NOTIFICATION_PAGE = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
});

/**
 * Prefixos de rota INTERNA aceitos em `action_path`.
 *
 * Allowlist, não blocklist: qualquer caminho fora desta lista é recusado, mesmo
 * sendo interno e inofensivo. Uma blocklist ("recuse http://, recuse //")
 * precisa prever cada forma de escapar; uma allowlist só precisa saber para
 * onde o produto de fato manda o usuário.
 *
 * As duas áreas privadas cobrem tudo que os Produtos A e B vão precisar — as
 * telas deles nascem como sub-rotas destes prefixos.
 */
export const NOTIFICATION_ALLOWED_ACTION_PREFIXES = Object.freeze([
  "/dashboard",
  "/dashboard-loja",
]);

/**
 * Vocabulário de evento que os Produtos A e B vão emitir.
 *
 * NÃO é validado como allowlist fechada (o banco guarda TEXT livre, e a Fase 1
 * não pode travar eventos que ainda não existem). Está aqui para que o produto
 * futuro use o mesmo literal dos dois lados em vez de inventar uma string solta
 * — e para documentar o formato `dominio.fato_no_passado`.
 */
export const NOTIFICATION_EVENT_TYPE = Object.freeze({
  /** Fase 2 — procura publicada; avisa os lojistas CNPJ da mesma cidade. */
  PURCHASE_INTENT_CREATED: "purchase_intent.created",
  PURCHASE_INTENT_OFFER_RECEIVED: "purchase_intent.offer_received",
  PURCHASE_INTENT_VEHICLE_SELECTED: "purchase_intent.vehicle_selected",
  SALE_REQUEST_BID_RECEIVED: "sale_request.bid_received",
  SALE_REQUEST_OUTBID: "sale_request.outbid",
  SALE_REQUEST_BID_SELECTED: "sale_request.bid_selected",

  /**
   * Fase 4.5 — a avaliação presencial e a proposta final.
   *
   * `APPOINTMENT_CONFIRMED` (logo abaixo) JÁ EXISTIA e cobre "o proprietário
   * escolheu o horário" — reutilizado em vez de criar um
   * `sale_request.inspection_confirmed` que diria a mesma coisa com outro nome.
   * Os quatro daqui são os que não tinham equivalente.
   */
  SALE_REQUEST_INSPECTION_SLOTS_OFFERED: "sale_request.inspection_slots_offered",
  SALE_REQUEST_INSPECTION_SLOTS_REQUESTED: "sale_request.inspection_slots_requested",
  SALE_REQUEST_FINAL_OFFER_SUBMITTED: "sale_request.final_offer_submitted",
  SALE_REQUEST_FINAL_OFFER_DECLINED: "sale_request.final_offer_declined",

  /** Reutilizado pela 4.5: o horário da avaliação presencial foi confirmado. */
  APPOINTMENT_CONFIRMED: "appointment.confirmed",
});
