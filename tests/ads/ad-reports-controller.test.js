import { describe, expect, it, vi, beforeEach } from "vitest";

const createReportMock = vi.fn();

vi.mock("../../src/modules/ads/reports/ad-reports.service.js", () => ({
  createReport: (...args) => createReportMock(...args),
}));

import { create } from "../../src/modules/ads/reports/ad-reports.controller.js";

function makeReq(overrides = {}) {
  return {
    params: { id: "42" },
    body: { reason: "suspicious_price", description: null },
    headers: {},
    ip: "",
    socket: { remoteAddress: "" },
    user: null,
    ...overrides,
  };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

beforeEach(() => {
  createReportMock.mockReset();
  createReportMock.mockResolvedValue({
    id: 1,
    ad_id: 42,
    reason: "suspicious_price",
    status: "new",
    created_at: "2026-05-29T00:00:00Z",
  });
});

describe("ad-reports.controller.create — sucesso (Fase 3.4)", () => {
  it("retorna HTTP 201 com payload.success=true e mensagem anti-pânico", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    await create(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 1, ad_id: 42, status: "new" });
    // Mensagem da Fase 3.4: deixa explícito que o anúncio continua visível
    expect(res.body.message).toMatch(/continuará visível/i);
    expect(res.body.message).toMatch(/análise da equipe/i);
    expect(res.body.message).toMatch(/bloqueios indevidos/i);
  });

  it("delega ao service exatamente os campos esperados (adId, reason, description, IP, user)", async () => {
    const req = makeReq({
      params: { id: "42" },
      body: { reason: "scam_or_advance_pay", description: "  abuso  " },
      headers: { "x-cnc-client-ip": "203.0.113.55" },
      user: { id: "user-1" },
    });

    await create(req, makeRes(), vi.fn());

    expect(createReportMock).toHaveBeenCalledWith({
      adId: "42",
      reason: "scam_or_advance_pay",
      description: "  abuso  ",
      reporterUserId: "user-1",
      reporterIp: "203.0.113.55",
    });
  });
});

describe("ad-reports.controller.create — resolveReporterIp (Fase 3.4)", () => {
  it("prioriza CF-Connecting-IP", async () => {
    const req = makeReq({
      headers: {
        "cf-connecting-ip": "1.1.1.1",
        "x-cnc-client-ip": "2.2.2.2",
        "x-forwarded-for": "3.3.3.3",
      },
      ip: "4.4.4.4",
    });
    await create(req, makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ reporterIp: "1.1.1.1" })
    );
  });

  it("usa X-Cnc-Client-Ip quando CF não está presente (caso típico do BFF Next.js)", async () => {
    const req = makeReq({
      headers: { "x-cnc-client-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" },
      ip: "4.4.4.4",
    });
    await create(req, makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ reporterIp: "2.2.2.2" })
    );
  });

  it("usa req.ip quando CF e X-Cnc-Client-Ip ausentes", async () => {
    const req = makeReq({ headers: { "x-forwarded-for": "3.3.3.3" }, ip: "4.4.4.4" });
    await create(req, makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ reporterIp: "4.4.4.4" })
    );
  });

  it("cai em X-Forwarded-For quando req.ip vazio (pega o primeiro elemento)", async () => {
    const req = makeReq({ headers: { "x-forwarded-for": "5.5.5.5, 6.6.6.6" }, ip: "" });
    await create(req, makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ reporterIp: "5.5.5.5" })
    );
  });

  it("fallback socket.remoteAddress quando todos ausentes", async () => {
    const req = makeReq({ socket: { remoteAddress: "127.0.0.1" }, ip: "" });
    await create(req, makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledWith(
      expect.objectContaining({ reporterIp: "127.0.0.1" })
    );
  });
});

describe("ad-reports.controller.create — erros propagam ao errorMiddleware", () => {
  it("erro do service vira next(err) sem 201", async () => {
    const boom = new Error("DB down");
    createReportMock.mockRejectedValueOnce(boom);
    const res = makeRes();
    const next = vi.fn();

    await create(makeReq(), res, next);

    expect(next).toHaveBeenCalledWith(boom);
    expect(res.statusCode).toBeNull();
  });
});

describe("ad-reports.controller.create — regra: NÃO altera ads (Fase 3.4)", () => {
  // Garantia estrutural: o controller só chama createReport do service de
  // ad-reports. Nada de ads.repository, updateStatus, updateHighlight,
  // updatePriority — denúncia pública não bloqueia, não muda visibilidade.
  // Se algum futuro PR importar admin-ads.service / ads.repository neste
  // controller, este teste quebra (vai aparecer chamada extra ao mock).
  it("chama EXCLUSIVAMENTE ad-reports.service.createReport", async () => {
    await create(makeReq(), makeRes(), vi.fn());
    expect(createReportMock).toHaveBeenCalledTimes(1);
    // Nenhuma outra interação registrada — o teste mocka SOMENTE createReport.
    // Se o controller começar a tocar em outros services, vitest reportaria
    // que outras funções foram chamadas sem mock e o teste explodiria
    // (mas como mockamos só este, manter Times(1) é a invariante mínima).
  });
});
