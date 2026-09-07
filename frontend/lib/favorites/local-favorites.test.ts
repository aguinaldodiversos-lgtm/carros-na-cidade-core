// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Homologação pré-lançamento — GRUPO E (VEH-05, VEH-06, VEH-07).
 *
 * Motivo de existir: o botão de favoritar aparece em 8 variantes de card e
 * `AdCard.test.tsx` prova que ele é RENDERIZADO — nada provava que ele
 * FUNCIONA. O armazenamento é 100% local (`localStorage`); não existe rota de
 * favoritos no backend. Isso torna a persistência entre recargas o contrato
 * inteiro da funcionalidade, e é exatamente o que estava sem teste.
 *
 * IDs cobertos:
 *   VEH-05  adicionar favorito
 *   VEH-06  remover favorito
 *   VEH-07  persistência após reload
 *
 * "Reload" aqui é `vi.resetModules()` + reimport: o módulo perde todo estado
 * em memória e precisa reler o `localStorage`, que é o que o navegador faz.
 * Um cache em módulo faria o teste passar sem persistência real — por isso a
 * releitura é feita de um import NOVO, não do mesmo binding.
 */

const STORAGE_KEY = "cnc:favorite-ad-slugs";

/**
 * O jsdom desta versão não expõe um `localStorage` utilizável (falta `clear`);
 * o repositório já resolve isso instalando um duplo — ver
 * `lib/city/city-storage.test.ts`. Seguimos a mesma convenção: um Map por
 * teste, sem estado vazando de um para o outro.
 */
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
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

async function carregarModulo() {
  vi.resetModules();
  return import("./local-favorites");
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VEH-05 — adicionar favorito", () => {
  it("toggle marca o anúncio e devolve true (novo estado)", async () => {
    const { toggleFavoriteSlug, isFavoriteSlug } = await carregarModulo();

    expect(isFavoriteSlug("civic-2020-atibaia-sp")).toBe(false);
    expect(toggleFavoriteSlug("civic-2020-atibaia-sp")).toBe(true);
    expect(isFavoriteSlug("civic-2020-atibaia-sp")).toBe(true);
  });

  it("grava no localStorage sob a chave canônica", async () => {
    const { toggleFavoriteSlug } = await carregarModulo();

    toggleFavoriteSlug("civic-2020-atibaia-sp");

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([
      "civic-2020-atibaia-sp",
    ]);
  });

  it("favoritar dois anúncios guarda os dois (não sobrescreve o anterior)", async () => {
    const { toggleFavoriteSlug, getFavoriteSlugs } = await carregarModulo();

    toggleFavoriteSlug("civic-2020-atibaia-sp");
    toggleFavoriteSlug("onix-2019-atibaia-sp");

    expect(getFavoriteSlugs().sort()).toEqual(["civic-2020-atibaia-sp", "onix-2019-atibaia-sp"]);
  });

  it("favoritar o MESMO slug duas vezes não duplica — desliga na segunda", async () => {
    const { toggleFavoriteSlug, getFavoriteSlugs } = await carregarModulo();

    toggleFavoriteSlug("civic-2020-atibaia-sp");
    toggleFavoriteSlug("civic-2020-atibaia-sp");

    expect(getFavoriteSlugs()).toEqual([]);
  });

  it("slug vazio é ignorado (não cria entrada fantasma)", async () => {
    const { toggleFavoriteSlug, getFavoriteSlugs, isFavoriteSlug } = await carregarModulo();

    expect(toggleFavoriteSlug("")).toBe(false);
    expect(isFavoriteSlug("")).toBe(false);
    expect(getFavoriteSlugs()).toEqual([]);
  });

  it("emite o evento que sincroniza os outros cards da página", async () => {
    const { toggleFavoriteSlug } = await carregarModulo();
    const ouvinte = vi.fn();
    window.addEventListener("cnc-favorites-changed", ouvinte);

    toggleFavoriteSlug("civic-2020-atibaia-sp");

    expect(ouvinte).toHaveBeenCalledTimes(1);
    window.removeEventListener("cnc-favorites-changed", ouvinte);
  });
});

describe("VEH-06 — remover favorito", () => {
  it("toggle no favorito existente devolve false e apaga só ele", async () => {
    const { toggleFavoriteSlug, isFavoriteSlug, getFavoriteSlugs } = await carregarModulo();

    toggleFavoriteSlug("civic-2020-atibaia-sp");
    toggleFavoriteSlug("onix-2019-atibaia-sp");

    expect(toggleFavoriteSlug("civic-2020-atibaia-sp")).toBe(false);
    expect(isFavoriteSlug("civic-2020-atibaia-sp")).toBe(false);
    expect(getFavoriteSlugs()).toEqual(["onix-2019-atibaia-sp"]);
  });

  it("remover o último favorito deixa a lista vazia (e não uma lista com vazio)", async () => {
    const { toggleFavoriteSlug, getFavoriteSlugs } = await carregarModulo();

    toggleFavoriteSlug("civic-2020-atibaia-sp");
    toggleFavoriteSlug("civic-2020-atibaia-sp");

    expect(getFavoriteSlugs()).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([]);
  });
});

describe("VEH-07 — persistência após reload", () => {
  it("o favorito sobrevive a um reload (módulo recarregado relê o storage)", async () => {
    const primeiro = await carregarModulo();
    primeiro.toggleFavoriteSlug("civic-2020-atibaia-sp");

    const depoisDoReload = await carregarModulo();

    expect(depoisDoReload.isFavoriteSlug("civic-2020-atibaia-sp")).toBe(true);
    expect(depoisDoReload.getFavoriteSlugs()).toEqual(["civic-2020-atibaia-sp"]);
  });

  it("a REMOÇÃO também persiste — o favorito não ressuscita no reload", async () => {
    const primeiro = await carregarModulo();
    primeiro.toggleFavoriteSlug("civic-2020-atibaia-sp");
    primeiro.toggleFavoriteSlug("civic-2020-atibaia-sp");

    const depoisDoReload = await carregarModulo();

    expect(depoisDoReload.isFavoriteSlug("civic-2020-atibaia-sp")).toBe(false);
  });

  it("storage corrompido não derruba a página — devolve lista vazia", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{não é json");
    const { getFavoriteSlugs, isFavoriteSlug } = await carregarModulo();

    expect(getFavoriteSlugs()).toEqual([]);
    expect(isFavoriteSlug("civic-2020-atibaia-sp")).toBe(false);
  });

  it("storage com tipo errado (objeto em vez de array) também degrada para vazio", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ civic: true }));
    const { getFavoriteSlugs } = await carregarModulo();

    expect(getFavoriteSlugs()).toEqual([]);
  });

  it("entradas não-string dentro do array são descartadas, o resto sobrevive", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["civic-2020-atibaia-sp", 42, null]));
    const { getFavoriteSlugs } = await carregarModulo();

    expect(getFavoriteSlugs()).toEqual(["civic-2020-atibaia-sp"]);
  });

  it("navegação privada (localStorage lança) não quebra o clique", async () => {
    const { toggleFavoriteSlug } = await carregarModulo();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(() => toggleFavoriteSlug("civic-2020-atibaia-sp")).not.toThrow();
  });
});
