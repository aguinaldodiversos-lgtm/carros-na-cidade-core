import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é um pacote do Next que joga se importado em client. No
// vitest em ambiente node, stubamos como módulo vazio para o import não
// quebrar — mesmo padrão de fetch-region.test.ts.
vi.mock("server-only", () => ({}));

import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  isRegionalPageIndexable,
} from "./feature-flags";

const ORIGINAL = process.env.REGIONAL_PAGE_ENABLED;
const ORIGINAL_INDEXABLE = process.env.REGIONAL_PAGE_INDEXABLE;
const ORIGINAL_CANONICAL_SELF = process.env.REGIONAL_PAGE_CANONICAL_SELF;

function setFlag(value: string | undefined) {
  if (value === undefined) {
    delete process.env.REGIONAL_PAGE_ENABLED;
  } else {
    process.env.REGIONAL_PAGE_ENABLED = value;
  }
}

function setIndexable(value: string | undefined) {
  if (value === undefined) {
    delete process.env.REGIONAL_PAGE_INDEXABLE;
  } else {
    process.env.REGIONAL_PAGE_INDEXABLE = value;
  }
}

function setCanonicalSelf(value: string | undefined) {
  if (value === undefined) {
    delete process.env.REGIONAL_PAGE_CANONICAL_SELF;
  } else {
    process.env.REGIONAL_PAGE_CANONICAL_SELF = value;
  }
}

beforeEach(() => {
  setFlag(undefined);
  setIndexable(undefined);
  setCanonicalSelf(undefined);
});

afterEach(() => {
  setFlag(ORIGINAL);
  setIndexable(ORIGINAL_INDEXABLE);
  setCanonicalSelf(ORIGINAL_CANONICAL_SELF);
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

describe("isRegionalPageIndexable — default seguro (PR 2)", () => {
  it("flag ausente → false (noindex permanece como default)", () => {
    setIndexable(undefined);
    expect(isRegionalPageIndexable()).toBe(false);
  });

  it("flag string vazia → false", () => {
    setIndexable("");
    expect(isRegionalPageIndexable()).toBe(false);
  });

  it("\"true\" minúsculo exato → true", () => {
    setIndexable("true");
    expect(isRegionalPageIndexable()).toBe(true);
  });

  it("\"TRUE\" maiúsculo → false (contrato estrito)", () => {
    setIndexable("TRUE");
    expect(isRegionalPageIndexable()).toBe(false);
  });

  it("\"1\" → false", () => {
    setIndexable("1");
    expect(isRegionalPageIndexable()).toBe(false);
  });

  it("\" true \" com espaços → false", () => {
    setIndexable(" true ");
    expect(isRegionalPageIndexable()).toBe(false);
  });
});

describe("isRegionalPageCanonicalSelf — default seguro (PR 2)", () => {
  it("flag ausente → false (canonical aponta para cidade-base por default)", () => {
    setCanonicalSelf(undefined);
    expect(isRegionalPageCanonicalSelf()).toBe(false);
  });

  it("\"true\" minúsculo exato → true", () => {
    setCanonicalSelf("true");
    expect(isRegionalPageCanonicalSelf()).toBe(true);
  });

  it("\"TRUE\" maiúsculo → false (contrato estrito)", () => {
    setCanonicalSelf("TRUE");
    expect(isRegionalPageCanonicalSelf()).toBe(false);
  });

  it("\"1\" → false", () => {
    setCanonicalSelf("1");
    expect(isRegionalPageCanonicalSelf()).toBe(false);
  });
});

describe("flags regionais — independência (PR 2)", () => {
  it("INDEXABLE pode estar true sem CANONICAL_SELF (ramp-up gradual)", () => {
    setIndexable("true");
    setCanonicalSelf(undefined);
    expect(isRegionalPageIndexable()).toBe(true);
    expect(isRegionalPageCanonicalSelf()).toBe(false);
  });

  it("CANONICAL_SELF pode estar true sem INDEXABLE (preparação SEO sem promover)", () => {
    setIndexable(undefined);
    setCanonicalSelf("true");
    expect(isRegionalPageIndexable()).toBe(false);
    expect(isRegionalPageCanonicalSelf()).toBe(true);
  });

  it("REGIONAL_PAGE_ENABLED desligado NÃO afeta as outras flags (são ortogonais)", () => {
    // Em prática, INDEXABLE/CANONICAL_SELF não importam se ENABLED for false
    // (a rota cai em notFound antes de chegar nesses flags), mas o
    // contrato dos getters é puro — refletem só sua própria env var.
    setFlag(undefined);
    setIndexable("true");
    setCanonicalSelf("true");
    expect(isRegionalPageEnabled()).toBe(false);
    expect(isRegionalPageIndexable()).toBe(true);
    expect(isRegionalPageCanonicalSelf()).toBe(true);
  });
});
