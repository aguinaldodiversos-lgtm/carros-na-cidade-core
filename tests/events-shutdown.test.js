import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks pesados antes de importar account.service.js
vi.mock("../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  withUserTransaction: vi.fn(),
  query: vi.fn(),
  withTransaction: vi.fn(),
}));
vi.mock("../src/shared/middlewares/error.middleware.js", () => ({
  AppError: class AppError extends Error {
    constructor(message, statusCode = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));
vi.mock("../src/shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../src/shared/domainLog.js", () => ({
  buildDomainFields: () => ({}),
}));
vi.mock("../src/modules/ads/ads.repository.js", () => ({}));
vi.mock("../src/modules/account/account.user.read.js", () => ({
  getAccountUser: vi.fn(),
}));

const { pool } = await import("../src/infrastructure/database/db.js");

const FAKE_PLANS = [
  {
    id: "cpf-free-essential",
    type: "CPF",
    is_active: true,
    price: 0,
    billing_model: "free",
    name: "Plano Gratuito",
    benefits: [],
  },
  {
    id: "cnpj-store-pro",
    type: "CNPJ",
    is_active: true,
    price: 599.9,
    billing_model: "monthly",
    name: "Plano Loja Pro",
    benefits: [],
  },
  {
    id: "cnpj-evento-premium",
    type: "CNPJ",
    is_active: true,
    price: 999.9,
    billing_model: "monthly",
    name: "Plano Evento Premium",
    benefits: [],
  },
];

const ALL_EVENT_KEYS = [
  "EVENTS_ENABLED",
  "EVENTS_PUBLIC_ENABLED",
  "EVENTS_PAYMENTS_ENABLED",
];
let savedEnv = {};

beforeEach(() => {
  vi.resetModules();
  savedEnv = {};
  for (const k of ALL_EVENT_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  pool.query.mockReset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadAccountService() {
  return await import("../src/modules/account/account.service.js");
}

describe("listPlans — filtro de cnpj-evento-premium (Events shutdown)", () => {
  it("EVENTS_PUBLIC_ENABLED ausente → cnpj-evento-premium NÃO aparece em /planos", async () => {
    pool.query.mockResolvedValueOnce({ rows: FAKE_PLANS });
    const { listPlans } = await loadAccountService();

    const plans = await listPlans({ type: "CNPJ" });
    const ids = plans.map((p) => p.id);
    expect(ids).not.toContain("cnpj-evento-premium");
    expect(ids).toContain("cnpj-store-pro");
  });

  it("EVENTS_PUBLIC_ENABLED='true' E EVENTS_ENABLED='true' → cnpj-evento-premium aparece", async () => {
    process.env.EVENTS_ENABLED = "true";
    process.env.EVENTS_PUBLIC_ENABLED = "true";
    pool.query.mockResolvedValueOnce({ rows: FAKE_PLANS });
    const { listPlans } = await loadAccountService();

    const plans = await listPlans({ type: "CNPJ" });
    expect(plans.map((p) => p.id)).toContain("cnpj-evento-premium");
  });

  it("EVENTS_PUBLIC_ENABLED='TRUE' (uppercase) → cnpj-evento-premium continua oculto (strict)", async () => {
    process.env.EVENTS_ENABLED = "TRUE";
    process.env.EVENTS_PUBLIC_ENABLED = "TRUE";
    pool.query.mockResolvedValueOnce({ rows: FAKE_PLANS });
    const { listPlans } = await loadAccountService();

    const plans = await listPlans({ type: "CNPJ" });
    expect(plans.map((p) => p.id)).not.toContain("cnpj-evento-premium");
  });

  it("EVENTS_PUBLIC_ENABLED=true mas EVENTS_ENABLED ausente (master off) → continua oculto", async () => {
    process.env.EVENTS_PUBLIC_ENABLED = "true";
    pool.query.mockResolvedValueOnce({ rows: FAKE_PLANS });
    const { listPlans } = await loadAccountService();

    const plans = await listPlans({ type: "CNPJ" });
    expect(plans.map((p) => p.id)).not.toContain("cnpj-evento-premium");
  });

  it("planos não-evento (CPF gratuito, CNPJ Pro) sempre passam", async () => {
    pool.query.mockResolvedValueOnce({ rows: FAKE_PLANS });
    const { listPlans } = await loadAccountService();

    const plans = await listPlans({});
    const ids = plans.map((p) => p.id);
    expect(ids).toContain("cpf-free-essential");
    expect(ids).toContain("cnpj-store-pro");
  });
});

describe("isEventPlanId — helper puro", () => {
  it("identifica cnpj-evento-premium como plano de evento", async () => {
    const { isEventPlanId } = await loadAccountService();
    expect(isEventPlanId("cnpj-evento-premium")).toBe(true);
  });

  it("não considera planos de loja como evento", async () => {
    const { isEventPlanId } = await loadAccountService();
    expect(isEventPlanId("cnpj-store-pro")).toBe(false);
    expect(isEventPlanId("cnpj-store-start")).toBe(false);
    expect(isEventPlanId("cpf-free-essential")).toBe(false);
    expect(isEventPlanId("cpf-premium-highlight")).toBe(false);
  });

  it("tolera espaços, uppercase e null", async () => {
    const { isEventPlanId } = await loadAccountService();
    expect(isEventPlanId("  CNPJ-Evento-Premium  ")).toBe(true);
    expect(isEventPlanId(null)).toBe(false);
    expect(isEventPlanId(undefined)).toBe(false);
    expect(isEventPlanId("")).toBe(false);
  });
});
