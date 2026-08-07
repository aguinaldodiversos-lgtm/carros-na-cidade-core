// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetCitySetSnapshot,
  decideCityExistenceAction,
  decideUfExistenceAction,
  extractCityScopedMatch,
  extractUfScopedMatch,
  fetchPublicCitySet,
} from "./city-existence-gate";
import {
  __resetAdSnapshot,
  decideAdAliasRedirect,
  decideAdDetailMiddlewareAction,
  validateAdIdentifier,
} from "./ad-detail-gate";
import { GateSnapshotStore } from "./gate-snapshot";

/**
 * P0 — "não consegui verificar" NUNCA pode virar página pública.
 *
 * ── O incidente que originou esta suíte ──────────────────────────────────────
 * Medido em build de produção local (2026-08-06): dois builds do MESMO código,
 * diferindo apenas na presença de `INTERNAL_API_TOKEN` no ambiente de BUILD,
 * produziam `/carros-em/braganca-paulista-sp` respondendo 404 (variável
 * presente) ou 200 (ausente). O Next inlina `process.env` no bundle do
 * middleware em tempo de build; sem a variável, o gate caía em
 * `pass-unavailable` e deixava passar.
 *
 * Duas causas independentes, ambas corrigidas:
 *   1. o gate EXIGIA um token que nunca foi autorização — se recusava a tentar
 *      uma chamada que teria funcionado;
 *   2. indisponibilidade era tratada como permissão.
 *
 * Esta suíte cobre os sete cenários pedidos: atibaia-sp, braganca-paulista-sp,
 * cidade inexistente, cidade sem estoque, backend indisponível, token ausente
 * e token inválido.
 */

const CIDADE_COM_ESTOQUE = "atibaia-sp";
const CIDADE_SEM_ESTOQUE = "braganca-paulista-sp";
const CIDADE_INEXISTENTE = "cidade-inventada-sp";

/** Conjunto: só Atibaia tem anúncio ativo. Bragança está fora. */
const PAYLOAD_OK = {
  data: {
    cities: { [CIDADE_COM_ESTOQUE]: 19 },
    ufs: { sp: 19 },
    total: 1,
    existsMinAds: 1,
    indexMinAds: 3,
  },
};

const API = "https://api.test";

function okFetch() {
  return vi.fn(async () => ({ status: 200, json: async () => PAYLOAD_OK }));
}

function downFetch() {
  return vi.fn(async () => {
    throw new Error("ECONNREFUSED");
  });
}

function statusFetch(status: number) {
  return vi.fn(async () => ({ status, json: async () => ({}) }));
}

async function cityVerdict(slug: string, fetchImpl: unknown, token = "tok") {
  const set = await fetchPublicCitySet({ apiBase: API, token, fetchImpl: fetchImpl as never });
  const match = extractCityScopedMatch(`/carros-em/${slug}`);
  return decideCityExistenceAction(match!, set);
}

beforeEach(() => {
  __resetCitySetSnapshot();
  __resetAdSnapshot();
});

describe("cenário: backend saudável", () => {
  it.each([
    [CIDADE_COM_ESTOQUE, "pass-exists"],
    [CIDADE_SEM_ESTOQUE, "block-not-found"],
    [CIDADE_INEXISTENTE, "block-not-found"],
  ])("%s → %s", async (slug, esperado) => {
    expect((await cityVerdict(slug, okFetch())).kind).toBe(esperado);
  });

  it("cidade sem estoque e cidade inexistente dão o MESMO veredito", async () => {
    const semEstoque = await cityVerdict(CIDADE_SEM_ESTOQUE, okFetch());
    const inexistente = await cityVerdict(CIDADE_INEXISTENTE, okFetch());
    expect(semEstoque.kind).toBe(inexistente.kind);
  });
});

describe("cenário: TOKEN AUSENTE — a causa raiz do incidente", () => {
  it("a chamada acontece mesmo assim", async () => {
    const fetchImpl = okFetch();
    await cityVerdict(CIDADE_COM_ESTOQUE, fetchImpl, "");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("o gate continua decidindo corretamente: cidade com estoque passa", async () => {
    expect((await cityVerdict(CIDADE_COM_ESTOQUE, okFetch(), "")).kind).toBe("pass-exists");
  });

  /**
   * O caso EXATO do incidente. Sem token, esta cidade respondia 200; a
   * expectativa correta é 404, porque ela não tem anúncio ativo.
   */
  it("cidade SEM estoque continua 404 — era aqui que dava 200", async () => {
    expect((await cityVerdict(CIDADE_SEM_ESTOQUE, okFetch(), "")).kind).toBe("block-not-found");
  });

  it("cidade inexistente continua 404", async () => {
    expect((await cityVerdict(CIDADE_INEXISTENTE, okFetch(), "")).kind).toBe("block-not-found");
  });
});

describe("cenário: TOKEN INVÁLIDO", () => {
  it("também não impede a chamada nem altera o veredito", async () => {
    const fetchImpl = okFetch();
    const veredito = await cityVerdict(CIDADE_SEM_ESTOQUE, fetchImpl, "token-errado");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(veredito.kind).toBe("block-not-found");
  });

  it("se o backend REJEITAR (401/403), vira indisponibilidade — não permissão", async () => {
    // Rejeição diz "não sei", e não sei nunca pode virar 200 nem 404.
    for (const status of [401, 403]) {
      __resetCitySetSnapshot();
      const veredito = await cityVerdict(CIDADE_COM_ESTOQUE, statusFetch(status), "token-errado");
      expect(veredito.kind).toBe("block-unavailable");
    }
  });
});

describe("cenário: BACKEND INDISPONÍVEL, sem estado confiável → 503", () => {
  it.each([CIDADE_COM_ESTOQUE, CIDADE_SEM_ESTOQUE, CIDADE_INEXISTENTE])(
    "%s → block-unavailable, nunca pass",
    async (slug) => {
      const veredito = await cityVerdict(slug, downFetch());
      expect(veredito.kind).toBe("block-unavailable");
    }
  );

  it.each([500, 502, 503, 429])("status %s do backend também não libera", async (status) => {
    __resetCitySetSnapshot();
    expect((await cityVerdict(CIDADE_COM_ESTOQUE, statusFetch(status))).kind).toBe(
      "block-unavailable"
    );
  });

  it("sem BACKEND_API_URL não há sequer tentativa — e ainda assim não passa", async () => {
    const fetchImpl = okFetch();
    const set = await fetchPublicCitySet({ apiBase: "", token: "", fetchImpl: fetchImpl as never });
    const match = extractCityScopedMatch(`/carros-em/${CIDADE_COM_ESTOQUE}`);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(decideCityExistenceAction(match!, set).kind).toBe("block-unavailable");
  });
});

describe("cenário: BACKEND INDISPONÍVEL, COM snapshot → decide pelo snapshot", () => {
  async function comSnapshotDepoisCair(slug: string) {
    // 1ª chamada: backend saudável → grava snapshot.
    await fetchPublicCitySet({ apiBase: API, token: "tok", fetchImpl: okFetch() as never });
    // 2ª chamada: backend fora → deve cair no snapshot.
    const set = await fetchPublicCitySet({
      apiBase: API,
      token: "tok",
      fetchImpl: downFetch() as never,
    });
    const match = extractCityScopedMatch(`/carros-em/${slug}`);
    return { set, action: decideCityExistenceAction(match!, set) };
  }

  it("o resultado é `stale`, não `unavailable`", async () => {
    const { set } = await comSnapshotDepoisCair(CIDADE_COM_ESTOQUE);
    expect(set.kind).toBe("stale");
  });

  it("cidade com estoque continua passando durante o blip", async () => {
    const { action } = await comSnapshotDepoisCair(CIDADE_COM_ESTOQUE);
    expect(action).toMatchObject({ kind: "pass-exists", source: "snapshot" });
  });

  /** O snapshot NÃO relaxa a regra — ele só evita o 503. */
  it("cidade sem estoque continua 404 durante o blip", async () => {
    const { action } = await comSnapshotDepoisCair(CIDADE_SEM_ESTOQUE);
    expect(action).toMatchObject({ kind: "block-not-found", source: "snapshot" });
  });

  it("cidade inexistente continua 404 durante o blip", async () => {
    const { action } = await comSnapshotDepoisCair(CIDADE_INEXISTENTE);
    expect(action.kind).toBe("block-not-found");
  });

  it("snapshot EXPIRADO volta a 503 — snapshot velho é palpite, não estado", async () => {
    await fetchPublicCitySet({
      apiBase: API,
      token: "tok",
      fetchImpl: okFetch() as never,
      now: 0,
    });
    const set = await fetchPublicCitySet({
      apiBase: API,
      token: "tok",
      fetchImpl: downFetch() as never,
      now: 10_000,
      snapshotMaxAgeMs: 1_000,
    });
    expect(set.kind).toBe("unavailable");
  });
});

describe("gate de UF — mesma política", () => {
  async function ufVerdict(uf: string, fetchImpl: unknown) {
    const set = await fetchPublicCitySet({
      apiBase: API,
      token: "tok",
      fetchImpl: fetchImpl as never,
    });
    const match = extractUfScopedMatch(`/carros-usados/${uf}`);
    return decideUfExistenceAction(match!, set);
  }

  it("UF com estoque passa; UF sem estoque 404", async () => {
    expect((await ufVerdict("sp", okFetch())).kind).toBe("pass-exists");
    __resetCitySetSnapshot();
    expect((await ufVerdict("ce", okFetch())).kind).toBe("block-not-found");
  });

  it("backend fora sem snapshot → 503, nunca pass", async () => {
    expect((await ufVerdict("sp", downFetch())).kind).toBe("block-unavailable");
  });
});

describe("alias /anuncios/[identifier] — nunca volta a 200", () => {
  const ALIAS = { route: "anuncios", identifier: "onix-2025-123" } as const;
  const PAYLOAD_AD = { data: { id: 123, slug: "onix-2025-123" } };

  function adOkFetch() {
    return vi.fn(async () => ({ status: 200, json: async () => PAYLOAD_AD }));
  }

  it("backend saudável → 308 para a canônica", async () => {
    const v = await validateAdIdentifier(ALIAS.identifier, {
      apiBase: API,
      token: "tok",
      readCanonicalSlug: true,
      fetchImpl: adOkFetch() as never,
    });
    expect(decideAdAliasRedirect(ALIAS, v)).toEqual({
      kind: "redirect-permanent",
      pathname: "/veiculo/onix-2025-123",
    });
  });

  it("token ausente NÃO impede o 308 — o endpoint é público", async () => {
    const fetchImpl = adOkFetch();
    const v = await validateAdIdentifier(ALIAS.identifier, {
      apiBase: API,
      token: "",
      readCanonicalSlug: true,
      fetchImpl: fetchImpl as never,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(decideAdAliasRedirect(ALIAS, v).kind).toBe("redirect-permanent");
  });

  /**
   * Com snapshot, o alias segue emitindo 308 durante o blip. Sem esta camada
   * ele cairia no `page.tsx`, que responde 200 + `<meta http-equiv="refresh">`
   * — medido em produção local e o motivo de o redirect ter ido para o
   * middleware.
   */
  it("backend cai DEPOIS de confirmar → 308 pelo snapshot, não 200", async () => {
    await validateAdIdentifier(ALIAS.identifier, {
      apiBase: API,
      token: "tok",
      readCanonicalSlug: true,
      fetchImpl: adOkFetch() as never,
    });

    const v = await validateAdIdentifier(ALIAS.identifier, {
      apiBase: API,
      token: "tok",
      readCanonicalSlug: true,
      fetchImpl: downFetch() as never,
    });

    expect(v.kind).toBe("stale");
    expect(decideAdAliasRedirect(ALIAS, v)).toEqual({
      kind: "redirect-permanent",
      pathname: "/veiculo/onix-2025-123",
    });
  });

  it("backend fora SEM snapshot → 503, nunca 200 nem meta refresh", async () => {
    const v = await validateAdIdentifier(ALIAS.identifier, {
      apiBase: API,
      token: "tok",
      readCanonicalSlug: true,
      fetchImpl: downFetch() as never,
    });
    expect(decideAdDetailMiddlewareAction(v).kind).toBe("block-unavailable");
    expect(decideAdAliasRedirect(ALIAS, v).kind).toBe("pass");
  });

  it("anúncio inexistente continua 404 (não vira 503)", async () => {
    const v = await validateAdIdentifier("nao-existe", {
      apiBase: API,
      token: "tok",
      readCanonicalSlug: true,
      fetchImpl: statusFetch(404) as never,
    });
    expect(decideAdDetailMiddlewareAction(v).kind).toBe("block-not-found");
  });

  it("404 NUNCA vira snapshot — crawler varrendo slugs não enche a memória", async () => {
    for (let i = 0; i < 50; i += 1) {
      await validateAdIdentifier(`inventado-${i}`, {
        apiBase: API,
        token: "tok",
        fetchImpl: statusFetch(404) as never,
      });
    }
    // Se 404 virasse snapshot, a chamada abaixo devolveria `stale`.
    const v = await validateAdIdentifier("inventado-0", {
      apiBase: API,
      token: "tok",
      fetchImpl: downFetch() as never,
    });
    expect(v.kind).toBe("unavailable");
  });
});

describe("GateSnapshotStore — teto e expiração", () => {
  it("respeita o teto despejando o mais antigo", () => {
    const store = new GateSnapshotStore<number>(2);
    store.remember("a", 1, 0);
    store.remember("b", 2, 1);
    store.remember("c", 3, 2);

    expect(store.size).toBe(2);
    expect(store.lookup("a", 3, 1000).kind).toBe("miss");
    expect(store.lookup("c", 3, 1000).kind).toBe("hit");
  });

  it("reinserir renova a posição (LRU, não FIFO puro)", () => {
    const store = new GateSnapshotStore<number>(2);
    store.remember("a", 1, 0);
    store.remember("b", 2, 1);
    store.remember("a", 9, 2); // 'a' volta ao fim
    store.remember("c", 3, 3); // despeja 'b'

    expect(store.lookup("a", 4, 1000).kind).toBe("hit");
    expect(store.lookup("b", 4, 1000).kind).toBe("miss");
  });

  it("entrada além da idade máxima é `expired`, não `hit`", () => {
    const store = new GateSnapshotStore<number>(4);
    store.remember("a", 1, 0);
    expect(store.lookup("a", 500, 1000).kind).toBe("hit");
    expect(store.lookup("a", 5000, 1000).kind).toBe("expired");
  });
});
