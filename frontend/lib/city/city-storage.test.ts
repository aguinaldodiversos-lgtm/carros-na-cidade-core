// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  CITY_STORAGE_KEY,
  CITY_USER_SET_KEY,
  discardStoredCityIfAbsent,
  isCityRefSelfConsistent,
  normalizeCityRefForStorage,
  readCityFromLocalStorage,
  writeCityToLocalStorage,
} from "./city-storage";

/**
 * Estado de cidade persistido no cliente.
 *
 * Dois defeitos cobertos aqui:
 *   1. slug e rótulo dessincronizados (caso real: slug `altaneira-ce` com
 *      rótulo "São Paulo (SP)" — a UI mostrava um lugar e a navegação ia para
 *      outro, que passou a dar 404);
 *   2. cidade que sai do conjunto público (perdeu o último anúncio) e continua
 *      guardada no cliente.
 */

const WIZARD_KEY = "carros-na-cidade:new-ad-wizard:v3";
const WIZARD_VALUE = '{"step":3,"brandLabel":"Jeep"}';

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

const ATIBAIA = { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP", label: "Atibaia (SP)" };

beforeEach(() => {
  installLocalStorage();
  // Rascunho do wizard presente em TODOS os testes: nada aqui pode perdê-lo.
  window.localStorage.setItem(WIZARD_KEY, WIZARD_VALUE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("coerência interna do registro", () => {
  it("aceita registro cujo slug termina na UF declarada", () => {
    expect(isCityRefSelfConsistent(ATIBAIA)).toBe(true);
    expect(
      isCityRefSelfConsistent({
        slug: "sao-jose-dos-campos-sp",
        name: "São José dos Campos",
        state: "SP",
      })
    ).toBe(true);
    // Pontuação divergente entre nome e slug não pode reprovar.
    expect(
      isCityRefSelfConsistent({
        slug: "santa-barbara-doeste-sp",
        name: "Santa Bárbara d'Oeste",
        state: "SP",
      })
    ).toBe(true);
  });

  it("rejeita o caso real observado em produção", () => {
    // Slug de Altaneira-CE com rótulo de São Paulo-SP.
    expect(
      isCityRefSelfConsistent({
        slug: "altaneira-ce",
        name: "São Paulo",
        state: "SP",
        label: "São Paulo (SP)",
      })
    ).toBe(false);
  });

  it("rejeita nome de outra cidade mesmo com a UF batendo", () => {
    // Só a checagem de UF deixaria isto passar: o cabeçalho mostraria
    // "São Paulo (SP)" enquanto a navegação usa atibaia-sp.
    expect(isCityRefSelfConsistent({ slug: "atibaia-sp", name: "São Paulo", state: "SP" })).toBe(
      false
    );
  });

  it("rejeita registro sem slug, sem UF ou com slug sem sufixo", () => {
    expect(isCityRefSelfConsistent({ slug: "", state: "SP" })).toBe(false);
    expect(isCityRefSelfConsistent({ slug: "atibaia-sp", state: "" })).toBe(false);
    expect(isCityRefSelfConsistent({ slug: "atibaia", state: "SP" })).toBe(false);
    expect(isCityRefSelfConsistent(null)).toBe(false);
  });
});

describe("rótulo é derivado, nunca copiado", () => {
  it("ignora label divergente enviado pelo chamador", () => {
    const out = normalizeCityRefForStorage({ ...ATIBAIA, label: "Rótulo Errado (ZZ)" });
    expect(out?.label).toBe("Atibaia (SP)");
  });

  it("slug e rótulo nunca divergem após escrita", () => {
    writeCityToLocalStorage({ ...ATIBAIA, label: "São Paulo (SP)" });
    const stored = readCityFromLocalStorage();
    expect(stored?.slug).toBe("atibaia-sp");
    expect(stored?.label).toBe("Atibaia (SP)");
  });

  it("normaliza caixa do slug e da UF", () => {
    const out = normalizeCityRefForStorage({ ...ATIBAIA, slug: "ATIBAIA-SP", state: "sp" });
    expect(out?.slug).toBe("atibaia-sp");
    expect(out?.state).toBe("SP");
  });
});

describe("escrita incoerente é barrada na origem", () => {
  it("não persiste registro com slug de uma cidade e UF de outra", () => {
    writeCityToLocalStorage({
      id: 9,
      slug: "altaneira-ce",
      name: "São Paulo",
      state: "SP",
      label: "São Paulo (SP)",
    });
    expect(window.localStorage.getItem(CITY_STORAGE_KEY)).toBeNull();
  });

  it("registro incoerente já gravado é descartado na leitura", () => {
    // Simula o estado corrompido que existe hoje em navegadores reais.
    window.localStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "altaneira-ce", name: "São Paulo", state: "SP" })
    );
    expect(readCityFromLocalStorage()).toBeNull();
  });

  it("escrita válida persiste normalmente", () => {
    writeCityToLocalStorage(ATIBAIA, { userConfirmed: true });
    expect(readCityFromLocalStorage()?.slug).toBe("atibaia-sp");
    expect(window.localStorage.getItem(CITY_USER_SET_KEY)).toBe("1");
  });
});

describe("cidade fora do conjunto público é descartada", () => {
  const conjunto = new Set(["atibaia-sp"]);
  const isPublic = (slug: string) => conjunto.has(slug);

  it("descarta cidade que perdeu o último anúncio", () => {
    writeCityToLocalStorage({
      id: 2,
      slug: "coribe-ba",
      name: "Coribe",
      state: "BA",
      label: "Coribe (BA)",
    });
    expect(readCityFromLocalStorage()?.slug).toBe("coribe-ba");

    expect(discardStoredCityIfAbsent(isPublic)).toBe(true);
    expect(readCityFromLocalStorage()).toBeNull();
  });

  it("mantém cidade que segue no conjunto", () => {
    writeCityToLocalStorage(ATIBAIA);
    expect(discardStoredCityIfAbsent(isPublic)).toBe(false);
    expect(readCityFromLocalStorage()?.slug).toBe("atibaia-sp");
  });

  it("sem cidade guardada, não faz nada", () => {
    expect(discardStoredCityIfAbsent(isPublic)).toBe(false);
  });

  it("nome divergente é descartado mesmo com o slug no conjunto", () => {
    window.localStorage.setItem(
      CITY_STORAGE_KEY,
      JSON.stringify({ slug: "atibaia-sp", name: "São Paulo", state: "SP" })
    );
    // `readCityFromLocalStorage` já devolve null, então não há o que descartar;
    // o efeito prático (voltar ao padrão) é o mesmo.
    expect(readCityFromLocalStorage()).toBeNull();
  });
});

describe("o rascunho do wizard sobrevive a tudo", () => {
  const casos: Array<[string, () => void]> = [
    ["descarte por cidade ausente", () => void discardStoredCityIfAbsent(() => false)],
    ["escrita rejeitada", () => writeCityToLocalStorage({ slug: "x-ce", state: "SP" } as never)],
    ["leitura de registro corrompido", () => void readCityFromLocalStorage()],
  ];

  for (const [nome, acao] of casos) {
    it(`preserva o rascunho após ${nome}`, () => {
      writeCityToLocalStorage({
        id: 2,
        slug: "coribe-ba",
        name: "Coribe",
        state: "BA",
        label: "Coribe (BA)",
      });
      acao();
      expect(window.localStorage.getItem(WIZARD_KEY)).toBe(WIZARD_VALUE);
    });
  }

  it("o descarte remove SÓ as duas chaves de cidade", () => {
    writeCityToLocalStorage(ATIBAIA, { userConfirmed: true });
    window.localStorage.setItem("outra-chave-qualquer", "valor");

    discardStoredCityIfAbsent(() => false);

    expect(window.localStorage.getItem(CITY_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CITY_USER_SET_KEY)).toBeNull();
    expect(window.localStorage.getItem(WIZARD_KEY)).toBe(WIZARD_VALUE);
    expect(window.localStorage.getItem("outra-chave-qualquer")).toBe("valor");
  });
});
