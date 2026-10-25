import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidCnpj, normalizeCnpj } from "../../src/modules/account/cnpj-validation.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  pool: { query: vi.fn() },
  query: vi.fn(),
  withTransaction: vi.fn(),
}));
vi.mock("../../src/modules/advertisers/advertiser.ensure.service.js", () => ({
  ensureAdvertiserForUser: vi.fn(),
}));
import { pool } from "../../src/infrastructure/database/db.js";
import { ensureAdvertiserForUser } from "../../src/modules/advertisers/advertiser.ensure.service.js";
import {
  createStoreProfile,
  getStoreProfile,
} from "../../src/modules/account/store-profile.service.js";

const validUser = { document_type: "cnpj", document_number: "11.222.333/0001-81" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CNPJ numérico e alfanumérico", () => {
  it("aceita DVs válidos dos dois formatos RFB e normaliza pontuação", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("00.000.000/E08G-12")).toBe(true);
    expect(normalizeCnpj("00.000.000/e08g-12")).toBe("00000000E08G12");
  });

  it("rejeita DV inválido e padrões triviais", () => {
    expect(isValidCnpj("00.000.000/E08G-13")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
});

const validPayload = {
  city_id: 17,
  name: "Loja Exemplo",
  email: "contato@loja.com",
  whatsapp: "11987654321",
  address: "Rua Exemplo 123, Centro",
};

describe("cadastro de loja sem anúncio", () => {
  it("nega conta CPF e não cria anunciante", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [{ ...validUser, document_type: "cpf" }] });
    await expect(createStoreProfile("pf-1", validPayload)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(ensureAdvertiserForUser).not.toHaveBeenCalled();
  });

  it("nega CNPJ inválido e não cria anunciante", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({
      rows: [{ ...validUser, document_number: "11222333000182" }],
    });
    await expect(createStoreProfile("pj-1", validPayload)).rejects.toMatchObject({
      statusCode: 422,
    });
    expect(ensureAdvertiserForUser).not.toHaveBeenCalled();
  });

  it("exige cidade real e dados básicos antes de criar", async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [validUser] });
    await expect(createStoreProfile("pj-1", { ...validPayload, city_id: 0 })).rejects.toMatchObject(
      {
        statusCode: 400,
      }
    );
    await expect(
      createStoreProfile("pj-1", { ...validPayload, address: "" })
    ).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(ensureAdvertiserForUser).not.toHaveBeenCalled();
  });

  it("recusa CNPJ associado a outra conta antes de criar loja", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [validUser] })
      .mockResolvedValueOnce({ rows: [{ id: "outro-usuario" }] });
    await expect(createStoreProfile("pj-1", validPayload)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(ensureAdvertiserForUser).not.toHaveBeenCalled();
  });

  it("usa ensure idempotente, cidade explícita e guarda verificação falsa", async () => {
    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [validUser] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { column_name: "name" },
          { column_name: "email" },
          { column_name: "whatsapp" },
          { column_name: "address" },
          { column_name: "verified" },
        ],
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 8,
            name: validPayload.name,
            email: validPayload.email,
            whatsapp: validPayload.whatsapp,
            address: validPayload.address,
            city_id: 17,
            city_name: "Atibaia",
            city_state: "SP",
            verified: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [validUser] });
    const store = await createStoreProfile("pj-1", validPayload);
    expect(ensureAdvertiserForUser).toHaveBeenCalledWith(
      "pj-1",
      expect.objectContaining({ cityId: 17, source: "account.store.onboarding" })
    );
    expect(store.verified).toBe(false);
    expect(store.city).toEqual({ id: 17, name: "Atibaia", state: "SP" });
    const sql = vi.mocked(pool.query).mock.calls[3][0];
    expect(sql).toContain("WHERE user_id");
    expect(sql).toContain("verified = CASE");
    expect(sql).not.toContain("verified = TRUE");
  });

  it("GET somente lê a loja do usuário autenticado", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] });
    await expect(getStoreProfile("pj-2")).rejects.toMatchObject({ statusCode: 404 });
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual(["pj-2"]);
  });
});
