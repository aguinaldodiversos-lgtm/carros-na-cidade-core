import { describe, expect, it, vi } from "vitest";

import {
  buildSafeColumnList,
  fetchExistingColumns,
  parseAuditArgs,
  printSchemaDiagnostic,
  redactPii,
  redactPiiDeep,
  withAlias,
  __INTERNAL__,
} from "../../scripts/audit/lib/audit-shared.mjs";

describe("buildSafeColumnList — filtragem de colunas", () => {
  it("retorna present para colunas que existem em available", () => {
    const available = new Set(["id", "title", "slug"]);
    const result = buildSafeColumnList(available, ["id", "title", "slug"]);
    expect(result.present).toEqual(["id", "title", "slug"]);
    expect(result.missing).toEqual([]);
  });

  it("retorna missing para colunas que NÃO existem", () => {
    const available = new Set(["id", "title", "slug"]);
    const result = buildSafeColumnList(available, ["id", "version", "trim_level"]);
    expect(result.present).toEqual(["id"]);
    expect(result.missing).toEqual(["version", "trim_level"]);
  });

  it("normaliza case (lowercase) durante filtragem", () => {
    const available = new Set(["id", "city_id"]);
    const result = buildSafeColumnList(available, ["ID", "City_Id"]);
    expect(result.present).toEqual(["id", "city_id"]);
  });

  it("descarta identifiers unsafe (defesa contra SQL injection)", () => {
    const available = new Set(["id", "title"]);
    const result = buildSafeColumnList(available, [
      "id",
      "title; DROP TABLE ads",
      "1col",
      "col-with-dash",
      "title",
    ]);
    expect(result.present).toEqual(["id", "title"]);
    expect(result.unsafe).toEqual(["title; DROP TABLE ads", "1col", "col-with-dash"]);
  });

  it("string vazia/null é ignorada silenciosamente", () => {
    const available = new Set(["id"]);
    const result = buildSafeColumnList(available, ["id", "", null, undefined]);
    expect(result.present).toEqual(["id"]);
    expect(result.missing).toEqual([]);
    expect(result.unsafe).toEqual([]);
  });

  it("erro quando available não é Set", () => {
    expect(() => buildSafeColumnList(["id"], ["id"])).toThrow(/Set/);
  });

  it("erro quando requested não é array", () => {
    expect(() => buildSafeColumnList(new Set(), "id")).toThrow(/array/);
  });
});

describe("withAlias — prefix de tabela", () => {
  it("prefixa colunas com alias.col", () => {
    expect(withAlias(["id", "name"], "a")).toEqual(["a.id", "a.name"]);
  });

  it("sem alias devolve cópia", () => {
    const out = withAlias(["id"], "");
    expect(out).toEqual(["id"]);
  });

  it("alias unsafe joga", () => {
    expect(() => withAlias(["id"], "a; DROP TABLE")).toThrow(/inválido/i);
  });
});

describe("fetchExistingColumns — query information_schema", () => {
  it("constrói SQL correto e mapeia rows para Set", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ column_name: "id" }, { column_name: "title" }, { column_name: "slug" }],
      }),
    };
    const result = await fetchExistingColumns(pool, "ads");

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/information_schema\.columns/);
    expect(sql).toMatch(/table_schema = 'public'/);
    expect(params).toEqual(["ads"]);

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has("id")).toBe(true);
    expect(result.has("title")).toBe(true);
  });

  it("normaliza column_name para lowercase no Set", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ column_name: "ID" }, { column_name: "Title" }],
      }),
    };
    const result = await fetchExistingColumns(pool, "ads");
    expect(result.has("id")).toBe(true);
    expect(result.has("title")).toBe(true);
  });

  it("erro quando tableName tem caracteres unsafe", async () => {
    const pool = { query: vi.fn() };
    await expect(fetchExistingColumns(pool, "ads; DROP TABLE")).rejects.toThrow(/inválido/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("erro quando pool não tem .query", async () => {
    await expect(fetchExistingColumns(null, "ads")).rejects.toThrow(/pool inválido/);
    await expect(fetchExistingColumns({}, "ads")).rejects.toThrow(/pool inválido/);
  });
});

describe("parseAuditArgs — flag --print-schema", () => {
  it("ausente → printSchema=false", () => {
    expect(parseAuditArgs([]).printSchema).toBe(false);
  });

  it("--print-schema → true", () => {
    expect(parseAuditArgs(["--print-schema"]).printSchema).toBe(true);
  });

  it("combina com outras flags", () => {
    const out = parseAuditArgs(["--print-schema", "--limit=500", "--silent"]);
    expect(out.printSchema).toBe(true);
    expect(out.limit).toBe(500);
    expect(out.silent).toBe(true);
  });
});

describe("printSchemaDiagnostic — formato de saída", () => {
  it("imprime para console e devolve buildSafeColumnList result", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = printSchemaDiagnostic({
        table: "ads",
        available: new Set(["id", "title", "slug", "brand"]),
        requested: ["id", "title", "version"],
      });
      expect(result.present).toEqual(["id", "title"]);
      expect(result.missing).toEqual(["version"]);

      // Verifica que falou de ads, present, e missing nos logs.
      const allLogs = spy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(allLogs).toMatch(/ads/);
      expect(allLogs).toMatch(/PRESENT/);
      expect(allLogs).toMatch(/MISSING/);
      expect(allLogs).toMatch(/version/);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("redactPii — mascaramento", () => {
  it("mascara email", () => {
    expect(redactPii("Contato: foo@bar.com")).toBe("Contato: <email-redacted>");
  });

  it("mascara CPF", () => {
    expect(redactPii("CPF: 123.456.789-00")).toBe("CPF: <cpf-redacted>");
  });

  it("mascara telefone", () => {
    expect(redactPii("Tel: (11) 98765-4321")).toBe("Tel: <phone-redacted>");
  });

  it("mascara CNPJ", () => {
    expect(redactPii("CNPJ: 12.345.678/0001-90")).toBe("CNPJ: <cnpj-redacted>");
  });

  it("não muda string sem PII", () => {
    expect(redactPii("Honda Civic 2019")).toBe("Honda Civic 2019");
  });

  it("retorna não-string sem mudança", () => {
    expect(redactPii(42)).toBe(42);
    expect(redactPii(null)).toBe(null);
  });
});

describe("redactPiiDeep — recursão", () => {
  it("aplica redact em strings dentro de objects/arrays", () => {
    const input = {
      title: "Honda Civic",
      seller: { email: "x@y.com", phone: "(11) 99999-9999" },
      tags: ["limpo", "CPF 111.222.333-44"],
    };
    const out = redactPiiDeep(input);
    expect(out.seller.email).toBe("<email-redacted>");
    expect(out.seller.phone).toBe("<phone-redacted>");
    expect(out.tags[1]).toBe("CPF <cpf-redacted>");
    expect(out.title).toBe("Honda Civic");
  });

  it("respeita limite de profundidade", () => {
    const deep = { a: { b: { c: { d: { e: { f: { email: "x@y.com" } } } } } } };
    const out = redactPiiDeep(deep);
    // Não joga, e devolve algo — profundidade > 5 é tratada graciosamente.
    expect(out).toBeDefined();
  });
});

describe("SAFE_IDENTIFIER_RE — defesa SQL injection", () => {
  const re = __INTERNAL__.SAFE_IDENTIFIER_RE;

  it("aceita identifiers válidos", () => {
    expect(re.test("id")).toBe(true);
    expect(re.test("city_id")).toBe(true);
    expect(re.test("_internal")).toBe(true);
    expect(re.test("col123")).toBe(true);
  });

  it("rejeita identifiers inválidos", () => {
    expect(re.test("1col")).toBe(false);
    expect(re.test("col-dash")).toBe(false);
    expect(re.test("col; DROP")).toBe(false);
    expect(re.test("col space")).toBe(false);
    expect(re.test("")).toBe(false);
  });
});
