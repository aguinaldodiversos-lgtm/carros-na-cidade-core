// Regras de negócio do envio de veículos (Fase 3), contra o Postgres de mentira
// que implementa de verdade posse, status, limite e o índice único.
//
// O módulo de notificações NÃO é mockado, pelo mesmo motivo da Fase 2: um
// `vi.fn()` provaria que a função foi chamada, não que a chave de idempotência
// impede o retry de duplicar o aviso e não que o `action_path` passa pela
// allowlist da Fase 1.
//
// O QUE ESTE ARQUIVO NÃO CONSEGUE PROVAR: concorrência. O fake é um array em
// memória com uma "conexão" só — quatro envios simultâneos nunca disputam nada
// aqui. Esse cenário tem teste próprio contra PostgreSQL real, em
// tests/integration/purchase-intent-offers-schema.integration.test.js.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, fakeWithTransaction, resetDb } from "./fake-db.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  // `default` existe porque `ads.public-images.js` importa o pool como default
  // ao resolver a imagem principal. Sem ele, a resolução de foto quebraria com
  // "cannot read property query of undefined" e o erro apareceria longe da causa.
  default: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (callback) => fakeWithTransaction(callback),
}));

const offers = await import(
  "../../src/modules/purchase-intents/purchase-intent-offers.service.js"
);

const NOW = Date.parse("2026-08-11T12:00:00.000Z");
const DAY = 86400000;

const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };
const BRAGANCA = { id: 2, name: "Bragança Paulista", state: "SP", slug: "braganca-paulista-sp" };

const BUYER_ID = "10";
const OTHER_BUYER_ID = "11";
const DEALER_A = "20"; // Atibaia, ativo
const DEALER_B = "21"; // Atibaia, ativo — o "concorrente"
const DEALER_SUSPENDED = "22";
const DEALER_BLOCKED = "23";
const DEALER_BRAGANCA = "30";

const ADVERTISER = {
  A: 100,
  B: 101,
  SUSPENDED: 102,
  BLOCKED: 103,
  BRAGANCA: 104,
};

/** Procura: Honda HR-V automático até R$ 100.000, em Atibaia. */
function specificIntent(overrides = {}) {
  return {
    id: 1,
    buyer_user_id: BUYER_ID,
    city_id: ATIBAIA.id,
    intent_type: "specific_model",
    brand: "Honda",
    brand_slug: "honda",
    model: "HR-V",
    model_slug: "hr-v",
    body_type: null,
    transmission: "automatico",
    max_price: "100000.00",
    purchase_timeframe: "within_30_days",
    status: "active",
    expires_at: new Date(NOW + 30 * DAY).toISOString(),
    created_at: new Date(NOW - DAY).toISOString(),
    updated_at: new Date(NOW - DAY).toISOString(),
    ...overrides,
  };
}

function makeAd(overrides = {}) {
  return {
    id: 1,
    advertiser_id: ADVERTISER.A,
    city_id: ATIBAIA.id,
    slug: "honda-hr-v-2020-atibaia-sp-1",
    title: "Honda HR-V EX 2020",
    brand: "Honda",
    model: "HR-V EX 1.8 Flex 16V 5p Aut.",
    year: 2020,
    mileage: 72000,
    transmission: "automatico",
    body_type: "suv",
    price: "98900.00",
    images: ["https://cdn.example.com/hrv-1.jpg"],
    status: "active",
    ...overrides,
  };
}

/**
 * Mundo base: 4 lojistas em Atibaia (2 ativos, 1 suspenso, 1 bloqueado), 1 em
 * Bragança, e um estoque com um HR-V compatível em cada loja ativa.
 *
 * O HR-V do lojista B é o que torna o teste de posse honesto: sem um anúncio
 * compatível na loja do OUTRO, "não consigo enviar o ad alheio" poderia estar
 * passando por incompatibilidade, não por falta de posse.
 */
function seedWorld(extra = {}) {
  resetDb({
    cities: [ATIBAIA, BRAGANCA],
    users: [
      { id: BUYER_ID, document_type: "cpf" },
      { id: OTHER_BUYER_ID, document_type: "cpf" },
      { id: DEALER_A, document_type: "cnpj" },
      { id: DEALER_B, document_type: "cnpj" },
      { id: DEALER_SUSPENDED, document_type: "cnpj" },
      { id: DEALER_BLOCKED, document_type: "cnpj" },
      { id: DEALER_BRAGANCA, document_type: "cnpj" },
    ],
    advertisers: [
      { id: ADVERTISER.A, user_id: DEALER_A, city_id: ATIBAIA.id, name: "ittmotors" },
      { id: ADVERTISER.B, user_id: DEALER_B, city_id: ATIBAIA.id, name: "Loja B" },
      {
        id: ADVERTISER.SUSPENDED,
        user_id: DEALER_SUSPENDED,
        city_id: ATIBAIA.id,
        name: "Loja Suspensa",
        status: "suspended",
      },
      {
        id: ADVERTISER.BLOCKED,
        user_id: DEALER_BLOCKED,
        city_id: ATIBAIA.id,
        name: "Loja Bloqueada",
        status: "blocked",
      },
      {
        id: ADVERTISER.BRAGANCA,
        user_id: DEALER_BRAGANCA,
        city_id: BRAGANCA.id,
        name: "Loja Bragança",
      },
    ],
    purchaseIntents: [specificIntent()],
    ads: [
      makeAd({ id: 1 }),
      // Mesmo carro compatível, mas do CONCORRENTE.
      makeAd({ id: 50, advertiser_id: ADVERTISER.B, slug: "hrv-loja-b", title: "HR-V da Loja B" }),
    ],
    nextIntentId: 2,
    nextOfferId: 1,
    ...extra,
  });
  fakeClock.now = () => NOW;
}

beforeEach(() => {
  seedWorld();
});

async function expectRejection(promise, matcher) {
  await expect(promise).rejects.toMatchObject(matcher);
}

// ---------------------------------------------------------------------------
// Lista de compatíveis
// ---------------------------------------------------------------------------

describe("listMatchingAdsForDealer", () => {
  it("mostra só o estoque compatível DO PRÓPRIO lojista", async () => {
    db.ads.push(
      makeAd({ id: 2, model: "CITY EX 1.5 Flex 16V 4p Aut.", body_type: "sedan" }), // modelo errado
      makeAd({ id: 3, transmission: "manual" }), // câmbio errado
      makeAd({ id: 4, price: "105000.00" }) // acima do orçamento, mas elegível
    );

    const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
    const ids = result.matching_ads.map((row) => String(row.ad_id));

    expect(ids).toEqual(["1", "4"]);
    // O HR-V do concorrente (id 50) NUNCA aparece.
    expect(ids).not.toContain("50");
  });

  it("ordena dentro do orçamento antes de acima", async () => {
    db.ads.push(
      makeAd({ id: 4, price: "105000.00" }),
      makeAd({ id: 5, price: "72000.00" })
    );

    const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
    expect(result.matching_ads.map((row) => row.budget_relation)).toEqual([
      "within_budget",
      "within_budget",
      "above_budget",
    ]);
    expect(result.matching_ads.map((row) => row.price)).toEqual([
      "72000.00",
      "98900.00",
      "105000.00",
    ]);
  });

  it("não lista anúncio fora de 'active'", async () => {
    for (const status of ["paused", "sold", "pending_review", "blocked", "archived", "draft"]) {
      db.ads = [makeAd({ id: 1, status })];
      const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
      expect(result.matching_ads, `status ${status} não pode aparecer`).toHaveLength(0);
    }
  });

  it("marca already_sent no que já foi enviado", async () => {
    db.ads.push(makeAd({ id: 4, price: "90000.00" }));
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
    const byId = Object.fromEntries(result.matching_ads.map((row) => [String(row.ad_id), row]));
    expect(byId["1"].already_sent).toBe(true);
    expect(byId["4"].already_sent).toBe(false);
  });

  it("devolve o estado do limite (3 vagas)", async () => {
    const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
    expect(result.limit).toEqual({ max_per_dealer: 3, used: 0, remaining: 3 });
  });

  it("lojista de OUTRA cidade recebe 404, sem revelar a cidade", async () => {
    await expectRejection(offers.listMatchingAdsForDealer(DEALER_BRAGANCA, "1"), {
      statusCode: 404,
      message: "Oportunidade não encontrada.",
    });
  });

  it("lojista suspenso e bloqueado recebem 404", async () => {
    for (const dealer of [DEALER_SUSPENDED, DEALER_BLOCKED]) {
      await expectRejection(offers.listMatchingAdsForDealer(dealer, "1"), { statusCode: 404 });
    }
  });

  it("procura encerrada ou vencida não abre a lista", async () => {
    db.purchaseIntents = [specificIntent({ status: "closed" })];
    await expectRejection(offers.listMatchingAdsForDealer(DEALER_A, "1"), { statusCode: 404 });

    db.purchaseIntents = [
      specificIntent({ expires_at: new Date(NOW - DAY).toISOString() }),
    ];
    await expectRejection(offers.listMatchingAdsForDealer(DEALER_A, "1"), { statusCode: 404 });
  });

  it("nenhum campo do comprador aparece na resposta do lojista", async () => {
    const result = await offers.listMatchingAdsForDealer(DEALER_A, "1");
    const raw = JSON.stringify(result);

    expect(raw).not.toMatch(/buyer/i);
    expect(raw).not.toMatch(/email|phone|whatsapp|cpf|document/i);
  });
});

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

describe("sendVehicleToBuyer", () => {
  it("cria a relação e notifica o comprador", async () => {
    const result = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    expect(result.created).toBe(true);
    expect(result.offer.ad_id).toBe(1);
    expect(db.purchaseIntentOffers).toHaveLength(1);
    expect(db.purchaseIntentOffers[0]).toMatchObject({
      purchase_intent_id: 1,
      dealer_user_id: DEALER_A,
      ad_id: 1,
    });

    const notice = db.notifications.find((row) => row.recipient_user_id === BUYER_ID);
    expect(notice).toBeTruthy();
    expect(notice.event_type).toBe("purchase_intent.offer_received");
    expect(notice.title).toBe("Nova opção para sua procura");
    expect(notice.body).toBe("Uma loja enviou um Honda HR-V para você.");
    expect(notice.action_path).toBe("/dashboard/minhas-procuras/1");
    expect(notice.idempotency_key).toBe("purchase_intent:1:ad:1:offer_received");
  });

  it("NÃO devolve nenhum dado do comprador ao lojista", async () => {
    const result = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    const raw = JSON.stringify(result);

    expect(raw).not.toMatch(/buyer/i);
    expect(raw).not.toMatch(/email|phone|whatsapp|cpf|document/i);
  });

  it("não altera o anúncio de forma nenhuma", async () => {
    const before = JSON.parse(JSON.stringify(db.ads));
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    expect(db.ads).toEqual(before);
  });

  it("duplicado gera UMA linha e resposta idempotente", async () => {
    const first = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    const second = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.already_sent).toBe(true);
    expect(db.purchaseIntentOffers).toHaveLength(1);
  });

  it("retry não duplica a notificação; outro anúncio gera uma nova", async () => {
    db.ads.push(makeAd({ id: 4, price: "90000.00" }));

    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    expect(db.notifications).toHaveLength(1);

    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 4 });
    expect(db.notifications).toHaveLength(2);
    expect(db.notifications[1].idempotency_key).toBe("purchase_intent:1:ad:4:offer_received");
  });

  it("falha da notificação NÃO desfaz o envio", async () => {
    db.failNotificationInsert = true;

    const result = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    expect(result.created).toBe(true);
    // A fonte de verdade é a relação, não o aviso.
    expect(db.purchaseIntentOffers).toHaveLength(1);
    expect(db.notifications).toHaveLength(0);
  });

  it("lojista NÃO envia anúncio de outra loja (404, sem vazar nada)", async () => {
    await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 50 }), {
      statusCode: 404,
    });
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("recusa anúncio fora de 'active', mesmo sendo do dono", async () => {
    for (const status of ["paused", "sold", "pending_review", "blocked", "archived", "rejected"]) {
      seedWorld();
      db.ads = [makeAd({ id: 1, status })];

      await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 }), {
        statusCode: 409,
        details: { code: "PURCHASE_INTENT_OFFER_AD_NOT_ACTIVE" },
      });
      expect(db.purchaseIntentOffers, `status ${status}`).toHaveLength(0);
    }
  });

  it("recusa anúncio INCOMPATÍVEL mesmo que o cliente force o ad_id", async () => {
    // O ataque de §58: a tela nunca ofereceu este carro, mas o request manda o
    // id dele. O backend repete o casamento e recusa.
    db.ads.push(makeAd({ id: 9, transmission: "manual" }));

    await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 9 }), {
      statusCode: 409,
      details: { code: "PURCHASE_INTENT_OFFER_AD_NOT_ELIGIBLE" },
    });
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("lojista de outra cidade não envia", async () => {
    db.ads.push(makeAd({ id: 60, advertiser_id: ADVERTISER.BRAGANCA, city_id: BRAGANCA.id }));

    await expectRejection(offers.sendVehicleToBuyer(DEALER_BRAGANCA, "1", { ad_id: 60 }), {
      statusCode: 404,
    });
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("lojista suspenso e bloqueado não enviam", async () => {
    for (const [dealer, advertiserId] of [
      [DEALER_SUSPENDED, ADVERTISER.SUSPENDED],
      [DEALER_BLOCKED, ADVERTISER.BLOCKED],
    ]) {
      seedWorld();
      db.ads.push(makeAd({ id: 70, advertiser_id: advertiserId }));

      await expectRejection(offers.sendVehicleToBuyer(dealer, "1", { ad_id: 70 }), {
        statusCode: 404,
      });
      expect(db.purchaseIntentOffers).toHaveLength(0);
    }
  });

  it("procura encerrada não recebe veículo novo", async () => {
    db.purchaseIntents = [specificIntent({ status: "closed" })];
    await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 }), {
      statusCode: 404,
    });
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("procura VENCIDA não recebe veículo novo", async () => {
    db.purchaseIntents = [specificIntent({ expires_at: new Date(NOW - DAY).toISOString() })];
    await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 }), {
      statusCode: 404,
    });
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("ad_id ausente ou torto é 400, não 500", async () => {
    for (const adId of [undefined, null, "", "abc", "12abc", "-1", "0"]) {
      await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: adId }), {
        statusCode: 400,
        details: { code: "PURCHASE_INTENT_OFFER_INVALID_AD" },
      });
    }
  });

  it("sessão com id torto vira 401, não 500 de violação de tipo no banco", async () => {
    // A guarda é a MESMA da Fase 2 (`requireUserId`, agora exportada). Sem ela,
    // um id não numérico chegaria a uma coluna BIGINT e o sintoma seria um 500
    // com erro de driver no log, em vez da causa real.
    //
    // Este caso existe para provar ALCANCE: a guarda está no caminho dos três
    // pontos de entrada, não apenas definida em algum lugar.
    for (const bad of [undefined, null, "", "abc", "0", "-1"]) {
      await expectRejection(offers.sendVehicleToBuyer(bad, "1", { ad_id: 1 }), {
        statusCode: 401,
      });
      await expectRejection(offers.listMatchingAdsForDealer(bad, "1"), { statusCode: 401 });
      await expectRejection(offers.listReceivedOffers(bad, "1"), { statusCode: 401 });
    }
    expect(db.purchaseIntentOffers).toHaveLength(0);
  });

  it("ignora dealer_user_id / buyer_user_id / price vindos do corpo", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", {
      ad_id: 1,
      dealer_user_id: DEALER_B,
      buyer_user_id: OTHER_BUYER_ID,
      advertiser_id: ADVERTISER.B,
      city_id: BRAGANCA.id,
      price: 1,
      message: "me liga",
    });

    // Tudo veio do servidor: o dono é quem estava autenticado, e o aviso foi
    // para o dono da procura — não para o `buyer_user_id` do corpo.
    expect(db.purchaseIntentOffers[0].dealer_user_id).toBe(DEALER_A);
    expect(db.notifications[0].recipient_user_id).toBe(BUYER_ID);
  });
});

// ---------------------------------------------------------------------------
// Limite de 3
// ---------------------------------------------------------------------------

describe("limite de 3 veículos por lojista", () => {
  function seedFourCompatibleAds() {
    db.ads.push(
      makeAd({ id: 2, price: "90000.00" }),
      makeAd({ id: 3, price: "91000.00" }),
      makeAd({ id: 4, price: "92000.00" })
    );
  }

  it("aceita 3 e recusa o quarto com código de domínio", async () => {
    seedFourCompatibleAds();

    for (const adId of [1, 2, 3]) {
      const result = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: adId });
      expect(result.created).toBe(true);
    }

    await expectRejection(offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 4 }), {
      statusCode: 409,
      details: { code: "PURCHASE_INTENT_OFFER_LIMIT_REACHED" },
    });
    expect(db.purchaseIntentOffers).toHaveLength(3);
  });

  it("veículo que ficou indisponível LIBERA a vaga; a relação fica no histórico", async () => {
    seedFourCompatibleAds();
    for (const adId of [1, 2, 3]) {
      await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: adId });
    }

    // O primeiro foi vendido.
    db.ads.find((ad) => ad.id === 1).status = "sold";

    const fourth = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 4 });
    expect(fourth.created).toBe(true);

    // 4 relações no total — nada foi apagado.
    expect(db.purchaseIntentOffers).toHaveLength(4);
  });

  it("o limite é POR LOJISTA, não por procura", async () => {
    seedFourCompatibleAds();
    for (const adId of [1, 2, 3]) {
      await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: adId });
    }

    // O concorrente continua com as 3 vagas dele.
    const result = await offers.sendVehicleToBuyer(DEALER_B, "1", { ad_id: 50 });
    expect(result.created).toBe(true);
    expect(db.purchaseIntentOffers).toHaveLength(4);
  });

  it("duplicado é resolvido ANTES do limite", async () => {
    // §32: reenviar o mesmo anúncio com as 3 vagas cheias não pode responder
    // "limite atingido" — o envio já existe e não consome vaga nova.
    seedFourCompatibleAds();
    for (const adId of [1, 2, 3]) {
      await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: adId });
    }

    const retry = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 2 });
    expect(retry.created).toBe(false);
    expect(retry.already_sent).toBe(true);
    expect(db.purchaseIntentOffers).toHaveLength(3);
  });

  it("retry de anúncio já enviado que depois ficou inativo continua idempotente", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    db.ads.find((ad) => ad.id === 1).status = "sold";

    const retry = await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    expect(retry.created).toBe(false);
    expect(retry.already_sent).toBe(true);
    expect(db.purchaseIntentOffers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Área do comprador
// ---------------------------------------------------------------------------

describe("listReceivedOffers", () => {
  it("lista vazia quando ninguém enviou nada", async () => {
    const result = await offers.listReceivedOffers(BUYER_ID, "1");
    expect(result.offers).toEqual([]);
  });

  it("card traz dados ATUAIS do anúncio, não snapshot do envio", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    // O lojista baixou o preço e trocou a foto e a quilometragem.
    const ad = db.ads.find((row) => row.id === 1);
    ad.price = "96900.00";
    ad.mileage = 74000;
    ad.images = ["https://cdn.example.com/hrv-novo.jpg"];

    const result = await offers.listReceivedOffers(BUYER_ID, "1");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].vehicle.price).toBe("96900.00");
    expect(result.offers[0].vehicle.mileage).toBe(74000);
    expect(result.offers[0].vehicle.main_image).toBe("https://cdn.example.com/hrv-novo.jpg");
  });

  it("mostra o nome público da loja e o veículo pelo nome comercial", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    const [offer] = (await offers.listReceivedOffers(BUYER_ID, "1")).offers;
    expect(offer.dealer.name).toBe("ittmotors");
    expect(offer.vehicle.vehicle_name).toBe("Honda HR-V");
    expect(offer.budget_relation).toBe("within_budget");
  });

  it("classifica acima do orçamento sem esconder o veículo", async () => {
    db.ads.push(makeAd({ id: 4, price: "103900.00" }));
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 4 });

    const [offer] = (await offers.listReceivedOffers(BUYER_ID, "1")).offers;
    expect(offer.budget_relation).toBe("above_budget");
    expect(offer.vehicle.available).toBe(true);
  });

  it("anúncio vendido/pausado/bloqueado vira INDISPONÍVEL, sem apagar a relação", async () => {
    for (const status of ["sold", "paused", "blocked", "expired", "archived", "deleted"]) {
      seedWorld();
      await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
      db.ads.find((ad) => ad.id === 1).status = status;

      const result = await offers.listReceivedOffers(BUYER_ID, "1");
      expect(result.offers, `status ${status}`).toHaveLength(1);
      expect(result.offers[0].vehicle.available, `status ${status}`).toBe(false);
    }
  });

  it("loja suspensa/bloqueada depois do envio torna o card indisponível", async () => {
    for (const status of ["suspended", "blocked"]) {
      seedWorld();
      await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
      db.advertisers.find((adv) => adv.id === ADVERTISER.A).status = status;

      const result = await offers.listReceivedOffers(BUYER_ID, "1");
      expect(result.offers, `advertiser ${status}`).toHaveLength(1);
      expect(result.offers[0].vehicle.available, `advertiser ${status}`).toBe(false);
    }
  });

  it("comprador NÃO vê as ofertas da procura de outra pessoa", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    await expectRejection(offers.listReceivedOffers(OTHER_BUYER_ID, "1"), {
      statusCode: 404,
      message: "Procura não encontrada.",
    });
  });

  it("procura encerrada continua mostrando o histórico ao comprador", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    db.purchaseIntents[0].status = "closed";

    const result = await offers.listReceivedOffers(BUYER_ID, "1");
    expect(result.offers).toHaveLength(1);
  });

  it("DTO do comprador não carrega dealer_user_id nem dado privado da loja", async () => {
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });

    const result = await offers.listReceivedOffers(BUYER_ID, "1");
    const raw = JSON.stringify(result);

    expect(raw).not.toMatch(/dealer_user_id/i);
    expect(raw).not.toMatch(/email|phone|whatsapp|cnpj|document/i);
  });

  it("mais recentes primeiro", async () => {
    db.ads.push(makeAd({ id: 4, price: "90000.00" }));
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 1 });
    await offers.sendVehicleToBuyer(DEALER_A, "1", { ad_id: 4 });

    const result = await offers.listReceivedOffers(BUYER_ID, "1");
    expect(result.offers.map((row) => String(row.vehicle.id))).toEqual(["4", "1"]);
  });
});
