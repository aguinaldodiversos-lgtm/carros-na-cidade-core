import crypto from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * Regressão da verificação de assinatura HMAC do webhook Mercado Pago.
 *
 * Trava o algoritmo contra o bug histórico (corrigido nesta task): o
 * manifesto deve ser EXATAMENTE `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * com `data.id` em lowercase e SEM o corpo da requisição no HMAC. Qualquer
 * regressão que volte a usar o `x-request-id` no campo `id:` ou que reanexe o
 * corpo ao HMAC quebra o caso "válido" abaixo.
 *
 * O segredo é lido de process.env.MP_WEBHOOK_SECRET no load do módulo —
 * por isso ele é definido ANTES do import dinâmico.
 */

// Mock de infra: verifyWebhookSignature é função pura, não toca o banco.
import { vi } from "vitest";
vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: { query: vi.fn() },
}));

const WEBHOOK_SECRET = "test_webhook_secret_abc123";

let verifyWebhookSignature;

beforeAll(async () => {
  process.env.MP_WEBHOOK_SECRET = WEBHOOK_SECRET;
  ({ verifyWebhookSignature } = await import("../../src/modules/payments/payments.service.js"));
});

// Helpers — recriam a assinatura conforme a SPEC OFICIAL do MP, de forma
// independente da implementação (manifesto montado explicitamente aqui).
function signManifest({ dataId, requestId, ts, secret = WEBHOOK_SECRET, includeBody, rawBody }) {
  const id = String(dataId).toLowerCase();
  let manifest = `id:${id};request-id:${requestId};ts:${ts};`;
  if (includeBody) manifest += rawBody || ""; // simula o bug antigo
  return crypto.createHmac("sha256", secret).update(manifest).digest("hex");
}

function header(ts, v1) {
  return `ts=${ts}, v1=${v1}`;
}

describe("verifyWebhookSignature — caso válido", () => {
  it("aceita assinatura calculada conforme a spec do MP (data.id + sem corpo)", () => {
    const dataId = "123456789";
    const requestId = "req-id-0001";
    const ts = "1700000000";
    const v1 = signManifest({ dataId, requestId, ts });

    expect(verifyWebhookSignature(header(ts, v1), requestId, dataId)).toBe(true);
  });

  it("trata data.id alfanumérico como lowercase (regra da spec)", () => {
    const dataId = "ABC123DEF"; // payer manda maiúsculo
    const requestId = "req-id-0002";
    const ts = "1700000123";
    // assinatura calculada sobre o lowercase, como o MP faz
    const v1 = signManifest({ dataId, requestId, ts });

    expect(verifyWebhookSignature(header(ts, v1), requestId, dataId)).toBe(true);
  });
});

describe("verifyWebhookSignature — casos inválidos", () => {
  it("rejeita v1 adulterado", () => {
    const dataId = "123456789";
    const requestId = "req-id-0003";
    const ts = "1700000000";
    const tampered = "deadbeef".repeat(8); // 64 hex chars, valor errado

    expect(verifyWebhookSignature(header(ts, tampered), requestId, dataId)).toBe(false);
  });

  it("rejeita assinatura no formato ANTIGO (id=request-id + corpo no HMAC)", () => {
    // Reproduz o bug corrigido: manifesto usando request-id no campo id E
    // com o corpo anexado. Deve falhar — trava contra a regressão.
    const dataId = "123456789";
    const requestId = "req-id-0004";
    const ts = "1700000000";
    const rawBody = JSON.stringify({ type: "payment", data: { id: dataId } });
    const buggy = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(`id:${requestId};request-id:${requestId};ts:${ts};` + rawBody)
      .digest("hex");

    expect(verifyWebhookSignature(header(ts, buggy), requestId, dataId)).toBe(false);
  });

  it("rejeita quando data.id está ausente", () => {
    const requestId = "req-id-0005";
    const ts = "1700000000";
    const v1 = signManifest({ dataId: "123456789", requestId, ts });

    expect(verifyWebhookSignature(header(ts, v1), requestId, null)).toBe(false);
  });

  it("rejeita quando o header x-request-id está ausente", () => {
    const dataId = "123456789";
    const ts = "1700000000";
    const v1 = signManifest({ dataId, requestId: "req-id-0006", ts });

    expect(verifyWebhookSignature(header(ts, v1), null, dataId)).toBe(false);
  });

  it("rejeita header de assinatura sem ts/v1", () => {
    expect(verifyWebhookSignature("garbage-header", "req-id-0007", "123456789")).toBe(false);
  });

  it("rejeita assinatura assinada com OUTRO segredo", () => {
    const dataId = "123456789";
    const requestId = "req-id-0008";
    const ts = "1700000000";
    const v1 = signManifest({ dataId, requestId, ts, secret: "segredo-do-atacante" });

    expect(verifyWebhookSignature(header(ts, v1), requestId, dataId)).toBe(false);
  });
});
