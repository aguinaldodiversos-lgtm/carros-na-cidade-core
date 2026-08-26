// O RESUMO do hub de oportunidades do lojista.
//
// ════════════════════════════════════════════════════════════════════════════
// O QUE ESTE ARQUIVO PROVA
// ════════════════════════════════════════════════════════════════════════════
// Que os quatro números do topo da tela são CONTADOS, e contados no escopo
// certo: cidade da loja para os dois feeds, e a própria loja para os negócios em
// andamento. E que a variação percentual só existe quando há base para ela.
//
// ════════════════════════════════════════════════════════════════════════════
// O FAKE RE-IMPLEMENTA AS JANELAS; NÃO DEVOLVE LINHA PRONTA
// ════════════════════════════════════════════════════════════════════════════
// `fakeQuery` lê a cidade do PARÂMETRO e as janelas do RELÓGIO, e conta em cima
// de arrays. Um mock que respondesse `{ rows: [{ total: 7 }] }` para qualquer
// SELECT passaria mesmo se alguém apagasse `WHERE pi.city_id = $1` do
// repository — ou seja, provaria que o banco foi chamado, não que o escopo
// existe. Aqui, apagar a cláusula faz o teste de vazamento entre cidades falhar.
//
// As duas janelas (`last_7d` e `previous_7d`) também são re-implementadas, e é
// isso que permite ao teste da tendência exercitar a conta real do service em
// vez de um número escolhido a dedo.
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const ATIBAIA = 1;
const BRAGANCA = 2;
const STORE_A = 100;
const STORE_B = 200;
const DEALER = "20";

/** Estado do banco de mentira. Reiniciado a cada teste. */
const db = {
  purchaseIntents: [],
  saleRequests: [],
  /** Ofertas selecionadas: `{ id, advertiser_id }`. */
  saleRequestOffers: [],
};

const daysAgo = (days) => new Date(NOW - days * 24 * 3600_000).toISOString();

/**
 * Conta as quatro janelas de uma coleção.
 *
 * `activeFilter` é o predicado do TOTAL (que difere entre os dois feeds:
 * "ativa e não vencida" num, "recebendo propostas" no outro). As três janelas de
 * tempo são iguais nos dois — e é por isso que moram aqui, num lugar só.
 */
function countWindows(rows, { activeFilter, dateOf }) {
  const at = (row) => Date.parse(dateOf(row));
  const startOfToday = Date.parse("2026-08-26T00:00:00.000Z");

  return {
    total: rows.filter(activeFilter).length,
    last_7d: rows.filter((row) => at(row) >= NOW - 7 * 86400_000).length,
    previous_7d: rows.filter(
      (row) => at(row) >= NOW - 14 * 86400_000 && at(row) < NOW - 7 * 86400_000
    ).length,
    today: rows.filter((row) => at(row) >= startOfToday).length,
  };
}

function fakeQuery(sql, params = []) {
  const text = String(sql).replace(/\s+/g, " ").trim();

  // --- compradores ativos ---------------------------------------------------
  if (/FROM purchase_intents pi WHERE pi\.city_id = \$1/i.test(text)) {
    const [cityId] = params;
    const rows = db.purchaseIntents.filter((row) => String(row.city_id) === String(cityId));
    return {
      rows: [
        countWindows(rows, {
          activeFilter: (row) => row.status === "active" && Date.parse(row.expires_at) > NOW,
          dateOf: (row) => row.created_at,
        }),
      ],
      rowCount: 1,
    };
  }

  // --- veículos para avaliação ---------------------------------------------
  if (/FROM sale_requests sr WHERE sr\.city_id = \$1/i.test(text)) {
    const [cityId, openStatus] = params;
    const rows = db.saleRequests.filter((row) => String(row.city_id) === String(cityId));
    return {
      rows: [
        countWindows(rows, {
          activeFilter: (row) => row.status === openStatus,
          dateOf: (row) => row.created_at,
        }),
      ],
      rowCount: 1,
    };
  }

  // --- negócios em andamento ------------------------------------------------
  //
  // O JOIN com a oferta selecionada é re-implementado: é ele que amarra o
  // negócio à LOJA, e sem isso o teste de escopo por advertiser não teria como
  // falhar.
  if (/JOIN sale_request_offers sel ON sel\.id = sr\.selected_offer_id/i.test(text)) {
    const [cityId, advertiserId, statuses] = params;

    const rows = db.saleRequests.filter((row) => {
      if (String(row.city_id) !== String(cityId)) return false;
      if (!row.selected_offer_id) return false;
      if (!statuses.includes(row.status)) return false;

      const offer = db.saleRequestOffers.find(
        (item) => String(item.id) === String(row.selected_offer_id)
      );
      return offer != null && String(offer.advertiser_id) === String(advertiserId);
    });

    return {
      rows: [
        countWindows(rows, {
          activeFilter: () => true,
          dateOf: (row) => row.selected_offer_at,
        }),
      ],
      rowCount: 1,
    };
  }

  throw new Error(`query sem padrão no fake: ${text.slice(0, 120)}`);
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (callback) => callback({ query: (sql, params) => fakeQuery(sql, params) }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

/**
 * A resolução da loja é mockada — e SÓ ela.
 *
 * Ela tem suíte própria (`shared/account/dealer-store`), depende de `advertisers`
 * + `cities` e não é o que este arquivo existe para provar. O que continua REAL
 * aqui é toda a cadeia que importa para o resumo: rota → `authMiddleware` →
 * `requireDealerAccount` → service → repository → SQL.
 */
let storeResolution = {
  status: "ok",
  store: { advertiserId: STORE_A, cityId: ATIBAIA },
  stores: [],
};

vi.mock("../../src/shared/account/dealer-store.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    resolveDealerStoreSelection: async () => storeResolution,
  };
});

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => {
  const handler = (req, res, next) => {
    const asUser = req.headers["x-test-user"];
    if (!asUser) return res.status(401).json({ error: "unauth" });
    req.user = {
      id: String(asUser),
      role: "user",
      plan: "free",
      account_type: String(req.headers["x-test-account"] || "CPF"),
    };
    return next();
  };
  return { authMiddleware: handler, default: handler };
});

const summaryRoutes = (
  await import("../../src/modules/dealers/dealer-opportunities-summary.routes.js")
).default;
const { computeTrend } = await import(
  "../../src/modules/dealers/dealer-opportunities-summary.service.js"
);
const { errorHandler } = await import("../../src/shared/middlewares/error.middleware.js");

const BASE = "/api/account/opportunities/summary";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(BASE, summaryRoutes);
  app.use(errorHandler);
  return app;
}

const asDealer = (req, user = DEALER) =>
  req.set("x-test-user", user).set("x-test-account", "CNPJ");

function seedIntent({ cityId = ATIBAIA, createdDaysAgo = 1, status = "active", expiresInDays = 20 }) {
  db.purchaseIntents.push({
    city_id: cityId,
    status,
    created_at: daysAgo(createdDaysAgo),
    expires_at: new Date(NOW + expiresInDays * 86400_000).toISOString(),
  });
}

function seedSaleRequest({
  cityId = ATIBAIA,
  createdDaysAgo = 1,
  status = "receiving_offers",
  selectedOfferId = null,
  selectedDaysAgo = null,
}) {
  db.saleRequests.push({
    city_id: cityId,
    status,
    created_at: daysAgo(createdDaysAgo),
    selected_offer_id: selectedOfferId,
    selected_offer_at: selectedDaysAgo == null ? null : daysAgo(selectedDaysAgo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.purchaseIntents = [];
  db.saleRequests = [];
  db.saleRequestOffers = [];
  storeResolution = {
    status: "ok",
    store: { advertiserId: STORE_A, cityId: ATIBAIA },
    stores: [],
  };
});

// ============================================================================
describe("autorização", () => {
  it("sem sessão é 401", async () => {
    const response = await request(buildApp()).get(BASE);
    expect(response.status).toBe(401);
  });

  it("conta CPF é 403 — a área inteira é do lojista", async () => {
    const response = await request(buildApp())
      .get(BASE)
      .set("x-test-user", DEALER)
      .set("x-test-account", "CPF");

    expect(response.status).toBe(403);
  });

  it("loja sem cidade resolvida é 403, e não um resumo zerado", async () => {
    storeResolution = { status: "none", stores: [] };

    const response = await asDealer(request(buildApp()).get(BASE));

    // Zerado seria pior: o lojista leria "não há nada na minha cidade" quando o
    // problema é que a loja dele não tem cidade cadastrada.
    expect(response.status).toBe(403);
    expect(response.body.summary).toBeUndefined();
  });
});

// ============================================================================
describe("os quatro números são contados no escopo certo", () => {
  it("compradores ativos: só a cidade da loja, só ativas e não vencidas", async () => {
    seedIntent({ cityId: ATIBAIA });
    seedIntent({ cityId: ATIBAIA });
    // Encerrada e vencida NÃO entram no total — a lista também não as mostra.
    seedIntent({ cityId: ATIBAIA, status: "closed" });
    seedIntent({ cityId: ATIBAIA, expiresInDays: -1 });
    // Outra cidade: invisível.
    seedIntent({ cityId: BRAGANCA });

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.status).toBe(200);
    expect(response.body.summary.active_buyers.total).toBe(2);
  });

  it("veículos para avaliação: só `receiving_offers`, só a cidade da loja", async () => {
    seedSaleRequest({});
    seedSaleRequest({});
    seedSaleRequest({});
    seedSaleRequest({ status: "cancelled" });
    seedSaleRequest({ status: "offer_selected" });
    seedSaleRequest({ cityId: BRAGANCA });

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.body.summary.sale_requests.total).toBe(3);
  });

  it("negócios em andamento: só os que ESTA loja venceu", async () => {
    db.saleRequestOffers.push({ id: 11, advertiser_id: STORE_A });
    db.saleRequestOffers.push({ id: 22, advertiser_id: STORE_B });

    seedSaleRequest({ status: "offer_selected", selectedOfferId: 11, selectedDaysAgo: 2 });
    seedSaleRequest({ status: "handoff_failed", selectedOfferId: 11, selectedDaysAgo: 3 });
    // A loja concorrente venceu esta: não é negócio desta loja.
    seedSaleRequest({ status: "offer_selected", selectedOfferId: 22, selectedDaysAgo: 1 });
    // Sem seleção nenhuma.
    seedSaleRequest({});

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.body.summary.deals_in_progress.total).toBe(2);
  });

  it("novas hoje soma os DOIS produtos", async () => {
    seedIntent({ createdDaysAgo: 0 });
    seedIntent({ createdDaysAgo: 0 });
    seedSaleRequest({ createdDaysAgo: 0 });
    // Ontem não conta.
    seedIntent({ createdDaysAgo: 3 });
    seedSaleRequest({ createdDaysAgo: 3 });

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.body.summary.new_today.total).toBe(3);
  });

  it("o escopo por cidade não vaza — trocar a loja troca os números", async () => {
    seedIntent({ cityId: ATIBAIA });
    seedIntent({ cityId: BRAGANCA });
    seedIntent({ cityId: BRAGANCA });

    const first = await asDealer(request(buildApp()).get(BASE));
    expect(first.body.summary.active_buyers.total).toBe(1);

    storeResolution = {
      status: "ok",
      store: { advertiserId: STORE_B, cityId: BRAGANCA },
      stores: [],
    };

    const second = await asDealer(request(buildApp()).get(BASE));
    expect(second.body.summary.active_buyers.total).toBe(2);
  });
});

// ============================================================================
describe("a variação de 7 dias", () => {
  it("compara a janela recente com a ANTERIOR, e não com o total", async () => {
    // 4 nos últimos 7 dias, 2 nos 7 anteriores → +100%.
    for (const days of [1, 2, 3, 4]) seedIntent({ createdDaysAgo: days });
    for (const days of [9, 11]) seedIntent({ createdDaysAgo: days });

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.body.summary.active_buyers.trend).toEqual({
      percent: 100,
      direction: "up",
    });
  });

  it("queda vem com `direction: down` e percentual POSITIVO", async () => {
    for (const days of [1] ) seedIntent({ createdDaysAgo: days });
    for (const days of [9, 10, 11, 12]) seedIntent({ createdDaysAgo: days });

    const response = await asDealer(request(buildApp()).get(BASE));

    // 1 contra 4 → −75%. O sinal vive em `direction`; o número não é negativo,
    // para que a tela não precise lembrar de tirá-lo antes de escrever a frase.
    expect(response.body.summary.active_buyers.trend).toEqual({
      percent: 75,
      direction: "down",
    });
  });

  it("SEM base de comparação a variação é `null`, e nunca 0%", async () => {
    // Nada nos 7 dias anteriores: qualquer percentual seria divisão por zero, e
    // "+100%" descreveria 0 → 2 como crescimento de mercado.
    seedIntent({ createdDaysAgo: 1 });
    seedIntent({ createdDaysAgo: 2 });

    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.body.summary.active_buyers.total).toBe(2);
    expect(response.body.summary.active_buyers.trend).toBeNull();
  });

  it("banco vazio devolve zeros com variação nula — nunca um 500", async () => {
    const response = await asDealer(request(buildApp()).get(BASE));

    expect(response.status).toBe(200);
    for (const key of ["active_buyers", "sale_requests", "new_today", "deals_in_progress"]) {
      expect(response.body.summary[key], key).toEqual({ total: 0, trend: null });
    }
  });
});

// ============================================================================
describe("computeTrend", () => {
  it("base zero → null (é a regra que impede o '+100%' de 0 → 1)", () => {
    expect(computeTrend(1, 0)).toBeNull();
    expect(computeTrend(0, 0)).toBeNull();
  });

  it("estável vira `flat`, e não uma seta verde de 0%", () => {
    expect(computeTrend(5, 5)).toEqual({ percent: 0, direction: "flat" });
  });

  it("arredonda para uma casa decimal", () => {
    // 3 → 4 = +33,333…%
    expect(computeTrend(4, 3)).toEqual({ percent: 33.3, direction: "up" });
  });

  it("valor inválido não vira número", () => {
    expect(computeTrend(Number.NaN, 4)).toBeNull();
  });
});

// ============================================================================
describe("privacidade", () => {
  it("o payload é só contagem — nenhum id, nome ou identidade", async () => {
    seedIntent({});
    seedSaleRequest({});

    const response = await asDealer(request(buildApp()).get(BASE));

    /*
      A prova é ESTRUTURAL, e não uma varredura por palavras.

      A varredura por substring foi a primeira tentativa e ela se acusa sozinha:
      `active_buyers` contém "buyer". Uma lista de termos proibidos que precisa
      abrir exceção para o próprio contrato deixa de ser guarda e vira ruído — e
      no dia em que alguém acrescentasse `seller_name`, o termo "name" já estaria
      na lista de exceções.

      Percorrer as folhas prova mais: se TODA folha é número, direção conhecida
      ou `null`, então não existe texto nenhum no payload — nome, e-mail, CPF ou
      qualquer outra coisa. Um campo de identidade novo quebra isto sem que
      ninguém precise prever o nome dele.
    */
    const DIRECTIONS = ["up", "down", "flat"];

    const walk = (value, path) => {
      if (value === null) return;
      if (typeof value === "number") return;
      if (typeof value === "string") {
        expect(DIRECTIONS, `folha de texto inesperada em ${path}: ${value}`).toContain(value);
        return;
      }
      expect(typeof value, `folha inesperada em ${path}`).toBe("object");
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    };

    walk(response.body.summary, "summary");

    expect(Object.keys(response.body.summary).sort()).toEqual([
      "active_buyers",
      "deals_in_progress",
      "new_today",
      "sale_requests",
    ]);
  });
});
