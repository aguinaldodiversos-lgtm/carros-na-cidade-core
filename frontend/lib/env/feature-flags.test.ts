import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` é um pacote do Next que joga se importado em client. No
// vitest em ambiente node, stubamos como módulo vazio para o import não
// quebrar — mesmo padrão de fetch-region.test.ts.
vi.mock("server-only", () => ({}));

import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  isRegionalPageIndexable,
  regionalIndexMinAds,
  shouldIndexRegionalPage,
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

function setMinAds(value: string | undefined) {
  if (value === undefined) {
    delete process.env.REGIONAL_INDEX_MIN_ADS;
  } else {
    process.env.REGIONAL_INDEX_MIN_ADS = value;
  }
}

describe("regionalIndexMinAds — threshold de inventário", () => {
  beforeEach(() => setMinAds(undefined));
  afterEach(() => setMinAds(undefined));

  it("env ausente → 0 (sem threshold)", () => {
    expect(regionalIndexMinAds()).toBe(0);
  });

  it("env vazia → 0", () => {
    setMinAds("");
    expect(regionalIndexMinAds()).toBe(0);
  });

  it("número positivo válido → parseado", () => {
    setMinAds("10");
    expect(regionalIndexMinAds()).toBe(10);
    setMinAds("30");
    expect(regionalIndexMinAds()).toBe(30);
  });

  it("número negativo → 0 (proteção contra config maluca)", () => {
    setMinAds("-5");
    expect(regionalIndexMinAds()).toBe(0);
  });

  it("string não numérica → 0", () => {
    setMinAds("abc");
    expect(regionalIndexMinAds()).toBe(0);
  });

  it("decimal → trunca para inteiro", () => {
    setMinAds("12.7");
    expect(regionalIndexMinAds()).toBe(12);
  });
});

describe("shouldIndexRegionalPage — combina flag global + threshold", () => {
  beforeEach(() => {
    setIndexable(undefined);
    setMinAds(undefined);
  });
  afterEach(() => {
    setIndexable(undefined);
    setMinAds(undefined);
  });

  it("REGIONAL_PAGE_INDEXABLE=false → noindex independente de adsCount", () => {
    setIndexable("false");
    expect(shouldIndexRegionalPage(0)).toBe(false);
    expect(shouldIndexRegionalPage(1000)).toBe(false);
  });

  it("INDEXABLE=true + threshold=0 → indexa qualquer adsCount", () => {
    setIndexable("true");
    setMinAds("0");
    expect(shouldIndexRegionalPage(0)).toBe(true);
    expect(shouldIndexRegionalPage(5)).toBe(true);
  });

  it("INDEXABLE=true + threshold=10 → só indexa com adsCount >= 10", () => {
    setIndexable("true");
    setMinAds("10");
    expect(shouldIndexRegionalPage(0)).toBe(false);
    expect(shouldIndexRegionalPage(9)).toBe(false);
    expect(shouldIndexRegionalPage(10)).toBe(true);
    expect(shouldIndexRegionalPage(50)).toBe(true);
  });

  it("INDEXABLE=true + threshold ausente → indexa sem restrição", () => {
    setIndexable("true");
    expect(shouldIndexRegionalPage(0)).toBe(true);
    expect(shouldIndexRegionalPage(7)).toBe(true);
  });

  it("adsCount inválido tratado como 0 (defesa)", () => {
    setIndexable("true");
    setMinAds("5");
    // @ts-expect-error testando coerção defensiva
    expect(shouldIndexRegionalPage(undefined)).toBe(false);
    // @ts-expect-error testando coerção defensiva
    expect(shouldIndexRegionalPage(null)).toBe(false);
    expect(shouldIndexRegionalPage(NaN)).toBe(false);
  });
});
