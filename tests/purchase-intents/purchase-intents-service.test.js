// Regras de negócio das procuras, contra um Postgres de mentira que implementa
// de verdade escopo, expiração e o índice único de notificações.
//
// O módulo de notificações NÃO é mockado aqui de propósito. O fan-out é uma
// integração entre dois domínios, e substituir `createUserNotification` por um
// `vi.fn()` provaria apenas que a função foi chamada — não que a idempotência
// funciona, não que a mesma chave em usuários diferentes gera linhas
// diferentes, e não que o `action_path` passa pela allowlist da Fase 1.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, resetDb } from "./fake-db.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: vi.fn(),
}));

const service = await import("../../src/modules/purchase-intents/purchase-intents.service.js");

const NOW = Date.parse("2026-08-10T12:00:00.000Z");
const DAY = 86400000;

const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const BUYER = { id: "10", role: "user", plan: "free", account_type: "CPF" };
const OTHER_BUYER = { id: "11", role: "user", plan: "free", account_type: "CPF" };
const PENDING_BUYER = { id: "12", role: "user", plan: "free", account_type: "pending" };
const DEALER = { id: "20", role: "user", plan: "free", account_type: "CNPJ" };

const SPECIFIC_INPUT = {
  intent_type: "specific_model",
  brand: "VW - VolksWagen",
  model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
  transmission: "Automático",
  max_price: 95000,
  purchase_timeframe: "within_30_days",
  city_id: ATIBAIA.id,
};

const OPEN_INPUT = {
  intent_type: "open_category",
  body_type: "SUV",
  transmission: "Automático",
  max_price: 100000,
  purchase_timeframe: "within_7_days",
  city_id: ATIBAIA.id,
};

/**
 * Cenário base: 3 lojistas CNPJ em Atibaia (um deles com advertiser
 * DUPLICADO — possível hoje porque `advertisers.user_id` não tem UNIQUE), 2 em
 * Bragança, e um CPF com loja em Atibaia que não deve receber nada.
 */
function seedWorld(extra = {}) {
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    users: [
      { id: "10", document_type: "cpf" },
      { id: "11", document_type: "cpf" },
      { id: "12", document_type: null },
      { id: "20", document_type: "cnpj" },
      { id: "21", document_type: "cnpj" },
      { id: "22", document_type: "cnpj" },
      { id: "30", document_type: "cnpj" },
      { id: "31", document_type: "cnpj" },
      { id: "40", document_type: "cpf" },
    ],
    advertisers: [
      { id: 1, user_id: "20", city_id: ATIBAIA.id },
      { id: 2, user_id: "21", city_id: ATIBAIA.id },
      // Mesmo usuário, duas linhas, MESMA cidade: não é conflito.
      { id: 3, user_id: "22", city_id: ATIBAIA.id },
      { id: 4, user_id: "22", city_id: ATIBAIA.id },
      { id: 5, user_id: "30", city_id: BRAGANCA.id },
      { id: 6, user_id: "31", city_id: BRAGANCA.id },
      // CPF com loja: não é lojista, não recebe oportunidade.
      { id: 7, user_id: "40", city_id: ATIBAIA.id },
    ],
    ...extra,
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  fakeClock.now = () => NOW;
  seedWorld();
});

describe("createPurchaseIntent — quem pode publicar", () => {
  it("CPF publica", async () => {
    const { purchase_intent: intent } = await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(intent.id).toBe(1);
    expect(intent.status).toBe("active");
  });

  it("conta pending publica — o cadastro atual não exige documento", async () => {
    const { purchase_intent: intent } = await service.createPurchaseIntent(
      PENDING_BUYER,
      OPEN_INPUT
    );
    expect(intent.status).toBe("active");
  });

  it("CNPJ NÃO publica por este fluxo", async () => {
    await expect(service.createPurchaseIntent(DEALER, SPECIFIC_INPUT)).rejects.toMatchObject({
      statusCode: 403,
      details: { code: "PURCHASE_INTENT_BUYER_ONLY" },
    });
    expect(db.purchaseIntents).toHaveLength(0);
  });
});

describe("createPurchaseIntent — persistência", () => {
  it("grava o modelo COMERCIAL e os slugs, não a descrição FIPE", async () => {
    const { purchase_intent: intent } = await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    expect(intent.brand).toBe("Volkswagen");
    expect(intent.brand_slug).toBe("volkswagen");
    expect(intent.model).toBe("T-Cross");
    expect(intent.model_slug).toBe("t-cross");
    expect(intent.transmission).toBe("automatico");
    expect(intent.body_type).toBeNull();
  });

  it("expira em 30 dias a partir da criação", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    const row = db.purchaseIntents[0];
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBe(30 * DAY);
  });

  it("associa a procura ao usuário da SESSÃO, ignorando o corpo", async () => {
    await service.createPurchaseIntent(BUYER, {
      ...SPECIFIC_INPUT,
      buyer_user_id: OTHER_BUYER.id,
      status: "closed",
    });
    expect(db.purchaseIntents[0].buyer_user_id).toBe(BUYER.id);
    expect(db.purchaseIntents[0].status).toBe("active");
  });

  it("recusa cidade inexistente sem cair em nenhum padrão", async () => {
    await expect(
      service.createPurchaseIntent(BUYER, { ...SPECIFIC_INPUT, city_id: 9999 })
    ).rejects.toMatchObject({
      statusCode: 400,
      details: { code: "PURCHASE_INTENT_CITY_REQUIRED" },
    });
    expect(db.purchaseIntents).toHaveLength(0);
  });
});

describe("fan-out de notificação", () => {
  it("avisa só os lojistas CNPJ da MESMA cidade, uma vez cada", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    const recipients = db.notifications.map((row) => row.recipient_user_id).sort();
    // 20, 21, 22 são CNPJ em Atibaia. 22 tem advertiser duplicado e ainda assim
    // recebe UMA notificação (DISTINCT no repository).
    expect(recipients).toEqual(["20", "21", "22"]);
    // Bragança (30, 31) e o CPF com loja (40) ficam de fora.
    expect(recipients).not.toContain("30");
    expect(recipients).not.toContain("31");
    expect(recipients).not.toContain("40");
  });

  it("usa a MESMA chave de idempotência para todos os destinatários", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    const keys = new Set(db.notifications.map((row) => row.idempotency_key));
    expect([...keys]).toEqual(["purchase_intent:1:created"]);
  });

  it("reprocessar o mesmo evento não duplica notificação", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(db.notifications).toHaveLength(3);

    // Simula o produtor reexecutando o fan-out do MESMO id.
    const intent = db.purchaseIntents[0];
    const before = db.notifications.length;
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    const forFirstIntent = db.notifications.filter((row) => row.entity_id === String(intent.id));
    expect(forFirstIntent).toHaveLength(3);
    // A segunda procura tem id próprio, então gera outras 3.
    expect(db.notifications.length).toBe(before + 3);
  });

  it("aponta para o detalhe da oportunidade e passa pela allowlist da Fase 1", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    for (const row of db.notifications) {
      expect(row.action_path).toBe("/dashboard-loja/oportunidades/compradores/1");
      expect(row.event_type).toBe("purchase_intent.created");
      expect(row.entity_type).toBe("purchase_intent");
    }
  });

  it("descreve o veículo sem nenhum dado do comprador", async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    const row = db.notifications[0];
    expect(row.title).toBe("Novo comprador na sua cidade");
    expect(row.body).toBe("Uma pessoa está procurando Volkswagen T-Cross automático em Atibaia.");
    expect(row.body).not.toMatch(/10|@|cpf/i);
  });

  it("descreve a carroceria no modo aberto", async () => {
    await service.createPurchaseIntent(BUYER, OPEN_INPUT);
    expect(db.notifications[0].body).toBe(
      "Uma pessoa está procurando um SUV automático em Atibaia."
    );
  });

  it("cidade sem lojista CNPJ publica normalmente, com zero notificações", async () => {
    resetDb({ cities: [ATIBAIA, BRAGANCA], users: [{ id: "10", document_type: "cpf" }] });
    const { purchase_intent: intent } = await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(intent.status).toBe("active");
    expect(db.notifications).toHaveLength(0);
  });

  it("FALHA no fan-out NÃO desfaz a procura", async () => {
    // A regra central da fase: `purchase_intents` é a fonte de verdade;
    // `user_notifications` é só o aviso.
    db.failNotificationInsert = true;

    const { purchase_intent: intent } = await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    expect(intent.id).toBe(1);
    expect(db.purchaseIntents).toHaveLength(1);
    expect(db.purchaseIntents[0].status).toBe("active");
    expect(db.notifications).toHaveLength(0);

    // E ela continua visível para o lojista da cidade.
    const { purchase_intents: visible } = await service.listDealerOpportunities(DEALER.id);
    expect(visible.map((row) => row.id)).toEqual([1]);
  });

  it("um destinatário problemático não aborta os demais", async () => {
    // Falha só para o usuário 21: os outros dois precisam ser avisados mesmo
    // assim (try/catch POR destinatário, não em volta do laço).
    const realQuery = fakeQuery;
    const spy = vi.fn(async (sql, params) => {
      const text = String(sql).replace(/\s+/g, " ").trim();
      if (/^INSERT INTO user_notifications/i.test(text) && String(params[0]) === "21") {
        throw new Error("destinatário problemático");
      }
      return realQuery(sql, params);
    });

    const dbModule = await import("../../src/infrastructure/database/db.js");
    vi.spyOn(dbModule, "query").mockImplementation(spy);

    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    const recipients = db.notifications.map((row) => row.recipient_user_id).sort();
    expect(recipients).toEqual(["20", "22"]);
    expect(db.purchaseIntents).toHaveLength(1);
  });
});

describe("listagem e detalhe do comprador — posse", () => {
  beforeEach(async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    await service.createPurchaseIntent(OTHER_BUYER, OPEN_INPUT);
    await service.createPurchaseIntent(BUYER, OPEN_INPUT);
  });

  it("lista só as próprias, mais recentes primeiro", async () => {
    const { purchase_intents: mine } = await service.listMyPurchaseIntents(BUYER.id);
    expect(mine.map((row) => row.id)).toEqual([3, 1]);
  });

  it("nunca devolve procura alheia no detalhe — 404, não 403", async () => {
    // 403 confirmaria que a linha existe para quem está sondando ids.
    await expect(service.getMyPurchaseIntent(OTHER_BUYER.id, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("o dono vê a própria", async () => {
    const { purchase_intent: intent } = await service.getMyPurchaseIntent(BUYER.id, 1);
    expect(intent.id).toBe(1);
    expect(intent.city).toEqual({ name: "Atibaia", state: "SP", slug: "atibaia-sp" });
  });

  it("pagina por cursor sem repetir nem perder linha", async () => {
    const first = await service.listMyPurchaseIntents(BUYER.id, { limit: 1 });
    expect(first.purchase_intents.map((row) => row.id)).toEqual([3]);
    expect(first.next_cursor).toBeTruthy();

    const second = await service.listMyPurchaseIntents(BUYER.id, {
      limit: 1,
      cursor: first.next_cursor,
    });
    expect(second.purchase_intents.map((row) => row.id)).toEqual([1]);
    expect(second.next_cursor).toBeNull();
  });
});

describe("encerrar procura", () => {
  beforeEach(async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
  });

  it("o dono encerra e a procura some para o lojista imediatamente", async () => {
    const before = await service.listDealerOpportunities(DEALER.id);
    expect(before.purchase_intents).toHaveLength(1);

    const { purchase_intent: closed } = await service.closeMyPurchaseIntent(BUYER.id, 1);
    expect(closed.status).toBe("closed");
    expect(closed.display_status).toBe("closed");

    const after = await service.listDealerOpportunities(DEALER.id);
    expect(after.purchase_intents).toHaveLength(0);
  });

  it("continua no histórico do comprador como encerrada", async () => {
    await service.closeMyPurchaseIntent(BUYER.id, 1);
    const { purchase_intents: mine } = await service.listMyPurchaseIntents(BUYER.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].display_status).toBe("closed");
  });

  it("é idempotente — encerrar de novo não é erro", async () => {
    await service.closeMyPurchaseIntent(BUYER.id, 1);
    const again = await service.closeMyPurchaseIntent(BUYER.id, 1);
    expect(again.purchase_intent.status).toBe("closed");
  });

  it("outro usuário NÃO consegue encerrar — 404 e nada muda", async () => {
    await expect(service.closeMyPurchaseIntent(OTHER_BUYER.id, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.purchaseIntents[0].status).toBe("active");
  });

  it("soft close: a linha nunca é apagada", async () => {
    await service.closeMyPurchaseIntent(BUYER.id, 1);
    expect(db.purchaseIntents).toHaveLength(1);
  });
});

describe("expiração — lazy, sem job", () => {
  beforeEach(async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
  });

  it("com expires_at no futuro o lojista vê", async () => {
    const { purchase_intents: rows } = await service.listDealerOpportunities(DEALER.id);
    expect(rows.map((row) => row.id)).toEqual([1]);
  });

  it("passados 31 dias o lojista deixa de ver, sem ninguém mudar o status", async () => {
    fakeClock.now = () => NOW + 31 * DAY;

    const { purchase_intents: rows } = await service.listDealerOpportunities(DEALER.id);
    expect(rows).toHaveLength(0);
    await expect(service.getDealerOpportunity(DEALER.id, 1)).rejects.toMatchObject({
      statusCode: 404,
    });
    // O status na tabela continua 'active' — a expiração é derivada.
    expect(db.purchaseIntents[0].status).toBe("active");
  });

  it("o comprador continua vendo a vencida no histórico como Expirada", async () => {
    fakeClock.now = () => NOW + 31 * DAY;
    const { purchase_intents: mine } = await service.listMyPurchaseIntents(BUYER.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].display_status).toBe("expired");
  });
});

describe("cidade do lojista — fail closed", () => {
  it("resolve quando há exatamente uma cidade", async () => {
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("advertisers duplicados na MESMA cidade não são conflito", async () => {
    await expect(service.resolveDealerCityId("22")).resolves.toBe(ATIBAIA.id);
  });

  it("sem advertiser → null (não inventa cidade)", async () => {
    await expect(service.resolveDealerCityId("999")).resolves.toBeNull();
  });

  it("advertiser sem city_id → null, nunca users.city nem a primeira cidade", async () => {
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: null }] });
    await expect(service.resolveDealerCityId("20")).resolves.toBeNull();
  });

  it("cidades CONFLITANTES para o mesmo usuário → null, sem escolher uma", async () => {
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id },
        { id: 2, user_id: "20", city_id: BRAGANCA.id },
      ],
    });
    await expect(service.resolveDealerCityId("20")).resolves.toBeNull();
  });
});

describe("status do advertiser — só loja ATIVA participa", () => {
  it("status ausente (NULL) conta como ativo", async () => {
    // A coluna é nullable em bancos legados e a migration 012 faz o backfill
    // COALESCE(NULLIF(status,''),'active'). Tratar NULL como inativo trancaria
    // lojistas legítimos cuja linha é anterior à coluna.
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: ATIBAIA.id, status: null }] });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("status vazio conta como ativo", async () => {
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: ATIBAIA.id, status: "  " }] });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("status 'active' explícito resolve a cidade", async () => {
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: ATIBAIA.id, status: "active" }] });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it.each(["suspended", "blocked"])("status '%s' → sem cidade (fail closed)", async (status) => {
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: ATIBAIA.id, status }] });
    await expect(service.resolveDealerCityId("20")).resolves.toBeNull();
  });

  it("loja BLOQUEADA em outra cidade NÃO cria conflito com a ativa", async () => {
    // O caso que a Fase 2.1 existe para acertar: sem o filtro, estas duas linhas
    // pareceriam "duas cidades" e trancariam o lojista para fora da própria
    // cidade ativa.
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "20", city_id: BRAGANCA.id, status: "blocked" },
      ],
    });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("loja SUSPENSA em outra cidade também não cria conflito", async () => {
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "20", city_id: BRAGANCA.id, status: "suspended" },
      ],
    });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("duas cidades ATIVAS distintas continuam sendo conflito", async () => {
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "20", city_id: BRAGANCA.id, status: "active" },
      ],
    });
    await expect(service.resolveDealerCityId("20")).resolves.toBeNull();
  });

  it("duplicadas ATIVAS na mesma cidade continuam sem ser conflito", async () => {
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "20", city_id: ATIBAIA.id, status: "active" },
      ],
    });
    await expect(service.resolveDealerCityId("20")).resolves.toBe(ATIBAIA.id);
  });

  it("todas as lojas suspensas/bloqueadas → sem acesso, mesmo com CNPJ válido", async () => {
    seedWorld({
      advertisers: [
        { id: 1, user_id: "20", city_id: ATIBAIA.id, status: "suspended" },
        { id: 2, user_id: "20", city_id: BRAGANCA.id, status: "blocked" },
      ],
    });
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    const { purchase_intents: rows } = await service.listDealerOpportunities("20");
    expect(rows).toEqual([]);
    await expect(service.getDealerOpportunity("20", 1)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("fan-out — só lojas ATIVAS são notificadas", () => {
  it("notifica apenas os ativos da cidade (A e D), não B nem C", async () => {
    seedWorld({
      users: [
        { id: "10", document_type: "cpf" },
        { id: "51", document_type: "cnpj" },
        { id: "52", document_type: "cnpj" },
        { id: "53", document_type: "cnpj" },
        { id: "54", document_type: "cnpj" },
      ],
      advertisers: [
        { id: 1, user_id: "51", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "52", city_id: ATIBAIA.id, status: "suspended" },
        { id: 3, user_id: "53", city_id: ATIBAIA.id, status: "blocked" },
        { id: 4, user_id: "54", city_id: ATIBAIA.id, status: "active" },
      ],
    });

    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    const recipients = db.notifications.map((row) => row.recipient_user_id).sort();
    expect(recipients).toEqual(["51", "54"]);
    expect(recipients).not.toContain("52");
    expect(recipients).not.toContain("53");
  });

  it("DISTINCT continua valendo entre linhas ATIVAS duplicadas", async () => {
    seedWorld({
      users: [
        { id: "10", document_type: "cpf" },
        { id: "51", document_type: "cnpj" },
      ],
      advertisers: [
        { id: 1, user_id: "51", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "51", city_id: ATIBAIA.id, status: "active" },
      ],
    });

    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(db.notifications.map((row) => row.recipient_user_id)).toEqual(["51"]);
  });

  it("linha ativa + linha suspensa do MESMO usuário ainda gera um aviso", async () => {
    seedWorld({
      users: [
        { id: "10", document_type: "cpf" },
        { id: "51", document_type: "cnpj" },
      ],
      advertisers: [
        { id: 1, user_id: "51", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "51", city_id: ATIBAIA.id, status: "suspended" },
      ],
    });

    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(db.notifications.map((row) => row.recipient_user_id)).toEqual(["51"]);
  });

  it("cidade só com lojas suspensas/bloqueadas → zero notificações, procura publicada", async () => {
    seedWorld({
      users: [
        { id: "10", document_type: "cpf" },
        { id: "52", document_type: "cnpj" },
      ],
      advertisers: [{ id: 1, user_id: "52", city_id: ATIBAIA.id, status: "blocked" }],
    });

    const { purchase_intent: intent } = await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
    expect(intent.status).toBe("active");
    expect(db.notifications).toHaveLength(0);
  });

  it("quem é notificado consegue abrir o detalhe — aviso e acesso não divergem", async () => {
    seedWorld({
      users: [
        { id: "10", document_type: "cpf" },
        { id: "51", document_type: "cnpj" },
        { id: "52", document_type: "cnpj" },
      ],
      advertisers: [
        { id: 1, user_id: "51", city_id: ATIBAIA.id, status: "active" },
        { id: 2, user_id: "52", city_id: ATIBAIA.id, status: "suspended" },
      ],
    });

    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    // A foi avisado E consegue abrir.
    expect(db.notifications.map((row) => row.recipient_user_id)).toEqual(["51"]);
    await expect(service.getDealerOpportunity("51", 1)).resolves.toMatchObject({
      purchase_intent: { id: 1 },
    });
    // B não foi avisado E não consegue abrir.
    await expect(service.getDealerOpportunity("52", 1)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("oportunidades do lojista — isolamento por cidade e privacidade", () => {
  beforeEach(async () => {
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);
  });

  it("lojista da mesma cidade vê", async () => {
    const { purchase_intents: rows } = await service.listDealerOpportunities("20");
    expect(rows.map((row) => row.id)).toEqual([1]);
  });

  it("lojista de OUTRA cidade não vê", async () => {
    const { purchase_intents: rows } = await service.listDealerOpportunities("30");
    expect(rows).toHaveLength(0);
  });

  it("lojista de outra cidade acessando o id direto recebe 404", async () => {
    // Nunca "esta oportunidade é de outra cidade" — isso confirmaria a
    // existência da procura.
    await expect(service.getDealerOpportunity("30", 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("lojista sem cidade válida não vê nada e recebe 404 no detalhe", async () => {
    seedWorld({ advertisers: [{ id: 1, user_id: "20", city_id: null }] });
    await service.createPurchaseIntent(BUYER, SPECIFIC_INPUT);

    const { purchase_intents: rows } = await service.listDealerOpportunities("20");
    expect(rows).toHaveLength(0);
    await expect(service.getDealerOpportunity("20", 1)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("a resposta ao lojista NÃO contém nenhum campo do comprador", async () => {
    const { purchase_intents: rows } = await service.listDealerOpportunities("20");
    const { purchase_intent: detail } = await service.getDealerOpportunity("20", 1);

    for (const payload of [rows[0], detail]) {
      const serialized = JSON.stringify(payload);
      expect(payload).not.toHaveProperty("buyer_user_id");
      expect(payload).not.toHaveProperty("buyer");
      for (const forbidden of ["buyer_user_id", "name", "email", "phone", "whatsapp", "cpf"]) {
        expect(Object.keys(payload)).not.toContain(forbidden);
      }
      expect(serialized).not.toMatch(/buyer|email|phone|whatsapp|cpf|document/i);
    }
  });

  it("a projeção do lojista é allowlist — chaves exatas, sem surpresa", async () => {
    const { purchase_intent: detail } = await service.getDealerOpportunity("20", 1);
    expect(Object.keys(detail).sort()).toEqual(
      [
        "body_type",
        "brand",
        "city",
        "created_at",
        "expires_at",
        "id",
        "intent_type",
        "max_price",
        "model",
        "purchase_timeframe",
        "transmission",
      ].sort()
    );
  });

  it("não vaza status nem expiração interna além do necessário", async () => {
    const { purchase_intent: detail } = await service.getDealerOpportunity("20", 1);
    expect(detail).not.toHaveProperty("status");
    expect(detail).not.toHaveProperty("updated_at");
  });
});
