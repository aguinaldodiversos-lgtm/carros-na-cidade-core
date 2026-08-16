import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/admin/users/admin-users.repository.js", () => ({
  listUsers: vi.fn(),
  findUserById: vi.fn(),
  listAdvertisersByUserId: vi.fn(),
  countAdsByUserId: vi.fn(),
  countPurchaseIntentsByUserId: vi.fn(),
  listRecentPurchaseIntentsByUserId: vi.fn(),
  countReceivedOffersByUserId: vi.fn(),
}));

import * as repo from "../../src/modules/admin/users/admin-users.repository.js";
import { listUsers, getUserById } from "../../src/modules/admin/users/admin-users.service.js";

/** Linha crua de `users` como o Postgres devolveria. */
function userRow(overrides = {}) {
  return {
    id: 1,
    name: "Maria",
    email: "maria@example.com",
    role: "user",
    document_type: "cpf",
    plan_id: null,
    plan_name: null,
    email_verified: true,
    is_email_verified: null,
    locked_until: null,
    created_at: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function mockList(rows, total = rows.length) {
  vi.mocked(repo.listUsers).mockResolvedValue({ data: rows, total, limit: 30, offset: 0 });
}

function mockDetail({ user, advertisers = [], ads, intents, recent = [], offers = 0 }) {
  vi.mocked(repo.findUserById).mockResolvedValue(user);
  vi.mocked(repo.listAdvertisersByUserId).mockResolvedValue(advertisers);
  vi.mocked(repo.countAdsByUserId).mockResolvedValue(ads ?? { active: 0, total: 0 });
  vi.mocked(repo.countPurchaseIntentsByUserId).mockResolvedValue(intents ?? { total: 0, live: 0 });
  vi.mocked(repo.listRecentPurchaseIntentsByUserId).mockResolvedValue(recent);
  vi.mocked(repo.countReceivedOffersByUserId).mockResolvedValue(offers);
}

describe("admin users service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────
  // §42 — CONTRATO DE PII
  // ───────────────────────────────────────────────────────────────────────
  describe("PII — chaves sensíveis NÃO EXISTEM no payload", () => {
    const FORBIDDEN = [
      "password",
      "password_hash",
      "reset_token",
      "reset_token_expires",
      "email_verification_token",
      "email_verification_expires",
      "document_number",
      "document_type",
      "address",
      "phone",
      "whatsapp",
      "failed_attempts",
    ];

    /**
     * A linha do banco chega POLUÍDA de propósito: se o service fizesse
     * `{...row}` em vez de montar o DTO campo a campo, estes segredos vazariam
     * — e é exatamente esse o erro que um refactor futuro tende a introduzir.
     */
    const POLLUTED = userRow({
      password_hash: "$2b$10$hash",
      password: "plaintext",
      reset_token: "tok_reset",
      reset_token_expires: "2026-09-01",
      email_verification_token: "tok_verify",
      email_verification_expires: "2026-09-01",
      document_number: "12345678901",
      address: "Rua X, 100",
      phone: "11999999999",
      whatsapp: "11999999999",
      failed_attempts: 3,
    });

    it("listagem: a chave não existe (não basta ser undefined)", async () => {
      mockList([POLLUTED]);
      const result = await listUsers({});
      const dto = result.data[0];
      for (const key of FORBIDDEN) {
        expect(Object.prototype.hasOwnProperty.call(dto, key)).toBe(false);
      }
    });

    it("detalhe: a chave não existe (não basta ser undefined)", async () => {
      mockDetail({ user: POLLUTED });
      const dto = await getUserById("1");
      for (const key of FORBIDDEN) {
        expect(Object.prototype.hasOwnProperty.call(dto, key)).toBe(false);
      }
    });

    it("nenhum valor secreto aparece no JSON serializado", async () => {
      mockDetail({ user: POLLUTED });
      const json = JSON.stringify(await getUserById("1"));
      for (const secret of ["$2b$10$hash", "plaintext", "tok_reset", "tok_verify", "12345678901"]) {
        expect(json).not.toContain(secret);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // DTO
  // ───────────────────────────────────────────────────────────────────────
  describe("DTO", () => {
    it("deriva account_type pela regra canônica", async () => {
      mockList([
        userRow({ id: 1, document_type: "cpf" }),
        userRow({ id: 2, document_type: "cnpj" }),
        userRow({ id: 3, document_type: null }),
        userRow({ id: 4, document_type: "rg" }),
      ]);
      const { data } = await listUsers({});
      expect(data.map((u) => u.account_type)).toEqual(["CPF", "CNPJ", "pending", "pending"]);
    });

    it("plano vem de plan_id/subscription_plans, e null quando não há", async () => {
      mockList([
        userRow({ id: 1, plan_id: "cnpj-pro-store", plan_name: "Loja Profissional" }),
        userRow({ id: 2, plan_id: null, plan_name: null }),
      ]);
      const { data } = await listUsers({});
      expect(data[0].plan).toEqual({ id: "cnpj-pro-store", name: "Loja Profissional" });
      expect(data[1].plan).toBeNull();
    });

    it("email_verified aceita qualquer uma das duas colunas do schema", async () => {
      mockList([
        userRow({ id: 1, email_verified: true, is_email_verified: null }),
        userRow({ id: 2, email_verified: false, is_email_verified: true }),
        userRow({ id: 3, email_verified: false, is_email_verified: false }),
      ]);
      const { data } = await listUsers({});
      expect(data.map((u) => u.email_verified)).toEqual([true, true, false]);
    });

    /**
     * §9 — não inventar status. O único estado negativo real é a trava
     * anti-força-bruta, e ela é PRESENTE, não histórico.
     */
    it("locked_until vencido é devolvido como null", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60 * 60_000).toISOString();
      mockList([userRow({ id: 1, locked_until: past }), userRow({ id: 2, locked_until: future })]);
      const { data } = await listUsers({});
      expect(data[0].locked_until).toBeNull();
      expect(data[1].locked_until).not.toBeNull();
    });

    it("não inventa campo `status` nem `last_login`", async () => {
      mockList([userRow()]);
      const dto = (await listUsers({})).data[0];
      expect(Object.prototype.hasOwnProperty.call(dto, "status")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(dto, "last_login")).toBe(false);
      // `users.city` é texto livre — não é fonte territorial e não vai à tela.
      expect(Object.prototype.hasOwnProperty.call(dto, "city")).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // §43-47 — REGRESSÕES QUE MOTIVARAM A FEATURE
  // ───────────────────────────────────────────────────────────────────────
  describe("cobertura das contas hoje invisíveis", () => {
    /** §43 — o teste principal: quem nunca publicou anúncio TEM que aparecer. */
    it("usuário sem advertiser e sem anúncio aparece na listagem", async () => {
      mockList([userRow({ id: 10, name: "Só Cadastrou", email: "so@cadastro.com" })]);
      const { data, total } = await listUsers({});
      expect(total).toBe(1);
      expect(data.map((u) => u.id)).toContain("10");
    });

    /** §44 — comprador ativo sem loja: o caso concreto que originou a Admin U1. */
    it("comprador ativo sem advertiser aparece e tem procuras no detalhe", async () => {
      mockList([userRow({ id: 11, name: "Comprador" })]);
      expect((await listUsers({})).data.map((u) => u.id)).toContain("11");

      mockDetail({
        user: userRow({ id: 11 }),
        advertisers: [],
        intents: { total: 2, live: 1 },
      });
      const detail = await getUserById("11");
      expect(detail.activity.advertisers_count).toBe(0);
      expect(detail.activity.purchase_intents_count).toBeGreaterThanOrEqual(1);
      expect(detail.activity.purchase_intents_live_count).toBe(1);
    });

    /** §47 — admins vivem na mesma tabela e não podem ser escondidos. */
    it("conta admin aparece com papel admin", async () => {
      mockList([userRow({ id: 1, role: "admin", name: "Root" })]);
      const dto = (await listUsers({})).data[0];
      expect(dto.role).toBe("admin");
    });

    /** §45/§46 — N lojas, UMA linha de usuário. */
    it("usuário com 2 advertisers aparece uma única vez e conta 2 no detalhe", async () => {
      mockList([userRow({ id: 12 })], 1);
      const list = await listUsers({});
      expect(list.data).toHaveLength(1);
      expect(list.total).toBe(1);

      mockDetail({
        user: userRow({ id: 12 }),
        advertisers: [
          { id: 5, name: "Loja A", status: "active", city_name: "Atibaia", city_state: "SP" },
          { id: 9, name: "Loja B", status: "suspended", city_name: null, city_state: null },
        ],
        ads: { active: 3, total: 7 },
      });
      const detail = await getUserById("12");
      expect(detail.activity.advertisers_count).toBe(2);
      expect(detail.advertisers.map((a) => a.id)).toEqual(["5", "9"]);
      expect(detail.activity.ads_active_count).toBe(3);
      expect(detail.activity.ads_total_count).toBe(7);
    });

    /**
     * Mesma convenção do resto do produto: status NULL/'' de loja legada conta
     * como 'active'. Marcar como desconhecido faria o admin ver como fora de
     * operação uma loja que está no ar publicamente.
     */
    it("advertiser legado com status NULL/'' é apresentado como active", async () => {
      mockDetail({
        user: userRow({ id: 13 }),
        advertisers: [
          { id: 1, name: "Legada", status: null },
          { id: 2, name: "Vazia", status: "  " },
          { id: 3, name: "Bloqueada", status: "blocked" },
        ],
      });
      const detail = await getUserById("13");
      expect(detail.advertisers.map((a) => a.status)).toEqual(["active", "active", "blocked"]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Validação e erros
  // ───────────────────────────────────────────────────────────────────────
  describe("validação de filtros", () => {
    it("recusa account_type fora do vocabulário", async () => {
      await expect(listUsers({ accountType: "PJ" })).rejects.toThrow(/Tipo de conta inválido/);
    });

    it("recusa role fora do vocabulário", async () => {
      await expect(listUsers({ role: "superadmin" })).rejects.toThrow(/Papel inválido/);
    });

    it("busca só com espaços não vira filtro", async () => {
      mockList([]);
      await listUsers({ search: "   " });
      expect(vi.mocked(repo.listUsers).mock.calls[0][0].search).toBeUndefined();
    });
  });

  describe("getUserById", () => {
    it("usuário inexistente vira 404 (e não 500)", async () => {
      vi.mocked(repo.findUserById).mockResolvedValue(null);
      await expect(getUserById("999")).rejects.toMatchObject({
        statusCode: 404,
        message: expect.stringMatching(/não encontrado/i),
      });
    });

    it("atividade sai em queries separadas, não numa consulta única", async () => {
      mockDetail({ user: userRow({ id: 1 }) });
      await getUserById("1");
      expect(repo.listAdvertisersByUserId).toHaveBeenCalledWith("1");
      expect(repo.countAdsByUserId).toHaveBeenCalledWith("1");
      expect(repo.countPurchaseIntentsByUserId).toHaveBeenCalledWith("1");
      expect(repo.countReceivedOffersByUserId).toHaveBeenCalledWith("1");
    });

    /** §26 — nada de placeholder falso para domínio que ainda não existe. */
    it("não expõe contador de Venda para Lojas (sale_requests não existe)", async () => {
      mockDetail({ user: userRow({ id: 1 }) });
      const detail = await getUserById("1");
      const keys = Object.keys(detail.activity);
      expect(keys.some((k) => k.includes("sale_request"))).toBe(false);
    });
  });
});
