import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";

/**
 * Resiliência do webhook + resolução da URL pública do backend.
 *
 * Cobre dois fixes:
 *   1) 404 do Mercado Pago (pagamento inexistente) é IGNORADO com 200 — nunca
 *      propaga como 5xx. Outros status (ex.: 500) continuam fatais.
 *   2) getBackendPublicUrl() prioriza vars de BACKEND e NUNCA usa APP_BASE_URL
 *      (que é o domínio do frontend) — exposta via getMercadoPagoBackendPublicUrl().
 *
 * MP_ACCESS_TOKEN é definido ANTES do import para forçar o caminho real
 * (fetchPaymentStatus → mpRequest → fetch). MP_WEBHOOK_SECRET fica ausente para
 * que verifyWebhookSignature aceite a notificação (foco aqui não é assinatura).
 */

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

const URL_ENV_KEYS = [
  "MP_WEBHOOK_BASE_URL",
  "RENDER_EXTERNAL_URL",
  "BACKEND_API_URL",
  "API_URL",
  "NEXT_PUBLIC_API_URL",
  "APP_BASE_URL",
];

let handleWebhookNotification;
let getMercadoPagoBackendPublicUrl;
let savedEnv;

beforeAll(async () => {
  process.env.MP_ACCESS_TOKEN = "TEST-token-resilience";
  delete process.env.MP_WEBHOOK_SECRET;
  ({ handleWebhookNotification, getMercadoPagoBackendPublicUrl } = await import(
    "../../src/modules/payments/payments.service.js"
  ));
});

beforeEach(() => {
  savedEnv = {};
  for (const k of URL_ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of URL_ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────
// Fix 1 — 404 do MP não derruba o webhook
// ─────────────────────────────────────────────────────────────────────
describe("handleWebhookNotification — 404 do Mercado Pago é ignorável", () => {
  function mockFetch(status, body) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
        json: async () => JSON.parse(body),
      })
    );
  }

  it("pagamento inexistente (404) → retorna {ok:true, ignored:true} sem lançar", async () => {
    mockFetch(404, '{"message":"Payment not found"}');

    const result = await handleWebhookNotification({
      rawBody: JSON.stringify({ type: "payment", data: { id: "123456" } }),
      signature: null,
      requestId: null,
      dataId: "123456",
      traceRequestId: "trace-1",
    });

    expect(result).toEqual({ ok: true, ignored: true, reason: "payment_not_found" });
  });

  it("erro real do MP (500) continua propagando como exceção", async () => {
    mockFetch(500, '{"message":"internal error"}');

    await expect(
      handleWebhookNotification({
        rawBody: JSON.stringify({ type: "payment", data: { id: "999" } }),
        signature: null,
        requestId: null,
        dataId: "999",
        traceRequestId: "trace-2",
      })
    ).rejects.toMatchObject({ statusCode: 502 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Fix 2 — precedência da URL pública do backend
// ─────────────────────────────────────────────────────────────────────
describe("getBackendPublicUrl — precedência sem APP_BASE_URL", () => {
  it("IGNORA APP_BASE_URL (domínio do frontend) e usa RENDER_EXTERNAL_URL", () => {
    process.env.APP_BASE_URL = "https://carrosnacidade.com"; // frontend — não pode vencer
    process.env.RENDER_EXTERNAL_URL = "https://carros-na-cidade-core.onrender.com";

    expect(getMercadoPagoBackendPublicUrl()).toBe("https://carros-na-cidade-core.onrender.com");
  });

  it("MP_WEBHOOK_BASE_URL tem prioridade máxima (override explícito)", () => {
    process.env.MP_WEBHOOK_BASE_URL = "https://webhook.custom.dev";
    process.env.RENDER_EXTERNAL_URL = "https://carros-na-cidade-core.onrender.com";
    process.env.APP_BASE_URL = "https://carrosnacidade.com";

    expect(getMercadoPagoBackendPublicUrl()).toBe("https://webhook.custom.dev");
  });

  it("cai para BACKEND_API_URL quando não há override nem RENDER_EXTERNAL_URL", () => {
    process.env.APP_BASE_URL = "https://carrosnacidade.com";
    process.env.BACKEND_API_URL = "https://backend.interno";

    expect(getMercadoPagoBackendPublicUrl()).toBe("https://backend.interno");
  });

  it("remove a barra final (sem // duplicado ao concatenar o path)", () => {
    process.env.RENDER_EXTERNAL_URL = "https://carros-na-cidade-core.onrender.com/";

    expect(getMercadoPagoBackendPublicUrl()).toBe("https://carros-na-cidade-core.onrender.com");
  });

  it("lança 500 quando nenhuma var de backend está definida", () => {
    expect(() => getMercadoPagoBackendPublicUrl()).toThrow(/URL pública do backend/i);
  });
});
