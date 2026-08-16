import { describe, it, expect } from "vitest";
import {
  ACCOUNT_TYPE,
  deriveAccountType,
  accountTypeSqlPredicate,
  isValidAccountType,
} from "../../src/shared/account/account-type.js";
import { isDealerAccount } from "../../src/shared/middlewares/dealer.middleware.js";

/**
 * A derivação de tipo de conta existe em DOIS lugares: aqui e em
 * `auth.service.js#buildSessionUser` (privado, sem suíte dedicada). Esta tabela
 * fixa o comportamento esperado caso a caso, para que uma divergência futura
 * apareça como teste vermelho e não como conta classificada errado no admin.
 */
const CASES = [
  // [document_type, account_type esperado]
  [null, "pending"],
  [undefined, "pending"],
  ["", "pending"],
  ["   ", "pending"],
  ["cpf", "CPF"],
  ["CPF", "CPF"],
  ["  Cpf  ", "CPF"],
  ["cnpj", "CNPJ"],
  ["CNPJ", "CNPJ"],
  [" cnpj ", "CNPJ"],
  // O caso contra-intuitivo: `normalizeDocumentType` devolve null para tudo que
  // não seja exatamente cpf/cnpj, e null cai em 'pending' — NÃO em 'CPF'.
  ["rg", "pending"],
  ["PF", "pending"],
  ["pessoa_fisica", "pending"],
  // Tipos não-string nunca deveriam chegar do Postgres, mas fail-closed.
  [123, "pending"],
  [{}, "pending"],
];

describe("deriveAccountType — vocabulário canônico", () => {
  it.each(CASES)("document_type=%j → %s", (input, expected) => {
    expect(deriveAccountType(input)).toBe(expected);
  });

  it("só produz valores do vocabulário fechado ACCOUNT_TYPE", () => {
    for (const [input] of CASES) {
      expect(isValidAccountType(deriveAccountType(input))).toBe(true);
    }
  });

  /**
   * Guarda de compatibilidade com a autorização: o valor que esta função
   * produz para CNPJ tem que ser EXATAMENTE o que `isDealerAccount` aceita.
   * Se alguém trocar 'CNPJ' por 'cnpj' num dos lados, a área do lojista para
   * de abrir — e o sintoma (403) não apontaria para cá.
   */
  it("CNPJ derivado aqui é aceito por isDealerAccount", () => {
    expect(isDealerAccount({ account_type: deriveAccountType("cnpj") })).toBe(true);
    expect(isDealerAccount({ account_type: deriveAccountType("cpf") })).toBe(false);
    expect(isDealerAccount({ account_type: deriveAccountType(null) })).toBe(false);
  });
});

describe("accountTypeSqlPredicate", () => {
  it("CNPJ e CPF comparam o valor normalizado", () => {
    expect(accountTypeSqlPredicate(ACCOUNT_TYPE.CNPJ)).toContain("= 'cnpj'");
    expect(accountTypeSqlPredicate(ACCOUNT_TYPE.CPF)).toContain("= 'cpf'");
  });

  /**
   * `pending` é o COMPLEMENTO, e precisa de COALESCE: `NULL NOT IN (...)` é
   * NULL (nunca TRUE), então sem ele toda conta com document_type NULL sumiria
   * do filtro "Pendente" — que é exatamente a fatia de contas que a Admin U1
   * existe para tornar visível.
   */
  it("pending é complemento e trata NULL via COALESCE", () => {
    const sql = accountTypeSqlPredicate(ACCOUNT_TYPE.PENDING);
    expect(sql).toContain("COALESCE");
    expect(sql).toContain("NOT IN ('cpf', 'cnpj')");
  });

  it("usa o alias de coluna informado", () => {
    expect(accountTypeSqlPredicate(ACCOUNT_TYPE.CPF, "x.document_type")).toContain(
      "x.document_type"
    );
  });

  it("recusa tipo fora do vocabulário em vez de gerar SQL frouxo", () => {
    expect(() => accountTypeSqlPredicate("PJ")).toThrow(/inválido/i);
    expect(() => accountTypeSqlPredicate("")).toThrow(/inválido/i);
  });
});
