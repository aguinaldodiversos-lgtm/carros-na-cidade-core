import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../src/infrastructure/database/db.js", () => ({
  query,
  default: { query },
  pool: { query },
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: (req, _res, next) => {
    req.user = { id: "20", role: "user", account_type: "CNPJ" };
    next();
  },
}));
vi.mock("../../src/shared/middlewares/dealer.middleware.js", () => ({
  requireDealerAccount: () => (_req, _res, next) => next(),
}));

const { createSaleOffer, offerInspectionSlots, listSaleOpportunities } = vi.hoisted(() => ({
  createSaleOffer: vi.fn((_req, res) => res.status(201).json({ ok: true })),
  offerInspectionSlots: vi.fn((_req, res) => res.status(201).json({ ok: true })),
  listSaleOpportunities: vi.fn((_req, res) => res.json({ ok: true })),
}));

const { getDealerSaleOpportunity } = vi.hoisted(() => ({ getDealerSaleOpportunity: vi.fn() }));
vi.mock("../../src/modules/sale-requests/sale-requests.dealer.service.js", () => ({
  getDealerSaleOpportunity,
}));

vi.mock("../../src/modules/sale-requests/sale-requests.dealer.controller.js", () => ({
  createSaleOffer,
  offerInspectionSlots,
  listSaleOpportunities,
  getSaleOpportunity: vi.fn((_req, res) => res.json({ ok: true })),
  completeInspection: vi.fn((_req, res) => res.json({ ok: true })),
  submitPostInspectionDecision: vi.fn((_req, res) => res.json({ ok: true })),
}));

const { default: dealerRoutes } = await import(
  "../../src/modules/sale-requests/sale-requests.dealer.routes.js"
);
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/dealer", dealerRoutes);
app.use(errorHandler);

beforeEach(() => {
  delete process.env.OPPORTUNITIES_PAID_GATE_ENABLED;
  query.mockReset();
  createSaleOffer.mockClear();
  offerInspectionSlots.mockClear();
  listSaleOpportunities.mockClear();
  getDealerSaleOpportunity.mockReset();
});

afterEach(() => {
  delete process.env.OPPORTUNITIES_PAID_GATE_ENABLED;
});

describe("negociações preservadas ao mudar para modo pago", () => {
  it("mantém oportunidades e propostas liberadas durante o lançamento", async () => {
    expect((await request(app).get("/dealer")).status).toBe(200);
    expect((await request(app).post("/dealer/1/offers").send({ amount: 50000 })).status).toBe(201);
    expect(query).not.toHaveBeenCalled();
  });

  it("bloqueia nova proposta sem assinatura, mas mantém a etapa de inspeção", async () => {
    process.env.OPPORTUNITIES_PAID_GATE_ENABLED = "true";
    query.mockResolvedValue({ rows: [] });
    expect((await request(app).get("/dealer")).status).toBe(403);
    const proposal = await request(app).post("/dealer/1/offers").send({ amount: 50000 });
    expect(proposal.status).toBe(403);
    expect(createSaleOffer).not.toHaveBeenCalled();

    // A posse da loja SELECIONADA é verificada no serviço real,
    // que já possui testes próprios. A rota não pode impor plano novo.
    const inspection = await request(app)
      .post("/dealer/1/inspection/slots")
      .send({ slots: ["2026-11-01T14:00:00"] });
    expect(inspection.status).toBe(201);
    expect(offerInspectionSlots).toHaveBeenCalledTimes(1);
  });

  it("Start mantém acesso a novos veículos em avaliação", async () => {
    process.env.OPPORTUNITIES_PAID_GATE_ENABLED = "true";
    query.mockResolvedValue({ rows: [{ plan_id: "cnpj-store-start" }] });
    expect((await request(app).get("/dealer")).status).toBe(200);
    expect((await request(app).post("/dealer/1/offers").send({ amount: 50000 })).status).toBe(201);
  });
});

describe("detalhe de avaliação já selecionada", () => {
  beforeEach(() => {
    process.env.OPPORTUNITIES_PAID_GATE_ENABLED = "true";
    query.mockResolvedValue({ rows: [] });
  });

  it("permite que a loja escolhida consulte o andamento sem assinatura ativa", async () => {
    getDealerSaleOpportunity.mockResolvedValueOnce({
      sale_opportunity: { id: 1, is_selected: true, status: "offer_selected" },
    });
    const result = await request(app).get("/dealer/1");
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("private, no-store");
    expect(result.body.sale_opportunity.is_selected).toBe(true);
    expect(getDealerSaleOpportunity).toHaveBeenCalledWith("20", "1", {});
  });

  it("impede acesso a ficha não selecionada de loja sem plano", async () => {
    getDealerSaleOpportunity.mockResolvedValueOnce({
      sale_opportunity: { id: 1, is_selected: false, status: "receiving_offers" },
    });
    const result = await request(app).get("/dealer/1");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ success: false, error: "not_found" });
    expect(result.headers["cache-control"]).toBe("private, no-store");
  });

  it("não altera o 404 emitido pela consulta escopada à loja e cidade", async () => {
    const error = new Error("Oportunidade não encontrada.");
    Object.assign(error, { statusCode: 404, isOperational: true });
    getDealerSaleOpportunity.mockRejectedValueOnce(error);
    const result = await request(app).get("/dealer/999");
    expect(result.status).toBe(404);
    expect(result.body).not.toHaveProperty("sale_opportunity");
  });
});
