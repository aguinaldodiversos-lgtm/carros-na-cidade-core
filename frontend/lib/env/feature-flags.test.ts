import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é um pacote do Next que joga se importado em client. No
// vitest em ambiente node, stubamos como módulo vazio para o import não
// quebrar — mesmo padrão de fetch-region.test.ts.
vi.mock("server-only", () => ({}));

import { isRegionalPageEnabled } from "./feature-flags";

const ORIGINAL = process.env.REGIONAL_PAGE_ENABLED;

function setFlag(value: string | undefined) {
  if (value === undefined) {
    delete process.env.REGIONAL_PAGE_ENABLED;
  } else {
    process.env.REGIONAL_PAGE_ENABLED = value;
  }
}

beforeEach(() => {
  setFlag(undefined);
});

afterEach(() => {
  setFlag(ORIGINAL);
});

describe("isRegionalPageEnabled — default seguro", () => {
  it("flag ausente → false", () => {
    setFlag(undefined);
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("flag string vazia → false", () => {
    setFlag("");
    expect(isRegionalPageEnabled()).toBe(false);
  });
});

describe("isRegionalPageEnabled — contrato estrito (apenas \"true\" ativa)", () => {
  it("\"true\" minúsculo → true", () => {
    setFlag("true");
    expect(isRegionalPageEnabled()).toBe(true);
  });

  it("\"TRUE\" maiúsculo → false (sem coerção indulgente)", () => {
    setFlag("TRUE");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"True\" capitalizado → false", () => {
    setFlag("True");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"1\" → false", () => {
    setFlag("1");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"yes\" → false", () => {
    setFlag("yes");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"sim\" → false", () => {
    setFlag("sim");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\" true \" com espaços → false (contrato exige string exata)", () => {
    setFlag(" true ");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"false\" → false", () => {
    setFlag("false");
    expect(isRegionalPageEnabled()).toBe(false);
  });

  it("\"0\" → false", () => {
    setFlag("0");
    expect(isRegionalPageEnabled()).toBe(false);
  });
});

describe("isRegionalPageEnabled — isolamento entre testes", () => {
  it("após teste anterior setar 'true', próximo começa com flag limpa (default false)", () => {
    // beforeEach já apagou; verificamos só que o reset funcionou.
    expect(process.env.REGIONAL_PAGE_ENABLED).toBeUndefined();
    expect(isRegionalPageEnabled()).toBe(false);
  });
});
