// "Agendar visita pelo WhatsApp" (Fase 3.1) — resolução server-side do contato.
//
// O que este arquivo protege, em ordem de gravidade:
//
//   1. IDOR — a oferta de outro comprador, e a oferta de OUTRA procura do
//      mesmo comprador, precisam devolver 404 sem vazar telefone;
//   2. estado — anúncio pausado e loja bloqueada cortam o contato NO CLIQUE,
//      mesmo que a tela tenha sido carregada quando tudo estava no ar;
//   3. open redirect — nada do corpo pode influenciar o destino;
//   4. o número — precedência canônica, normalização, DDI sem duplicata.
//
// O QUE ELE NÃO PODE PROVAR: que a query real casa as três condições de posse.
// O fake as reimplementa (ver `fake-db.js`), então apagar uma cláusula do
// repository faz os testes de IDOR daqui falharem — mas a existência das
// COLUNAS e o comportamento do `COALESCE` com NULL real são do teste de
// integração.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, fakeClock, fakeQuery, fakeWithTransaction, resetDb } from "./fake-db.js";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  default: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (callback) => fakeWithTransaction(callback),
}));

const offers = await import(
  "../../src/modules/purchase-intents/purchase-intent-offers.service.js"
);

const NOW = Date.parse("2026-08-13T12:00:00.000Z");
const DAY = 86400000;

const ATIBAIA = { id: 1, name: "Atibaia", state: "SP", slug: "atibaia-sp" };

const BUYER = "10";
const OTHER_BUYER = "11";
const DEALER = "20";
const ADVERTISER_ID = 100;

/** Procura Honda HR-V automático até R$ 100.000, do BUYER. */
function intent(overrides = {}) {
  return {
    id: 1,
    buyer_user_id: BUYER,
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
    advertiser_id: ADVERTISER_ID,
    city_id: ATIBAIA.id,
    slug: "honda-hr-v-2020-atibaia-sp-1",
    title: "Honda HR-V EX 2020 ACEITO TROCA (11) 98888-7777",
    brand: "Honda",
    model: "HR-V EX 1.8 Flex 16V 5p Aut.",
    year: 2020,
    mileage: 72000,
    transmission: "automatico",
    body_type: "suv",
    price: "98900.00",
    images: [],
    status: "active",
    ...overrides,
  };
}

/** Mundo base: 1 procura do BUYER, 1 oferta, loja ativa com WhatsApp. */
function seedWorld(extra = {}) {
  resetDb({
    cities: [ATIBAIA],
    users: [
      { id: BUYER, document_type: "cpf" },
      { id: OTHER_BUYER, document_type: "cpf" },
      { id: DEALER, document_type: "cnpj" },
    ],
    advertisers: [
      {
        id: ADVERTISER_ID,
        user_id: DEALER,
        city_id: ATIBAIA.id,
        name: "ittmotors",
        whatsapp: "(11) 99999-9999",
      },
    ],
    purchaseIntents: [intent()],
    ads: [makeAd()],
    purchaseIntentOffers: [
      {
        id: 1,
        purchase_intent_id: 1,
        dealer_user_id: DEALER,
        ad_id: 1,
        created_at: new Date(NOW - 3600000).toISOString(),
      },
    ],
    nextIntentId: 2,
    nextOfferId: 2,
    ...extra,
  });
  fakeClock.now = () => NOW;
}

beforeEach(() => {
  seedWorld();
});

const advertiser = () => db.advertisers.find((row) => row.id === ADVERTISER_ID);

async function expectRejection(promise, matcher) {
  await expect(promise).rejects.toMatchObject(matcher);
}

// ---------------------------------------------------------------------------
// Caminho feliz
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — sucesso", () => {
  it("devolve a URL oficial do WhatsApp com o número normalizado", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");

    expect(result.url).toMatch(/^https:\/\/wa\.me\/5511999999999\?text=/);
  });

  it("a resposta contém SÓ a url — nada de telefone em campo separado", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");

    expect(Object.keys(result)).toEqual(["url"]);
    // O número existe dentro da URL (é o destino), mas não há campo `phone`,
    // `whatsapp` ou `dealer` para alguém logar ou renderizar por engano.
    expect(result).not.toHaveProperty("phone");
    expect(result).not.toHaveProperty("whatsapp");
    expect(result).not.toHaveProperty("whatsapp_number");
    expect(result).not.toHaveProperty("dealer");
  });

  it("monta a mensagem contextual com marca + modelo comercial + ano", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const text = decodeURIComponent(new URL(result.url).searchParams.get("text"));

    expect(text).toBe(
      "Olá! Recebi pelo Carros na Cidade a opção do Honda HR-V 2020 e gostaria de agendar uma visita para conhecer o veículo."
    );
  });

  it("a mensagem NÃO usa ads.title (texto livre do lojista)", async () => {
    // O título do fixture tem "ACEITO TROCA" e um telefone dentro — coisas que
    // aparecem de verdade em produção. Mandar isso numa frase que o comprador
    // assina seria pôr palavra estranha na boca dele.
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const text = decodeURIComponent(new URL(result.url).searchParams.get("text"));

    expect(text).not.toMatch(/ACEITO TROCA/i);
    expect(text).not.toMatch(/98888/);
  });

  it("a mensagem é URL-encoded (acentos, espaços e pontuação)", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const raw = result.url.split("?text=")[1];

    // Nada de espaço cru nem de acento cru na query string.
    expect(raw).not.toMatch(/ /);
    expect(raw).not.toMatch(/[áàâãéêíóôõúç]/i);
    expect(raw).toContain("Ol%C3%A1"); // "Olá"
    expect(raw).toContain("ve%C3%ADculo"); // "veículo"

    // E volta ao texto original ao decodificar — a prova de que o encode não
    // corrompeu nada.
    expect(decodeURIComponent(raw)).toContain("Olá!");
  });

  it("normaliza o número no formato que o lojista digitou", async () => {
    for (const [stored, expected] of [
      ["(11) 99999-9999", "5511999999999"],
      ["+55 (11) 99999-9999", "5511999999999"],
      ["55 11 99999-9999", "5511999999999"],
      ["11999999999", "5511999999999"],
      ["(11) 3333-4444", "551133334444"],
    ]) {
      seedWorld();
      advertiser().whatsapp = stored;

      const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
      expect(new URL(result.url).pathname, `gravado: ${stored}`).toBe(`/${expected}`);
    }
  });

  it("nome comercial sai dos MESMOS helpers do card (FIPE → comercial)", async () => {
    seedWorld();
    db.ads[0].brand = "VW - VolksWagen";
    db.ads[0].model = "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.";
    db.ads[0].year = 2022;

    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const text = decodeURIComponent(new URL(result.url).searchParams.get("text"));

    expect(text).toContain("Volkswagen T-Cross 2022");
  });

  it("não promete agendamento — só pedido de visita", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const text = decodeURIComponent(new URL(result.url).searchParams.get("text"));

    expect(text).toMatch(/gostaria de agendar/i);
    expect(text).not.toMatch(/visita agendada|agendamento confirmado|hor[áa]rio reservado/i);
  });
});

// ---------------------------------------------------------------------------
// Precedência do número
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — de onde sai o número", () => {
  it("segue COALESCE(whatsapp, mobile_phone, phone)", async () => {
    seedWorld();
    Object.assign(advertiser(), {
      whatsapp: "(11) 91111-1111",
      mobile_phone: "(11) 92222-2222",
      phone: "(11) 93333-3333",
    });
    expect(new URL((await offers.resolveOfferWhatsapp(BUYER, "1", "1")).url).pathname).toBe(
      "/5511911111111"
    );

    seedWorld();
    Object.assign(advertiser(), {
      whatsapp: null,
      mobile_phone: "(11) 92222-2222",
      phone: "(11) 93333-3333",
    });
    expect(new URL((await offers.resolveOfferWhatsapp(BUYER, "1", "1")).url).pathname).toBe(
      "/5511922222222"
    );

    seedWorld();
    Object.assign(advertiser(), { whatsapp: null, mobile_phone: null, phone: "(11) 93333-3333" });
    expect(new URL((await offers.resolveOfferWhatsapp(BUYER, "1", "1")).url).pathname).toBe(
      "/5511933333333"
    );
  });

  it("NÃO usa o telefone do comprador", async () => {
    seedWorld();
    advertiser().whatsapp = "(11) 91111-1111";
    // Mesmo que o usuário comprador tenha telefone, ele é irrelevante aqui: o
    // comprador é quem INICIA o contato, não quem o recebe.
    db.users.find((u) => u.id === BUYER).whatsapp = "(11) 90000-0000";

    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    expect(result.url).not.toContain("5511900000000");
    expect(result.url).toContain("5511911111111");
  });
});

// ---------------------------------------------------------------------------
// IDOR
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — IDOR", () => {
  it("comprador B não obtém o WhatsApp da oferta do comprador A", async () => {
    await expectRejection(offers.resolveOfferWhatsapp(OTHER_BUYER, "1", "1"), {
      statusCode: 404,
      message: "Veículo não encontrado.",
    });
  });

  it("a recusa não vaza telefone nem nome da loja", async () => {
    const error = await offers.resolveOfferWhatsapp(OTHER_BUYER, "1", "1").catch((e) => e);
    const raw = JSON.stringify({ message: error.message, details: error.details ?? null });

    expect(raw).not.toMatch(/9999|ittmotors|whatsapp/i);
  });

  it("oferta de OUTRA procura do MESMO comprador é 404", async () => {
    // §40: o comprador é dono das duas procuras, mas a oferta 2 pertence à
    // procura 2. Pedir "procura 1 + oferta 2" não pode casar.
    seedWorld();
    db.purchaseIntents.push(intent({ id: 2 }));
    db.ads.push(makeAd({ id: 2 }));
    db.purchaseIntentOffers.push({
      id: 2,
      purchase_intent_id: 2,
      dealer_user_id: DEALER,
      ad_id: 2,
      created_at: new Date(NOW).toISOString(),
    });

    // O par correto funciona...
    await expect(offers.resolveOfferWhatsapp(BUYER, "2", "2")).resolves.toHaveProperty("url");
    // ...e o par cruzado, não.
    await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "2"), { statusCode: 404 });
    await expectRejection(offers.resolveOfferWhatsapp(BUYER, "2", "1"), { statusCode: 404 });
  });

  it("oferta inexistente é 404", async () => {
    await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "999"), { statusCode: 404 });
  });

  it("ids tortos são 404, não 500", async () => {
    for (const bad of ["abc", "12abc", "-1", "0", "", " "]) {
      await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", bad), { statusCode: 404 });
      await expectRejection(offers.resolveOfferWhatsapp(BUYER, bad, "1"), { statusCode: 404 });
    }
  });

  it("sessão inválida é 401", async () => {
    for (const bad of [undefined, null, "", "abc", "0"]) {
      await expectRejection(offers.resolveOfferWhatsapp(bad, "1", "1"), { statusCode: 401 });
    }
  });
});

// ---------------------------------------------------------------------------
// Estado do veículo e da loja
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — disponibilidade no instante do clique", () => {
  it("anúncio fora de 'active' recusa o contato", async () => {
    for (const status of ["paused", "blocked", "archived", "rejected", "deleted", "sold"]) {
      seedWorld();
      db.ads[0].status = status;

      await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "1"), {
        statusCode: 409,
        details: { code: "PURCHASE_INTENT_OFFER_UNAVAILABLE" },
      });
    }
  });

  it("loja suspensa ou bloqueada recusa o contato", async () => {
    for (const status of ["suspended", "blocked"]) {
      seedWorld();
      advertiser().status = status;

      await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "1"), {
        statusCode: 409,
        details: { code: "PURCHASE_INTENT_OFFER_UNAVAILABLE" },
      });
    }
  });

  it("anúncio pausado e loja bloqueada compartilham o MESMO código", async () => {
    // Distinguir contaria ao comprador uma decisão de moderação que não é da
    // conta dele — e o efeito prático é idêntico: não dá para visitar o carro.
    seedWorld();
    db.ads[0].status = "paused";
    const byAd = await offers.resolveOfferWhatsapp(BUYER, "1", "1").catch((e) => e);

    seedWorld();
    advertiser().status = "blocked";
    const byDealer = await offers.resolveOfferWhatsapp(BUYER, "1", "1").catch((e) => e);

    expect(byAd.details.code).toBe(byDealer.details.code);
    expect(byAd.message).toBe(byDealer.message);
    expect(byDealer.message).not.toMatch(/bloquead|suspens|moderaç/i);
  });

  it("a recusa por indisponibilidade NÃO devolve o número", async () => {
    seedWorld();
    db.ads[0].status = "paused";

    const error = await offers.resolveOfferWhatsapp(BUYER, "1", "1").catch((e) => e);
    expect(JSON.stringify(error.details ?? {})).not.toMatch(/9999|wa\.me/);
    expect(error.message).not.toMatch(/9999|wa\.me/);
  });

  it("loja NULL/'' continua operacional (banco legado)", async () => {
    // Mesma convenção da Fase 2.1: `COALESCE(NULLIF(BTRIM(status), ''), 'active')`.
    for (const status of [null, "", "   "]) {
      seedWorld();
      advertiser().status = status;

      await expect(offers.resolveOfferWhatsapp(BUYER, "1", "1")).resolves.toHaveProperty("url");
    }
  });
});

// ---------------------------------------------------------------------------
// Loja sem WhatsApp
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — loja sem contato utilizável", () => {
  it("devolve código de domínio próprio, não 500", async () => {
    for (const value of [null, "", "   ", "abc", "99999999", "1", "----"]) {
      seedWorld();
      Object.assign(advertiser(), { whatsapp: value, mobile_phone: null, phone: null });

      const error = await offers.resolveOfferWhatsapp(BUYER, "1", "1").catch((e) => e);
      expect(error.statusCode, `valor: ${JSON.stringify(value)}`).toBe(409);
      expect(error.details.code).toBe("DEALER_WHATSAPP_UNAVAILABLE");
    }
  });

  it("nunca produz uma URL de wa.me quebrada", async () => {
    seedWorld();
    Object.assign(advertiser(), { whatsapp: "99999999", mobile_phone: null, phone: null });

    // O ponto: 8 dígitos passariam num normalizador frouxo e gerariam
    // `wa.me/5599999999`, que abre uma conversa inexistente. O comprador acharia
    // que falou com a loja e ficaria esperando.
    await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "1"), {
      details: { code: "DEALER_WHATSAPP_UNAVAILABLE" },
    });
  });

  it("advertiser ausente é indisponibilidade, não erro de servidor", async () => {
    seedWorld();
    db.ads[0].advertiser_id = 999;

    await expectRejection(offers.resolveOfferWhatsapp(BUYER, "1", "1"), {
      statusCode: 409,
      details: { code: "PURCHASE_INTENT_OFFER_UNAVAILABLE" },
    });
  });
});

// ---------------------------------------------------------------------------
// Open redirect
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — open redirect", () => {
  it("a função não aceita corpo: nada do cliente pode mudar o destino", async () => {
    // A assinatura é (userId, intentId, offerId). Um quarto argumento com
    // `url`/`phone`/`redirect` é simplesmente ignorado — não existe caminho de
    // leitura para ele. É mais forte que validar domínio: não há o que validar.
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1", {
      url: "https://malicious.example",
      redirect: "https://malicious.example",
      phone: "5511000000000",
      whatsapp: "5511000000000",
    });

    expect(result.url.startsWith("https://wa.me/")).toBe(true);
    expect(result.url).not.toContain("malicious");
    expect(result.url).not.toContain("5511000000000");
  });

  it("o host é sempre o oficial do WhatsApp", async () => {
    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    expect(new URL(result.url).host).toBe("wa.me");
    expect(new URL(result.url).protocol).toBe("https:");
  });

  it("um número com caracteres de URL não escapa do path", async () => {
    seedWorld();
    // Se alguém gravasse isto no cadastro da loja, a normalização mantém só
    // dígitos — não há como injetar host, query ou fragmento no link.
    advertiser().whatsapp = "11999999999@evil.com/?x=#y";

    const result = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    expect(new URL(result.url).host).toBe("wa.me");
    expect(new URL(result.url).pathname).toBe("/5511999999999");
  });
});

// ---------------------------------------------------------------------------
// Fronteiras da fase
// ---------------------------------------------------------------------------

describe("resolveOfferWhatsapp — o que NÃO acontece", () => {
  it("não cria notificação para o lojista", async () => {
    await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    // O próprio WhatsApp é a manifestação de interesse; notificar duplicaria.
    expect(db.notifications).toHaveLength(0);
  });

  it("não altera a oferta, o anúncio nem a procura", async () => {
    const before = JSON.parse(
      JSON.stringify({
        offers: db.purchaseIntentOffers,
        ads: db.ads,
        intents: db.purchaseIntents,
      })
    );

    await offers.resolveOfferWhatsapp(BUYER, "1", "1");

    expect(db.purchaseIntentOffers).toEqual(before.offers);
    expect(db.ads).toEqual(before.ads);
    expect(db.purchaseIntents).toEqual(before.intents);
  });

  it("é repetível: dois cliques devolvem a mesma URL, sem efeito colateral", async () => {
    const first = await offers.resolveOfferWhatsapp(BUYER, "1", "1");
    const second = await offers.resolveOfferWhatsapp(BUYER, "1", "1");

    expect(second.url).toBe(first.url);
    expect(db.notifications).toHaveLength(0);
    expect(db.purchaseIntentOffers).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// O card continua sem telefone
// ---------------------------------------------------------------------------

describe("listReceivedOffers — telefone continua fora do DTO", () => {
  it("o card do comprador não carrega nenhum contato da loja", async () => {
    const result = await offers.listReceivedOffers(BUYER, "1");
    const raw = JSON.stringify(result);

    expect(result.offers).toHaveLength(1);
    // §7: o número só sai do servidor mediante a ação explícita do comprador.
    expect(raw).not.toMatch(/whatsapp/i);
    expect(raw).not.toMatch(/phone|telefone|telephone|mobile/i);
    expect(raw).not.toMatch(/9999/);
    // O nome público da loja continua — é o que identifica quem enviou.
    expect(result.offers[0].dealer.name).toBe("ittmotors");
  });
});
