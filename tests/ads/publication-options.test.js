import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Fase 4 — endpoint GET /api/ads/:id/publication-options.
 *
 * Cobre:
 *   1. Ownership (404 ad de outro user, 410 ad deleted/blocked)
 *   2. Caminhos de elegibilidade:
 *      - Free CPF dentro do limite → publish_free habilitado
 *      - Free CPF fora do limite → publish_free desabilitado, sem subscribe (CPF não vê)
 *      - Free CNPJ verificado dentro do limite → publish_free + subscribe_*
 *      - Free CNPJ verificado fora do limite → publish_free desabilitado, subscribe_* habilitado
 *      - Free CNPJ NÃO verificado → publish_free desabilitado com motivo
 *      - Start ativo → publish_with_subscription, sem subscribe_start, upgrade_to_pro placeholder
 *      - Pro ativo → publish_with_subscription, sem subscribe nem upgrade
 *      - Sub pending (não autorizada) → bloqueia subscribe duplicate
 *   3. Boost 7d sempre disponível com price_cents=3990 fixo
 *   4. Preço NUNCA do request — todos price_cents vêm de constante backend
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

vi.mock("../../src/modules/account/account.service.js", () => ({
  getAccountUser: vi.fn(),
  getOwnedAd: vi.fn(),
  countActiveAdsByUser: vi.fn(),
  resolveCurrentPlan: vi.fn(),
}));

const account = await import("../../src/modules/account/account.service.js");
const db = await import("../../src/infrastructure/database/db.js");
const { getPublicationOptions } = await import(
  "../../src/modules/ads/ads.publication-options.service.js"
);

const PLAN_FREE_CPF = { id: "cpf-free-essential", name: "Plano Gratuito (CPF)", ad_limit: 3, type: "CPF" };
const PLAN_FREE_CNPJ = { id: "cnpj-free-store", name: "Plano Gratuito Loja", ad_limit: 10, type: "CNPJ" };
const PLAN_START = { id: "cnpj-store-start", name: "Plano Loja Start", ad_limit: 20, type: "CNPJ" };
const PLAN_PRO = { id: "cnpj-store-pro", name: "Plano Loja Pro", ad_limit: 1000, type: "CNPJ" };

const AD_ACTIVE = {
  id: "ad-1",
  title: "Civic 2018",
  status: "active",
  highlight_until: null,
  owner_user_id: "u1",
};

beforeEach(() => {
  account.getAccountUser.mockReset();
  account.getOwnedAd.mockReset();
  account.countActiveAdsByUser.mockReset().mockResolvedValue(0);
  account.resolveCurrentPlan.mockReset();
  // Default: query devolve sem sub viva
  db.query.mockReset().mockResolvedValue({ rows: [] });
});

function findAction(payload, id) {
  return payload.actions.find((a) => a.id === id) || null;
}

// ─────────────────────────────────────────────────────────────────────
// Ownership / status do anúncio
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — ownership e status", () => {
  it("propaga 404 quando getOwnedAd rejeita (ad de outro user)", async () => {
    const { AppError } = await import("../../src/shared/middlewares/error.middleware.js");
    account.getOwnedAd.mockRejectedValue(new AppError("Anuncio nao encontrado.", 404));

    await expect(
      getPublicationOptions({ userId: "u1", adId: "ad-other" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("410 quando anúncio está em status='deleted'", async () => {
    account.getOwnedAd.mockResolvedValue({ ...AD_ACTIVE, status: "deleted" });

    await expect(
      getPublicationOptions({ userId: "u1", adId: "ad-1" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("410 quando anúncio está em status='blocked'", async () => {
    account.getOwnedAd.mockResolvedValue({ ...AD_ACTIVE, status: "blocked" });

    await expect(
      getPublicationOptions({ userId: "u1", adId: "ad-1" })
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it("aceita status='paused' (anúncio pausado pode ser destacado/republicado)", async () => {
    account.getOwnedAd.mockResolvedValue({ ...AD_ACTIVE, status: "paused" });
    account.getAccountUser.mockResolvedValue({ id: "u1", type: "CPF", cnpj_verified: false, document_verified: true });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CPF);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(r.ad.status).toBe("paused");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Free CPF
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — Free CPF", () => {
  beforeEach(() => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CPF",
      cnpj_verified: false,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CPF);
  });

  it("dentro do limite (1/3): publish_free enabled, NÃO oferece subscribe (user é CPF)", async () => {
    account.countActiveAdsByUser.mockResolvedValue(1);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });

    expect(findAction(r, "publish_free")).toMatchObject({ id: "publish_free", enabled: true });
    // CPF não vê subscribe (whitelist Start/Pro é CNPJ)
    expect(findAction(r, "subscribe_start")).toBeNull();
    expect(findAction(r, "subscribe_pro")).toBeNull();
    // Boost sempre presente
    expect(findAction(r, "boost_7d")).toMatchObject({
      enabled: true,
      price_cents: 3990,
      days: 7,
    });
  });

  it("no limite (3/3): publish_free desabilitado com motivo, mas boost ainda OK", async () => {
    account.countActiveAdsByUser.mockResolvedValue(3);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    const pf = findAction(r, "publish_free");
    expect(pf.enabled).toBe(false);
    expect(pf.reason).toMatch(/Limite/i);
    expect(findAction(r, "boost_7d").enabled).toBe(true);
    expect(r.eligibility.can_publish_free).toBe(false);
  });

  it("ad_limit reflete used/total/available corretamente", async () => {
    account.countActiveAdsByUser.mockResolvedValue(2);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(r.ad_limit).toEqual({ used: 2, total: 3, available: 1 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Free CNPJ verificado
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — Free CNPJ verificado", () => {
  beforeEach(() => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CNPJ);
  });

  it("dentro do limite (5/10): publish_free + subscribe_start + subscribe_pro habilitados", async () => {
    account.countActiveAdsByUser.mockResolvedValue(5);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "publish_free").enabled).toBe(true);
    expect(findAction(r, "subscribe_start")).toMatchObject({
      enabled: true,
      plan_id: "cnpj-store-start",
      price_cents: 7990,
    });
    expect(findAction(r, "subscribe_pro")).toMatchObject({
      enabled: true,
      plan_id: "cnpj-store-pro",
      price_cents: 14990,
    });
  });

  it("FORA do limite (10/10): publish_free desabilitado, mas subscribe_* convidam ao upgrade", async () => {
    account.countActiveAdsByUser.mockResolvedValue(10);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "publish_free").enabled).toBe(false);
    expect(findAction(r, "subscribe_start").enabled).toBe(true);
    expect(findAction(r, "subscribe_pro").enabled).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// CNPJ NÃO verificado
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — CNPJ não verificado", () => {
  it("publish_free desabilitado com motivo claro; subscribe_* NÃO aparecem (não pode contratar até verificar)", async () => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: false,
      document_verified: false,
    });
    account.resolveCurrentPlan.mockResolvedValue(null);
    account.countActiveAdsByUser.mockResolvedValue(0);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "publish_free").enabled).toBe(false);
    expect(findAction(r, "publish_free").reason).toMatch(/CNPJ.*verificado/i);
    expect(findAction(r, "subscribe_start")).toBeNull();
    expect(findAction(r, "subscribe_pro")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Start ativo
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — Start ativo", () => {
  beforeEach(() => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_START);
    db.query.mockResolvedValue({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-start", status: "active", created_at: "2026-04-01" }],
    });
  });

  it("publish_with_subscription habilitado, subscribe_start NÃO aparece (já assinante)", async () => {
    account.countActiveAdsByUser.mockResolvedValue(5);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "publish_with_subscription")).toMatchObject({
      enabled: true,
      plan_id: "cnpj-store-start",
      subscription_status: "active",
    });
    expect(findAction(r, "subscribe_start")).toBeNull();
    expect(findAction(r, "publish_free")).toBeNull();
  });

  it("upgrade_to_pro aparece como placeholder (enabled=false enquanto não há fluxo direto)", async () => {
    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "upgrade_to_pro")).toMatchObject({
      enabled: false,
      plan_id: "cnpj-store-pro",
    });
    expect(findAction(r, "upgrade_to_pro").reason).toMatch(/cancele.*Start/i);
  });

  it("active_subscription é exposto no payload", async () => {
    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(r.active_subscription).toEqual({
      plan_id: "cnpj-store-start",
      status: "active",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pro ativo
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — Pro ativo", () => {
  beforeEach(() => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_PRO);
    db.query.mockResolvedValue({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-pro", status: "active", created_at: "2026-04-01" }],
    });
    account.countActiveAdsByUser.mockResolvedValue(50);
  });

  it("publish_with_subscription habilitado, NENHUM subscribe nem upgrade aparece", async () => {
    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "publish_with_subscription").enabled).toBe(true);
    expect(findAction(r, "subscribe_start")).toBeNull();
    expect(findAction(r, "subscribe_pro")).toBeNull();
    expect(findAction(r, "upgrade_to_pro")).toBeNull();
    expect(findAction(r, "publish_free")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Subscription pending — bloqueia duplicata mesmo antes de active
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — sub pending (aguardando autorização MP)", () => {
  it("NÃO oferece subscribe_* duplicado mesmo se pending", async () => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CNPJ);
    db.query.mockResolvedValue({
      rows: [{ user_id: "u1", plan_id: "cnpj-store-start", status: "pending", created_at: "2026-04-01" }],
    });
    account.countActiveAdsByUser.mockResolvedValue(0);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "subscribe_start")).toBeNull();
    expect(findAction(r, "subscribe_pro")).toBeNull();
    // Sub pending é exposta no payload
    expect(r.active_subscription).toEqual({
      plan_id: "cnpj-store-start",
      status: "pending",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Boost 7d sempre presente, com defesa de preço fixo
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — Boost 7 dias", () => {
  beforeEach(() => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CPF",
      cnpj_verified: false,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CPF);
  });

  it("price_cents = 3990 fixo (NÃO vem do client) — válido pra CPF e CNPJ", async () => {
    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "boost_7d")).toMatchObject({
      enabled: true,
      ad_id: "ad-1",
      price_cents: 3990,
      days: 7,
      already_active: false,
    });
  });

  it("já_active=true quando highlight_until > NOW() (alerta pra prorrogação)", async () => {
    const futureIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    account.getOwnedAd.mockResolvedValue({ ...AD_ACTIVE, highlight_until: futureIso });

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    const boost = findAction(r, "boost_7d");
    expect(boost.already_active).toBe(true);
    expect(boost.note).toMatch(/prorroga/i);
    expect(r.ad.highlight_active).toBe(true);
  });

  it("Boost disponível para CNPJ também (não é exclusivo de CPF)", async () => {
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CNPJ);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "boost_7d")).toMatchObject({ enabled: true, price_cents: 3990 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Defesa: preço SEMPRE no backend (nenhuma action expõe interface
// que aceite preço do client)
// ─────────────────────────────────────────────────────────────────────

describe("publication-options — defesa contra spoof de preço", () => {
  it("getPublicationOptions NÃO aceita params de preço (sem amount/price/cents na assinatura)", async () => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CPF",
      cnpj_verified: false,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CPF);

    // Mesmo passando "amount" / "price" como opção, o service ignora
    // (não há essas propriedades no contrato).
    const r = await getPublicationOptions({
      userId: "u1",
      adId: "ad-1",
      // @ts-expect-error — defesa em runtime contra refactor futuro:
      amount: 1,
      price: 1,
      price_cents: 1,
    });

    // Boost continua R$ 39,90
    expect(findAction(r, "boost_7d").price_cents).toBe(3990);
  });

  it("price_cents fixos em todas as 3 ações comerciais (boost/start/pro)", async () => {
    account.getOwnedAd.mockResolvedValue(AD_ACTIVE);
    account.getAccountUser.mockResolvedValue({
      id: "u1",
      type: "CNPJ",
      cnpj_verified: true,
      document_verified: true,
    });
    account.resolveCurrentPlan.mockResolvedValue(PLAN_FREE_CNPJ);
    account.countActiveAdsByUser.mockResolvedValue(0);

    const r = await getPublicationOptions({ userId: "u1", adId: "ad-1" });
    expect(findAction(r, "boost_7d").price_cents).toBe(3990);
    expect(findAction(r, "subscribe_start").price_cents).toBe(7990);
    expect(findAction(r, "subscribe_pro").price_cents).toBe(14990);
  });
});
