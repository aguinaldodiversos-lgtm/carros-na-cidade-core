// Postgres de mentira para os testes de procuras.
//
// NÃO é um mock que devolve linha pronta. Ele re-implementa de verdade o que os
// testes precisam provar: o escopo por dono, o escopo por cidade, o filtro de
// `expires_at > NOW()`, a ordenação por tupla e o `ON CONFLICT DO NOTHING` do
// índice único de notificações.
//
// A diferença importa. Um mock que responde `{ rows: [linha] }` para qualquer
// SELECT passaria mesmo se alguém apagasse o `AND buyer_user_id = $2` do
// repository — ou seja, provaria que o banco foi chamado, não que a autorização
// existe. Aqui, apagar essa cláusula faz o teste de IDOR falhar.
//
// O despacho é por REGEX sobre o SQL normalizado. Consequência conhecida: uma
// query nova sem padrão correspondente cai no `unmatched`, que LANÇA em vez de
// devolver `{ rows: [] }` silencioso — um retorno vazio faria o teste falhar
// numa asserção distante da causa.

const NOT_MATCHED = Symbol("unmatched");

export const db = {
  cities: [],
  users: [],
  advertisers: [],
  purchaseIntents: [],
  notifications: [],
  /** Fase 3 — estoque e relação procura ↔ anúncio. */
  ads: [],
  purchaseIntentOffers: [],
  nextIntentId: 1,
  nextNotificationId: 1,
  nextOfferId: 1,
  /** Ligado por um teste para simular indisponibilidade do fan-out. */
  failNotificationInsert: false,
};

export function resetDb(seed = {}) {
  db.cities = seed.cities ?? [];
  db.users = seed.users ?? [];
  db.advertisers = seed.advertisers ?? [];
  db.purchaseIntents = seed.purchaseIntents ?? [];
  db.ads = seed.ads ?? [];
  db.purchaseIntentOffers = seed.purchaseIntentOffers ?? [];
  db.notifications = [];
  db.nextIntentId = seed.nextIntentId ?? 1;
  db.nextNotificationId = 1;
  db.nextOfferId = seed.nextOfferId ?? 1;
  db.failNotificationInsert = false;
}

function normalize(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function sameId(a, b) {
  return String(a) === String(b);
}

function cityOf(cityId) {
  return db.cities.find((city) => sameId(city.id, cityId)) ?? null;
}

/** `COALESCE(NULLIF(BTRIM(status), ''), 'active')` — NULL e '' são ativos. */
function advertiserStatusOf(advertiser) {
  const raw = String(advertiser.status ?? "").trim();
  return raw === "" ? "active" : raw;
}

/** Projeção de BUYER_COLUMNS: colunas da procura + JOIN de cidade + is_expired. */
function projectBuyer(row, now) {
  const city = cityOf(row.city_id);
  return {
    id: row.id,
    intent_type: row.intent_type,
    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    body_type: row.body_type,
    transmission: row.transmission,
    max_price: row.max_price,
    purchase_timeframe: row.purchase_timeframe,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_expired: new Date(row.expires_at).getTime() <= now,
    city_name: city?.name ?? null,
    city_state: city?.state ?? null,
    city_slug: city?.slug ?? null,
  };
}

/**
 * Projeção de DEALER_COLUMNS.
 *
 * Montada campo a campo, IGUAL ao repository real. Se este helper espalhasse
 * `...row`, o teste de privacidade passaria a ver `buyer_user_id` vindo do fake
 * e não do código sob teste — provaria o oposto do que se quer provar.
 */
function projectDealer(row) {
  const city = cityOf(row.city_id);
  return {
    id: row.id,
    intent_type: row.intent_type,
    brand: row.brand,
    model: row.model,
    body_type: row.body_type,
    transmission: row.transmission,
    max_price: row.max_price,
    purchase_timeframe: row.purchase_timeframe,
    created_at: row.created_at,
    expires_at: row.expires_at,
    city_name: city?.name ?? null,
    city_state: city?.state ?? null,
    city_slug: city?.slug ?? null,
  };
}

/** Ordenação (created_at DESC, id DESC) — a mesma tupla do ORDER BY real. */
function sortDesc(rows) {
  return [...rows].sort((a, b) => {
    const byDate = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (byDate !== 0) return byDate;
    return Number(b.id) - Number(a.id);
  });
}

/** Comparação de TUPLA do cursor: (created_at, id) < ($1, $2). */
function beforeCursor(row, createdAt, id) {
  const rowTime = new Date(row.created_at).getTime();
  const cursorTime = new Date(createdAt).getTime();
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return Number(row.id) < Number(id);
}

/**
 * Anúncio do estoque, com os campos que o card e o casamento usam.
 *
 * A projeção espelha AD_CARD_COLUMNS coluna a coluna, e `image_url` NÃO está
 * aqui porque não está em `ads` — a tabela só tem `images` (JSONB).
 *
 * Isso não é detalhe: a versão anterior deste helper devolvia
 * `image_url: ad.image_url ?? null`, e foi exatamente por isso que o fake
 * engoliu um `SELECT a.image_url` que o PostgreSQL real recusa com
 * "column a.image_url does not exist". Um fake que inventa coluna concorda com
 * qualquer query — inclusive com a que não roda em produção.
 */
function projectAd(ad) {
  return {
    id: ad.id,
    slug: ad.slug ?? null,
    title: ad.title ?? null,
    brand: ad.brand ?? null,
    model: ad.model ?? null,
    year: ad.year ?? null,
    mileage: ad.mileage ?? null,
    transmission: ad.transmission ?? null,
    body_type: ad.body_type ?? null,
    price: ad.price ?? null,
    images: ad.images ?? [],
    status: ad.status ?? null,
  };
}

function advertiserById(advertiserId) {
  return db.advertisers.find((item) => sameId(item.id, advertiserId)) ?? null;
}

/** Loja do anúncio operacional? Mesma semântica do predicado SQL. */
function adAdvertiserIsOperational(ad) {
  const advertiser = advertiserById(ad.advertiser_id);
  if (!advertiser) return false;
  return advertiserStatusOf(advertiser) === "active";
}

function handle(text, params, now) {
  // --- cities ---------------------------------------------------------------
  if (/^SELECT id, name, state, slug FROM cities WHERE id = \$1/i.test(text)) {
    const city = cityOf(params[0]);
    return { rows: city ? [city] : [], rowCount: city ? 1 : 0 };
  }

  // --- vehicle_images: sondagem de esquema de ads.public-images -------------
  //
  // O fake não tem a tabela. Devolver 0 linhas faz o helper cair no fallback de
  // `ads.images`, que é exatamente o caminho de produção hoje (a tabela existe,
  // mas o acervo vive no JSON). Sem este ramo, a sondagem cairia no `unmatched`
  // e o teste falharia por um detalhe de infraestrutura de imagem.
  if (/FROM information_schema\.tables/i.test(text) && /vehicle_images/i.test(text)) {
    return { rows: [], rowCount: 0 };
  }

  // --- purchase_intents: contexto de matching (Fase 3) ----------------------
  //
  // Precisa vir ANTES do handler de leitura do lojista da Fase 2: os dois
  // filtram por (id, city_id, active). O que distingue é `brand_slug`, que só a
  // consulta de matching projeta.
  if (/pi\.brand_slug/i.test(text) && /pi\.city_id = \$2/i.test(text)) {
    const [id, cityId] = params;
    const locking = /FOR UPDATE/i.test(text);

    const row = db.purchaseIntents.find(
      (item) =>
        sameId(item.id, id) &&
        sameId(item.city_id, cityId) &&
        item.status === "active" &&
        new Date(item.expires_at).getTime() > now
    );
    if (!row) return { rows: [], rowCount: 0 };

    const city = cityOf(row.city_id);
    const base = {
      id: row.id,
      intent_type: row.intent_type,
      brand: row.brand,
      brand_slug: row.brand_slug,
      model: row.model,
      model_slug: row.model_slug,
      body_type: row.body_type,
      transmission: row.transmission,
      max_price: row.max_price,
    };

    // Só a consulta TRAVADA devolve `buyer_user_id` — igual ao repository real.
    // Se o fake o entregasse nas duas, um vazamento para o DTO do lojista
    // passaria despercebido no teste de privacidade.
    return locking
      ? { rows: [{ ...base, buyer_user_id: row.buyer_user_id, city_id: row.city_id }], rowCount: 1 }
      : {
          rows: [
            {
              ...base,
              purchase_timeframe: row.purchase_timeframe,
              created_at: row.created_at,
              expires_at: row.expires_at,
              city_name: city?.name ?? null,
              city_state: city?.state ?? null,
              city_slug: city?.slug ?? null,
            },
          ],
          rowCount: 1,
        };
  }

  // --- ads: estoque do lojista ---------------------------------------------
  if (/FROM ads a JOIN advertisers adv/i.test(text) && /WHERE adv\.user_id = \$1/i.test(text)) {
    const [userId, adStatus, advStatus] = params;
    const limit = Number(params[params.length - 1]);

    const rows = db.ads
      .filter((ad) => {
        const advertiser = advertiserById(ad.advertiser_id);
        if (!advertiser) return false;
        if (!sameId(advertiser.user_id, userId)) return false;
        if (advertiserStatusOf(advertiser) !== advStatus) return false;
        return ad.status === adStatus;
      })
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, limit);

    return { rows: rows.map(projectAd), rowCount: rows.length };
  }

  if (/WHERE a\.id = \$1 AND adv\.user_id = \$2/i.test(text)) {
    const [adId, userId, advStatus] = params;
    const ad = db.ads.find((item) => {
      if (!sameId(item.id, adId)) return false;
      const advertiser = advertiserById(item.advertiser_id);
      if (!advertiser) return false;
      if (!sameId(advertiser.user_id, userId)) return false;
      return advertiserStatusOf(advertiser) === advStatus;
    });
    return { rows: ad ? [projectAd(ad)] : [], rowCount: ad ? 1 : 0 };
  }

  // --- purchase_intent_offers ----------------------------------------------
  if (/^INSERT INTO purchase_intent_offers/i.test(text)) {
    const [purchaseIntentId, dealerUserId, adId] = params;

    // ON CONFLICT (purchase_intent_id, ad_id) DO NOTHING — o índice único.
    const clash = db.purchaseIntentOffers.find(
      (item) => sameId(item.purchase_intent_id, purchaseIntentId) && sameId(item.ad_id, adId)
    );
    if (clash) return { rows: [], rowCount: 0 };

    const row = {
      id: db.nextOfferId,
      purchase_intent_id: purchaseIntentId,
      dealer_user_id: String(dealerUserId),
      ad_id: adId,
      created_at: new Date(now).toISOString(),
    };
    db.nextOfferId += 1;
    db.purchaseIntentOffers.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (/FROM purchase_intent_offers WHERE purchase_intent_id = \$1 AND ad_id = \$2/i.test(text)) {
    const [purchaseIntentId, adId] = params;
    const row = db.purchaseIntentOffers.find(
      (item) => sameId(item.purchase_intent_id, purchaseIntentId) && sameId(item.ad_id, adId)
    );
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  if (/SELECT COUNT\(\*\)::int AS total FROM purchase_intent_offers o/i.test(text)) {
    const [purchaseIntentId, dealerUserId, adStatus, advStatus] = params;

    // Conta só as vagas OCUPADAS: anúncio ativo + loja operacional. Um carro
    // vendido depois do envio libera vaga — a regra que o teste de §67 prova.
    const total = db.purchaseIntentOffers.filter((offer) => {
      if (!sameId(offer.purchase_intent_id, purchaseIntentId)) return false;
      if (!sameId(offer.dealer_user_id, dealerUserId)) return false;
      const ad = db.ads.find((item) => sameId(item.id, offer.ad_id));
      if (!ad || ad.status !== adStatus) return false;
      const advertiser = advertiserById(ad.advertiser_id);
      if (!advertiser) return false;
      return advertiserStatusOf(advertiser) === advStatus;
    }).length;

    return { rows: [{ total }], rowCount: 1 };
  }

  if (/SELECT ad_id FROM purchase_intent_offers WHERE purchase_intent_id = \$1/i.test(text)) {
    const [purchaseIntentId, dealerUserId] = params;
    const rows = db.purchaseIntentOffers
      .filter(
        (item) =>
          sameId(item.purchase_intent_id, purchaseIntentId) &&
          sameId(item.dealer_user_id, dealerUserId)
      )
      .map((item) => ({ ad_id: item.ad_id }));
    return { rows, rowCount: rows.length };
  }

  // --- contato de WhatsApp da oferta (Fase 3.1) ----------------------------
  //
  // Precisa vir ANTES da listagem do comprador: as duas partem de
  // `purchase_intent_offers o JOIN purchase_intents pi`. O que distingue é o
  // `WHERE o.id = $1` (uma oferta específica) e a coluna `whatsapp_number`.
  if (/whatsapp_number/i.test(text) && /WHERE o\.id = \$1/i.test(text)) {
    const [offerId, purchaseIntentId, buyerUserId, advStatus] = params;

    // As TRÊS condições do WHERE real, reimplementadas. Apagar qualquer uma
    // delas do repository faz os testes de IDOR falharem — que é o objetivo.
    const offer = db.purchaseIntentOffers.find(
      (item) =>
        sameId(item.id, offerId) && sameId(item.purchase_intent_id, purchaseIntentId)
    );
    if (!offer) return { rows: [], rowCount: 0 };

    const intent = db.purchaseIntents.find(
      (item) =>
        sameId(item.id, offer.purchase_intent_id) && sameId(item.buyer_user_id, buyerUserId)
    );
    if (!intent) return { rows: [], rowCount: 0 };

    const ad = db.ads.find((item) => sameId(item.id, offer.ad_id));
    if (!ad) return { rows: [], rowCount: 0 };

    const advertiser = advertiserById(ad.advertiser_id);

    return {
      rows: [
        {
          offer_id: offer.id,
          ad_id: ad.id,
          brand: ad.brand ?? null,
          model: ad.model ?? null,
          year: ad.year ?? null,
          title: ad.title ?? null,
          ad_status: ad.status ?? null,
          dealer_name: advertiser?.name ?? null,
          dealer_operational: Boolean(advertiser) && advertiserStatusOf(advertiser) === advStatus,
          // COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) — a precedência
          // canônica do projeto. `telefone`/`telephone` ficam de fora aqui pelo
          // mesmo motivo que ficam de fora do SQL: nenhum caminho os lê.
          whatsapp_number:
            advertiser?.whatsapp ?? advertiser?.mobile_phone ?? advertiser?.phone ?? null,
        },
      ],
      rowCount: 1,
    };
  }

  if (/FROM purchase_intent_offers o JOIN purchase_intents pi/i.test(text)) {
    const [purchaseIntentId, buyerUserId, adStatus] = params;

    // A posse está no WHERE do SQL real; o fake a reimplementa para que apagar
    // o `AND pi.buyer_user_id = $2` do repository faça o teste de IDOR falhar.
    const intent = db.purchaseIntents.find(
      (item) => sameId(item.id, purchaseIntentId) && sameId(item.buyer_user_id, buyerUserId)
    );
    if (!intent) return { rows: [], rowCount: 0 };

    const rows = db.purchaseIntentOffers
      .filter((offer) => sameId(offer.purchase_intent_id, purchaseIntentId))
      .sort((a, b) => Number(b.id) - Number(a.id))
      .map((offer) => {
        const ad = db.ads.find((item) => sameId(item.id, offer.ad_id));
        if (!ad) return null;
        const city = cityOf(ad.city_id);
        return {
          offer_id: offer.id,
          sent_at: offer.created_at,
          ...projectAd(ad),
          city_name: city?.name ?? null,
          city_state: city?.state ?? null,
          dealer_name: advertiserById(ad.advertiser_id)?.name ?? null,
          available: ad.status === adStatus && adAdvertiserIsOperational(ad),
        };
      })
      .filter(Boolean);

    return { rows, rowCount: rows.length };
  }

  // --- purchase_intents: escrita -------------------------------------------
  if (/^INSERT INTO purchase_intents/i.test(text)) {
    const [
      buyerUserId,
      cityId,
      intentType,
      brand,
      brandSlug,
      model,
      modelSlug,
      bodyType,
      transmission,
      maxPrice,
      purchaseTimeframe,
      activeDays,
    ] = params;

    const createdAt = new Date(now).toISOString();
    const row = {
      id: db.nextIntentId,
      buyer_user_id: String(buyerUserId),
      city_id: cityId,
      intent_type: intentType,
      brand,
      brand_slug: brandSlug,
      model,
      model_slug: modelSlug,
      body_type: bodyType,
      transmission,
      max_price: maxPrice,
      purchase_timeframe: purchaseTimeframe,
      status: "active",
      // Espelha `NOW() + ($12 || ' days')::interval`.
      expires_at: new Date(now + Number(activeDays) * 86400000).toISOString(),
      created_at: createdAt,
      updated_at: createdAt,
    };
    db.nextIntentId += 1;
    db.purchaseIntents.push(row);
    return { rows: [{ id: row.id }], rowCount: 1 };
  }

  if (/^UPDATE purchase_intents SET status = 'closed'/i.test(text)) {
    const [id, buyerUserId] = params;
    const row = db.purchaseIntents.find(
      (item) =>
        sameId(item.id, id) && sameId(item.buyer_user_id, buyerUserId) && item.status !== "closed"
    );
    if (!row) return { rows: [], rowCount: 0 };
    row.status = "closed";
    row.updated_at = new Date(now).toISOString();
    return { rows: [], rowCount: 1 };
  }

  // --- purchase_intents: leitura do comprador ------------------------------
  if (/WHERE pi\.id = \$1 AND pi\.buyer_user_id = \$2/i.test(text)) {
    const [id, buyerUserId] = params;
    const row = db.purchaseIntents.find(
      (item) => sameId(item.id, id) && sameId(item.buyer_user_id, buyerUserId)
    );
    return { rows: row ? [projectBuyer(row, now)] : [], rowCount: row ? 1 : 0 };
  }

  if (/WHERE pi\.buyer_user_id = \$1/i.test(text)) {
    const [buyerUserId] = params;
    const hasCursor = /\(pi\.created_at, pi\.id\) </i.test(text);
    const limit = Number(params[params.length - 1]);

    let rows = sortDesc(
      db.purchaseIntents.filter((item) => sameId(item.buyer_user_id, buyerUserId))
    );
    if (hasCursor) {
      rows = rows.filter((row) => beforeCursor(row, params[1], params[2]));
    }
    return {
      rows: rows.slice(0, limit).map((row) => projectBuyer(row, now)),
      rowCount: rows.length,
    };
  }

  // --- purchase_intents: leitura do lojista ---------------------------------
  if (/WHERE pi\.id = \$1 AND pi\.city_id = \$2 AND pi\.status = 'active'/i.test(text)) {
    const [id, cityId] = params;
    const row = db.purchaseIntents.find(
      (item) =>
        sameId(item.id, id) &&
        sameId(item.city_id, cityId) &&
        item.status === "active" &&
        new Date(item.expires_at).getTime() > now
    );
    return { rows: row ? [projectDealer(row)] : [], rowCount: row ? 1 : 0 };
  }

  if (/WHERE pi\.city_id = \$1 AND pi\.status = 'active'/i.test(text)) {
    const [cityId] = params;
    const hasCursor = /\(pi\.created_at, pi\.id\) </i.test(text);
    const limit = Number(params[params.length - 1]);

    let rows = sortDesc(
      db.purchaseIntents.filter(
        (item) =>
          sameId(item.city_id, cityId) &&
          item.status === "active" &&
          new Date(item.expires_at).getTime() > now
      )
    );
    if (hasCursor) {
      rows = rows.filter((row) => beforeCursor(row, params[1], params[2]));
    }
    return { rows: rows.slice(0, limit).map(projectDealer), rowCount: rows.length };
  }

  // --- advertisers ----------------------------------------------------------
  //
  // Espelha `COALESCE(NULLIF(BTRIM(adv.status), ''), 'active') = $n`: NULL e ''
  // contam como ativo, porque a coluna é nullable em bancos legados e a própria
  // migration 012 faz esse backfill. Se o fake tratasse NULL como inativo, os
  // testes divergiriam do Postgres exatamente no caso que mais importa.
  if (/^SELECT adv\.id, adv\.user_id, adv\.city_id, adv\.status FROM advertisers adv/i.test(text)) {
    const [userId, activeStatus] = params;
    const rows = db.advertisers
      .filter((item) => sameId(item.user_id, userId))
      .filter((item) => advertiserStatusOf(item) === activeStatus)
      .sort((a, b) => Number(a.id) - Number(b.id));
    return { rows, rowCount: rows.length };
  }

  if (/^SELECT DISTINCT adv\.user_id AS user_id FROM advertisers adv JOIN users u/i.test(text)) {
    const [cityId, activeStatus] = params;
    const userIds = new Set();
    for (const advertiser of db.advertisers) {
      if (!sameId(advertiser.city_id, cityId)) continue;
      if (advertiser.user_id == null) continue;
      if (advertiserStatusOf(advertiser) !== activeStatus) continue;
      const user = db.users.find((item) => sameId(item.id, advertiser.user_id));
      if (!user) continue;
      if (
        String(user.document_type ?? "")
          .trim()
          .toLowerCase() !== "cnpj"
      )
        continue;
      userIds.add(String(advertiser.user_id));
    }
    return {
      rows: [...userIds].map((userId) => ({ user_id: userId })),
      rowCount: userIds.size,
    };
  }

  // --- user_notifications (módulo da Fase 1, exercitado de verdade) ---------
  if (/^INSERT INTO user_notifications/i.test(text)) {
    if (db.failNotificationInsert) {
      throw new Error("simulated notification outage");
    }
    const [recipientUserId, eventType, title, body, entityType, entityId, actionPath, , key] =
      params;

    // ON CONFLICT (recipient_user_id, idempotency_key) DO NOTHING.
    const clash = db.notifications.find(
      (item) => sameId(item.recipient_user_id, recipientUserId) && item.idempotency_key === key
    );
    if (clash) return { rows: [], rowCount: 0 };

    const row = {
      id: db.nextNotificationId,
      recipient_user_id: String(recipientUserId),
      event_type: eventType,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
      action_path: actionPath,
      payload: {},
      idempotency_key: key,
      read_at: null,
      created_at: new Date(now).toISOString(),
    };
    db.nextNotificationId += 1;
    db.notifications.push(row);
    return { rows: [row], rowCount: 1 };
  }

  if (
    /FROM user_notifications WHERE recipient_user_id = \$1 AND idempotency_key = \$2/i.test(text)
  ) {
    const [recipientUserId, key] = params;
    const row = db.notifications.find(
      (item) => sameId(item.recipient_user_id, recipientUserId) && item.idempotency_key === key
    );
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  return NOT_MATCHED;
}

/**
 * Ponto de entrada do fake. `now` é injetável para que os testes de expiração
 * não dependam do relógio da máquina.
 */
export const fakeClock = { now: () => Date.now() };

export async function fakeQuery(sql, params = []) {
  const text = normalize(sql);
  const result = handle(text, Array.isArray(params) ? params : [params], fakeClock.now());

  if (result === NOT_MATCHED) {
    throw new Error(`fake-db: query sem padrão correspondente:\n${text}`);
  }
  return result;
}

/**
 * `withTransaction` de mentira: executa o callback com o MESMO executor do pool.
 *
 * O que ele prova: que o service passa o cliente adiante em todos os passos
 * (uma consulta que esquecesse o `tx` continuaria funcionando aqui, mas o teste
 * de esquema/concorrência contra Postgres real pegaria a falta do lock).
 *
 * O que ele NÃO prova, e nem tenta: isolamento, `FOR UPDATE` e rollback. O
 * estado é um array em memória, e não existe segunda conexão para disputar com
 * ele. É por isso que o limite de 3 sob concorrência tem teste PRÓPRIO contra
 * PostgreSQL de verdade (tests/integration/purchase-intent-offers-*.js) — um
 * fake que "passasse" nesse cenário estaria só concordando consigo mesmo.
 */
export async function fakeWithTransaction(callback) {
  return callback({ query: (sql, params) => fakeQuery(sql, params) });
}
