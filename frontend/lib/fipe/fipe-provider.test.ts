import { describe, expect, it } from "vitest";

import { flattenFipeModelRows } from "./fipe-provider";

describe("flattenFipeModelRows", () => {
  it("aceita lista plana (nome + codigo string)", () => {
    const out = flattenFipeModelRows([{ nome: "Ka", codigo: "123" }]);
    expect(out).toEqual([{ code: "123", name: "Ka" }]);
  });

  it("expande modelos aninhados (codigo como array de sub-itens)", () => {
    const out = flattenFipeModelRows([
      {
        nome: "Gol",
        codigo: [
          { nome: "1.0", codigo: "2013-1" },
          { nome: "1.6", codigo: "2013-2" },
        ],
      },
    ]);
    expect(out).toEqual([
      { code: "2013-1", name: "Gol 1.0" },
      { code: "2013-2", name: "Gol 1.6" },
    ]);
  });

  it("deduplica por código", () => {
    const out = flattenFipeModelRows([
      { nome: "X", codigo: "1" },
      { nome: "Y", codigo: "1" },
    ]);
    expect(out).toHaveLength(1);
  });
});
