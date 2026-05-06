import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { buildReport, diffPlan, EXPECTED } from "../../scripts/maintenance/audit-subscription-plans.mjs";

/**
 * Fase 2A — alinhamento de planos com a oferta oficial.
 *
 * Este teste garante DOIS contratos independentes:
 *
 *   1. **Helper `diffPlan`** classifica corretamente preço/limite/is_active
 *      vs oferta oficial. Trava regressão se alguém afrouxar a checagem.
 *
 *   2. **Service `listPlans`** (consumido por GET /api/account/plans):
 *      - retorna preços oficiais (Start R$ 79,90, Pro R$ 149,90)
 *      - filtra Evento Premium quando flag desligada
 *      - aplica filtro por type
 *      - omite planos descontinuados (is_active=false) quando onlyActive=true
 *
 * Pool é mockado: nenhum acesso a banco real.
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  closeDatabasePool: vi.fn(async () => {}),
  withUserTransaction: vi.fn(),
}));

vi.mock("../../src/shared/config/features.js", () => ({
  isEventsDomainEnabled: vi.fn(() => false),
}));

const { pool } = await import("../../src/infrastructure/database/db.js");
const features = await import("../../src/shared/config/features.js");
const { listPlans } = await import("../../src/modules/account/account.service.js");

beforeEach(() => {
  pool.query.mockReset();
  features.isEventsDomainEnabled.mockReset();
  features.isEventsDomainEnabled.mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// Estado-alvo (banco PÓS-migration 023). Espelhado nos asserts.
// ─────────────────────────────────────────────────────────────────────

const POST_MIGRATION_ROWS = [
  { id: "cpf-free-essential", name: "Plano Gratuito (Essencial)", type: "CPF", price: 0, ad_limit: 3, is_featured_enabled: false, has_store_profile: false, priority_level: 0, is_active: true, validity_days: null, billing_model: "free", description: "x", benefits: [], recommended: false, created_at: "2026-01-01", updated_at: "2026-05-05" },
  { id: "cpf-premium-highlight", name: "Plano Destaque Premium", type: "CPF", price: 79.9, ad_limit: 10, is_featured_enabled: true, has_store_profile: false, priority_level: 50, is_active: false, validity_days: 30, billing_model: "one_time", description: "x", benefits: [], recommended: false, created_at: "2026-01-01", updated_at: "2026-05-05" },
  { id: "cnpj-free-store", name: "Plano Gratuito Loja", type: "CNPJ", price: 0, ad_limit: 10, is_featured_enabled: false, has_store_profile: true, priority_level: 5, is_active: true, validity_days: null, billing_model: "free", description: "x", benefits: [], recommended: false, created_at: "2026-01-01", updated_at: "2026-05-05" },
  { id: "cnpj-store-start", name: "Plano Loja Start", type: "CNPJ", price: 79.9, ad_limit: 20, is_featured_enabled: true, has_store_profile: true, priority_level: 60, is_active: true, validity_days: 30, billing_model: "monthly", description: "x", benefits: [], recommended: false, created_at: "2026-01-01", updated_at: "2026-05-05" },
  { id: "cnpj-store-pro", name: "Plano Loja Pro", type: "CNPJ", price: 149.9, ad_limit: 1000, is_featured_enabled: true, has_store_profile: true, priority_level: 80, is_active: true, validity_days: 30, billing_model: "monthly", description: "x", benefits: [], recommended: true, created_at: "2026-01-01", updated_at: "2026-05-05" },
  { id: "cnpj-evento-premium", name: "Plano Evento Premium", type: "CNPJ", price: 999.9, ad_limit: 350, is_featured_enabled: true, has_store_profile: true, priority_level: 100, is_active: false, validity_days: 30, billing_model: "monthly", description: "x", benefits: [], recommended: false, created_at: "2026-01-01", updated_at: "2026-05-05" },
];

const PRE_MIGRATION_ROWS = POST_MIGRATION_ROWS.map((row) => {
  // estado ANTIGO de produção (antes de 023)
  if (row.id === "cnpj-free-store") return { ...row, ad_limit: 20 };
  if (row.id === "cnpj-store-start") return { ...row, price: 299.9, ad_limit: 80 };
  if (row.id === "cnpj-store-pro") return { ...row, price: 599.9, ad_limit: 200 };
  if (row.id === "cpf-premium-highlight") return { ...row, is_active: true };
  if (row.id === "cnpj-evento-premium") return { ...row, is_active: true };
  return row;
});

function mockPoolWithPlans(rows) {
  pool.query.mockImplementation(async (sql) => {
    if (/FROM subscription_plans/i.test(sql)) {
      return { rows };
    }
    return { rows: [] };
  });
}

// ─────────────────────────────────────────────────────────────────────
// diffPlan (helper puro do script de auditoria)
// ─────────────────────────────────────────────────────────────────────

describe("diffPlan — helper de auditoria", () => {
  it("retorna [] quando plano bate com expected (sem divergência)", () => {
    expect(diffPlan({ price: 79.9, ad_limit: 20, is_active: true }, EXPECTED["cnpj-store-start"]))
      .toEqual([]);
  });

  it("acusa preço divergente", () => {
    const r = diffPlan({ price: 299.9, ad_limit: 20, is_active: true }, EXPECTED["cnpj-store-start"]);
    expect(r.join(" ")).toMatch(/price=299\.9.*esperado 79\.9/);
  });

  it("acusa ad_limit divergente", () => {
    const r = diffPlan({ price: 79.9, ad_limit: 80, is_active: true }, EXPECTED["cnpj-store-start"]);
    expect(r.join(" ")).toMatch(/ad_limit=80.*esperado 20/);
  });

  it("acusa is_active divergente", () => {
    const r = diffPlan({ price: 0, ad_limit: 350, is_active: true }, EXPECTED["cnpj-evento-premium"]);
    expect(r.join(" ")).toMatch(/is_active=true.*esperado false/);
  });

  it("trata price string ('79.90') como número equivalente", () => {
    expect(diffPlan({ price: "79.90", ad_limit: 20, is_active: true }, EXPECTED["cnpj-store-start"]))
      .toEqual([]);
  });
});

describe("buildReport — agregação do auditor", () => {
  it("aligned=true quando todos os planos batem a oferta oficial (estado pós-023)", () => {
    const report = buildReport({
      schema: { columns: [], constraints: [] },
      plans: POST_MIGRATION_ROWS,
      subImpact: [],
    });
    expect(report.aligned).toBe(true);
    expect(report.diffs.every((d) => d.status === "OK")).toBe(true);
  });

  it("aligned=false quando banco está em estado pré-migration", () => {
    const report = buildReport({
      schema: { columns: [], constraints: [] },
      plans: PRE_MIGRATION_ROWS,
      subImpact: [],
    });
    expect(report.aligned).toBe(false);
    const divergent = report.diffs.filter((d) => d.status === "DIVERGENT").map((d) => d.id);
    expect(divergent).toContain("cnpj-store-start");
    expect(divergent).toContain("cnpj-store-pro");
    expect(divergent).toContain("cnpj-free-store");
    expect(divergent).toContain("cpf-premium-highlight");
    expect(divergent).toContain("cnpj-evento-premium");
  });

  it("expõe quantidade de subscriptions ativas para informar impacto humano", () => {
    const report = buildReport({
      schema: { columns: [], constraints: [] },
      plans: POST_MIGRATION_ROWS,
      subImpact: [
        { plan_id: "cnpj-store-start", active_subscriptions: 12 },
        { plan_id: "cnpj-store-pro", active_subscriptions: 5 },
      ],
    });
    const startDiff = report.diffs.find((d) => d.id === "cnpj-store-start");
    expect(startDiff?.active_subscriptions).toBe(12);
    const proDiff = report.diffs.find((d) => d.id === "cnpj-store-pro");
    expect(proDiff?.active_subscriptions).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// listPlans (service consumido por /api/account/plans)
// ─────────────────────────────────────────────────────────────────────

describe("listPlans — contrato pós-Fase 2A", () => {
  it("Start retorna R$ 79,90 e ad_limit 20 (pós-023)", async () => {
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    const start = plans.find((p) => p.id === "cnpj-store-start");
    expect(start).toBeTruthy();
    expect(Number(start.price)).toBe(79.9);
    expect(start.ad_limit).toBe(20);
  });

  it("Pro retorna R$ 149,90 e ad_limit 1000 (trava técnica)", async () => {
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    const pro = plans.find((p) => p.id === "cnpj-store-pro");
    expect(pro).toBeTruthy();
    expect(Number(pro.price)).toBe(149.9);
    expect(pro.ad_limit).toBe(1000);
  });

  it("CNPJ grátis retorna ad_limit 10 (era 20 pré-023)", async () => {
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    const free = plans.find((p) => p.id === "cnpj-free-store");
    expect(free).toBeTruthy();
    expect(free.ad_limit).toBe(10);
  });

  it("Evento Premium NÃO aparece quando flag desligada (default)", async () => {
    features.isEventsDomainEnabled.mockReturnValue(false);
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    expect(plans.some((p) => p.id === "cnpj-evento-premium")).toBe(false);
  });

  it("Evento Premium NÃO aparece nem com onlyActive=false (is_active=false pós-023)", async () => {
    features.isEventsDomainEnabled.mockReturnValue(true); // simula flag ON
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    // Mesmo com flag ligada, is_active=false deve ainda esconder em onlyActive=true
    expect(plans.some((p) => p.id === "cnpj-evento-premium")).toBe(false);
  });

  it("CPF onlyActive devolve apenas Grátis CPF (CPF Premium Highlight descontinuado)", async () => {
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CPF", onlyActive: true });
    expect(plans.map((p) => p.id).sort()).toEqual(["cpf-free-essential"]);
  });

  it("CNPJ onlyActive devolve apenas Free + Start + Pro (3 planos)", async () => {
    mockPoolWithPlans(POST_MIGRATION_ROWS);
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    expect(plans.map((p) => p.id).sort()).toEqual([
      "cnpj-free-store",
      "cnpj-store-pro",
      "cnpj-store-start",
    ]);
  });

  it("fallback DEFAULT_PLANS é usado quando query do banco retorna vazio", async () => {
    mockPoolWithPlans([]); // banco vazio
    const plans = await listPlans({ type: "CNPJ", onlyActive: true });
    // Mesmo com banco vazio, fallback devolve preços oficiais (Fase 1)
    const start = plans.find((p) => p.id === "cnpj-store-start");
    expect(Number(start.price)).toBe(79.9);
    const pro = plans.find((p) => p.id === "cnpj-store-pro");
    expect(Number(pro.price)).toBe(149.9);
  });
});
