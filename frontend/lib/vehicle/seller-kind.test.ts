import { describe, expect, it } from "vitest";

import { resolveSellerKind, sellerKindLabel } from "@/lib/vehicle/seller-kind";

/**
 * Mapper único de tipo de anunciante.
 *
 * Regra invariante (rodada de credibilidade):
 *   - Backend trust pass devolve `seller_kind`. Se vier, é a verdade.
 *   - Sem trust pass: cai em dealership_id (loja registrada) ou
 *     account_type=CNPJ (loja sem advertiser ainda).
 *   - NUNCA usar nome do anunciante para inferir tipo. "ittmotors" sem
 *     dealership_id e sem CNPJ é particular — caso explicitamente
 *     coberto aqui para impedir regressão.
 */

describe("resolveSellerKind — backend trust pass tem precedência", () => {
  it("respeita seller_kind='dealer' do backend mesmo sem dealership_id", () => {
    expect(resolveSellerKind({ seller_kind: "dealer" })).toBe("dealer");
  });

  it("respeita seller_kind='private' do backend mesmo com nome de loja", () => {
    expect(
      resolveSellerKind({
        seller_kind: "private",
        dealership_name: "AutoCar",
      })
    ).toBe("private");
  });

  it("aceita compat seller_type='dealership'", () => {
    expect(resolveSellerKind({ seller_type: "dealership" })).toBe("dealer");
  });

  it("aceita compat seller_type='particular' como private", () => {
    expect(resolveSellerKind({ seller_type: "particular" })).toBe("private");
  });
});

describe("resolveSellerKind — fallback dealership_id", () => {
  it("dealership_id numérico válido → dealer", () => {
    expect(resolveSellerKind({ dealership_id: 42 })).toBe("dealer");
  });

  it("dealership_id como string '42' válido → dealer", () => {
    expect(resolveSellerKind({ dealership_id: "42" })).toBe("dealer");
  });

  it("dealership_id zero/negativo NÃO conta como dealer", () => {
    expect(resolveSellerKind({ dealership_id: 0 })).toBe("private");
    expect(resolveSellerKind({ dealership_id: -1 })).toBe("private");
  });

  it("dealership_id null/undefined/string vazia NÃO conta", () => {
    expect(resolveSellerKind({ dealership_id: null })).toBe("private");
    expect(resolveSellerKind({ dealership_id: "" })).toBe("private");
    expect(resolveSellerKind({})).toBe("private");
  });
});

describe("resolveSellerKind — fallback account_type", () => {
  it("CNPJ sem dealership_id → dealer (loja sem advertiser ainda)", () => {
    expect(resolveSellerKind({ account_type: "CNPJ" })).toBe("dealer");
    expect(resolveSellerKind({ account_type: "cnpj" })).toBe("dealer");
  });

  it("CPF → private", () => {
    expect(resolveSellerKind({ account_type: "CPF" })).toBe("private");
  });
});

describe("resolveSellerKind — heurística por nome NÃO é usada (regressão 'ittmotors')", () => {
  it("dealership_name preenchido SEM seller_kind/dealership_id/CNPJ → private", () => {
    // Caso histórico: backend antigo deixava `ittmotors` em
    // `dealership_name` mas não tinha advertiser registrado e o usuário
    // era CPF. Frontend NUNCA pode classificar como loja por nome.
    expect(
      resolveSellerKind({
        dealership_name: "ittmotors",
        account_type: "CPF",
      })
    ).toBe("private");
  });

  it("seller_name com nome comercial mas sem outros sinais → private", () => {
    expect(
      resolveSellerKind({
        seller_name: "AutoCar Veículos LTDA",
      })
    ).toBe("private");
  });
});

describe("sellerKindLabel", () => {
  it("dealer → 'Loja'", () => {
    expect(sellerKindLabel("dealer")).toBe("Loja");
  });

  it("private → 'Anunciante particular'", () => {
    expect(sellerKindLabel("private")).toBe("Anunciante particular");
  });
});
