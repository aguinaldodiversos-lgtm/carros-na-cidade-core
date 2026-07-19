import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocks ANTES de importar o módulo sob teste (vi.mock é hoisted). Isolamos o
// banco e as dependências de fila/log para testar só a lógica de registro.
vi.mock("../../infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
}));

vi.mock("../../queues/whatsapp.queue.js", () => ({
  addWhatsAppJob: vi.fn(),
}));

vi.mock("../../shared/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { pool } = await import("../../infrastructure/database/db.js");
const { addWhatsAppJob } = await import("../../queues/whatsapp.queue.js");
const { recordWhatsappLead } = await import("./leads.service.js");

/**
 * `recordWhatsappLead`: registro de "lead enviado" no clique de WhatsApp, sem
 * PII. Contrato travado aqui:
 *   - Grava UMA linha em `leads` com `source='whatsapp'`, sem nome/telefone.
 *   - NÃO enfileira notificação WhatsApp ao lojista (o visitante já contatou).
 *   - adId inválido → 400 sem tocar no banco.
 *   - anúncio inexistente/inativo/sem vendedor (rowCount 0) → registered:false.
 */

beforeEach(() => {
  pool.query.mockReset();
  addWhatsAppJob.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordWhatsappLead", () => {
  it("insere um lead com source='whatsapp' e sem PII, sem notificar o lojista", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 555 }] });

    const result = await recordWhatsappLead({ adId: 42 });

    expect(result).toEqual({ registered: true });
    expect(pool.query).toHaveBeenCalledTimes(1);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO leads/i);
    expect(sql).toMatch(/'whatsapp'/);
    // sem buyer_name/buyer_phone na lista de colunas inseridas
    expect(sql).not.toMatch(/buyer_name/);
    expect(params).toEqual([42]);

    // fire-and-forget do lado do lojista continua desligado
    expect(addWhatsAppJob).not.toHaveBeenCalled();
  });

  it("retorna registered:false quando o anúncio não casa (inativo/sem vendedor)", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await recordWhatsappLead({ adId: 42 });

    expect(result).toEqual({ registered: false });
  });

  it("normaliza adId em string numérica", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 1 }] });

    await recordWhatsappLead({ adId: "42" });

    expect(pool.query.mock.calls[0][1]).toEqual([42]);
  });

  it("lança 400 para adId inválido sem tocar no banco", async () => {
    await expect(recordWhatsappLead({ adId: "abc" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(recordWhatsappLead({})).rejects.toMatchObject({ statusCode: 400 });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("propaga erro de banco como AppError 500", async () => {
    pool.query.mockRejectedValueOnce(new Error("db caiu"));

    await expect(recordWhatsappLead({ adId: 42 })).rejects.toMatchObject({ statusCode: 500 });
  });
});
