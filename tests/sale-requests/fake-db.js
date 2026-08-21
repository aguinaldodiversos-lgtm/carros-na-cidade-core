// Postgres de mentira para os testes de solicitações de venda.
//
// NÃO é um mock que devolve linha pronta. Ele re-implementa de verdade o que os
// testes precisam provar: o escopo por dono, a contagem de abertas que alimenta
// o teto de 3, o `UNIQUE` global de `storage_key` e a ordenação por tupla.
//
// A diferença importa. Um mock que responde `{ rows: [linha] }` para qualquer
// SELECT passaria mesmo se alguém apagasse o `AND owner_user_id = $2` do
// repository — ou seja, provaria que o banco foi chamado, não que a autorização
// existe. Aqui, apagar essa cláusula faz o teste de IDOR falhar.
//
// O despacho é por REGEX sobre o SQL normalizado. Uma query nova sem padrão
// correspondente cai no `unmatched`, que LANÇA em vez de devolver `{ rows: [] }`
// silencioso — um retorno vazio faria o teste falhar numa asserção distante da
// causa.

const NOT_MATCHED = Symbol("unmatched");

export const db = {
  cities: [],
  users: [],
  /** Lojas — o que `resolveDealerStore` lê para decidir a cidade do lojista. */
  advertisers: [],
  saleRequests: [],
  saleRequestImages: [],
  /** Propostas (migration 055). APPEND-ONLY: nada aqui é reescrito. */
  saleRequestOffers: [],
  /**
   * Trilha de seleções (migration 057). APPEND-ONLY, e com o UNIQUE por
   * solicitação re-implementado no INSERT — não é decoração: é o que faz o teste
   * do §12 falhar se alguém remover o `ON CONFLICT`.
   */
  saleRequestOfferSelections: [],
  /**
   * Caixa postal interna. Existe aqui porque a notificação da seleção é gravada
   * DENTRO da transação (§22), então ela passa pelo mesmo executor — e um teste
   * que não a registrasse não teria como provar "uma notificação, exatamente
   * uma".
   */
  userNotifications: [],
  nextRequestId: 1,
  nextImageId: 1,
  nextOfferId: 1,
  nextSelectionId: 1,
  nextNotificationId: 1,
  /** Todas as chaves já usadas — espelha o UNIQUE GLOBAL da migration 053. */
  usedStorageKeys: new Set(),
};

export function resetDb(seed = {}) {
  db.cities = seed.cities ?? [];
  db.users = seed.users ?? [];
  db.advertisers = seed.advertisers ?? [];
  db.saleRequests = seed.saleRequests ?? [];
  db.saleRequestImages = seed.saleRequestImages ?? [];
  db.saleRequestOffers = seed.saleRequestOffers ?? [];
  db.saleRequestOfferSelections = seed.saleRequestOfferSelections ?? [];
  db.userNotifications = seed.userNotifications ?? [];
  db.nextRequestId = seed.nextRequestId ?? 1;
  db.nextImageId = seed.nextImageId ?? 1;
  db.nextOfferId = seed.nextOfferId ?? 1;
  db.nextSelectionId = seed.nextSelectionId ?? 1;
  db.nextNotificationId = seed.nextNotificationId ?? 1;
  db.usedStorageKeys = new Set(
    (seed.saleRequestImages ?? []).map((image) => image.storage_key)
  );
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

/**
 * Projeção de OWNER_COLUMNS — campo a campo, IGUAL ao repository real.
 *
 * Se este helper espalhasse `...row`, o teste de privacidade passaria a ver
 * `owner_user_id` vindo do fake e não do código sob teste — provaria o oposto do
 * que se quer provar.
 */
function projectOwner(row) {
  const city = cityOf(row.city_id);
  return {
    id: row.id,
    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    fipe_model_description: row.fipe_model_description,
    fipe_code: row.fipe_code,
    fipe_reference_value: row.fipe_reference_value,
    fipe_reference_at: row.fipe_reference_at,
    year: row.year,
    mileage: row.mileage,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    declared_condition: row.declared_condition,
    known_issues: row.known_issues,

    // Piso do proprietario (4.3.3). Linha semeada por teste antigo nao traz a
    // chave: vira null, que e o caso LEGADO, e nunca undefined.
    minimum_accepted_price: row.minimum_accepted_price ?? null,

    // Ficha de avaliação. `?? null` em cada uma: a linha semeada por um teste
    // antigo não traz estas chaves, e `undefined` no DTO seria indistinguível de
    // "campo removido" no `toMatchObject` de quem lê.
    tire_condition: row.tire_condition ?? null,
    financing_status: row.financing_status ?? null,
    financing_balance: row.financing_balance ?? null,
    fines_status: row.fines_status ?? null,
    fines_amount: row.fines_amount ?? null,
    ipva_status: row.ipva_status ?? null,
    ipva_amount_due: row.ipva_amount_due ?? null,
    licensing_status: row.licensing_status ?? null,
    caution_report_status: row.caution_report_status ?? null,
    auction_history: row.auction_history ?? null,
    collision_history: row.collision_history ?? null,
    engine_condition: row.engine_condition ?? null,
    engine_notes: row.engine_notes ?? null,
    gearbox_condition: row.gearbox_condition ?? null,
    gearbox_notes: row.gearbox_notes ?? null,
    suspension_condition: row.suspension_condition ?? null,
    suspension_notes: row.suspension_notes ?? null,
    body_paint_status: row.body_paint_status ?? null,
    body_paint_issues: row.body_paint_issues ?? null,
    body_paint_notes: row.body_paint_notes ?? null,

    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    city_name: city?.name ?? null,
    city_state: city?.state ?? null,
    city_slug: city?.slug ?? null,
  };
}

/**
 * Texto JSONB do INSERT → array, como o driver `pg` devolveria na leitura.
 *
 * `null` quando não é array: é o valor de uma linha legada, e colapsá-lo para
 * `[]` apagaria a diferença entre "não foi perguntado" e "respondeu que não há
 * detalhe nenhum".
 */
function parseJsonbArray(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
 * Projeção de DEALER_COLUMNS — campo a campo, IGUAL ao repository do lojista.
 *
 * Espalhar `...row` aqui faria o teste de privacidade ver `owner_user_id` vindo
 * do FAKE e não do código sob teste — provaria o oposto do que se quer provar.
 * A ausência de `owner_user_id` nesta lista é o que dá sentido à asserção.
 */
function projectDealer(row) {
  const city = cityOf(row.city_id);
  return {
    id: row.id,
    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    fipe_model_description: row.fipe_model_description,
    fipe_code: row.fipe_code,
    fipe_reference_value: row.fipe_reference_value ?? null,
    fipe_reference_at: row.fipe_reference_at ?? null,
    year: row.year,
    mileage: row.mileage,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    declared_condition: row.declared_condition,
    known_issues: row.known_issues ?? null,
    minimum_accepted_price: row.minimum_accepted_price ?? null,
    tire_condition: row.tire_condition ?? null,
    financing_status: row.financing_status ?? null,
    financing_balance: row.financing_balance ?? null,
    fines_status: row.fines_status ?? null,
    fines_amount: row.fines_amount ?? null,
    ipva_status: row.ipva_status ?? null,
    ipva_amount_due: row.ipva_amount_due ?? null,
    licensing_status: row.licensing_status ?? null,
    caution_report_status: row.caution_report_status ?? null,
    auction_history: row.auction_history ?? null,
    collision_history: row.collision_history ?? null,
    engine_condition: row.engine_condition ?? null,
    engine_notes: row.engine_notes ?? null,
    gearbox_condition: row.gearbox_condition ?? null,
    gearbox_notes: row.gearbox_notes ?? null,
    suspension_condition: row.suspension_condition ?? null,
    suspension_notes: row.suspension_notes ?? null,
    body_paint_status: row.body_paint_status ?? null,
    body_paint_issues: parseJsonbArray(row.body_paint_issues),
    body_paint_notes: row.body_paint_notes ?? null,
    status: row.status,
    created_at: row.created_at,
    city_name: city?.name ?? null,
    city_state: city?.state ?? null,
    city_slug: city?.slug ?? null,
  };
}

/**
 * Os predicados do feed são LIDOS DO SQL, não reescritos aqui.
 *
 * É o que dá poder de detecção ao fake. Se alguém apagar `sr.city_id = $1` do
 * repository, este extrator simplesmente não encontra a condição, o fake não
 * filtra por cidade e o teste "outra cidade não aparece" FALHA — que é o
 * comportamento desejado. Uma lista de filtros codificada aqui à mão continuaria
 * filtrando por conta própria e o teste passaria com o furo aberto.
 *
 * A cláusula de cursor `(sr.created_at, sr.id) < ($4::timestamptz, $5)` NÃO casa
 * este padrão (o nome da coluna vem seguido de vírgula, não de operador) e é
 * tratada à parte.
 */
function extractScalarConditions(text, params) {
  const conditions = [];
  const pattern = /sr\.([a-z_]+)\s*(>=|<=|=|<|>)\s*\$(\d+)/gi;
  let match = pattern.exec(text);
  while (match) {
    conditions.push({
      column: match[1],
      operator: match[2],
      value: params[Number(match[3]) - 1],
    });
    match = pattern.exec(text);
  }
  return conditions;
}

function matchesCondition(row, { column, operator, value }) {
  const actual = row[column] ?? null;
  if (actual == null) return false;

  if (operator === "=") return String(actual) === String(value);

  const left = Number(actual);
  const right = Number(value);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;

  if (operator === ">=") return left >= right;
  if (operator === "<=") return left <= right;
  if (operator === ">") return left > right;
  return left < right;
}

/** `ORDER BY sr.<col> <dir>, sr.id <dir>` — lido do SQL, pelo mesmo motivo. */
function extractOrder(text) {
  const match = /ORDER BY sr\.([a-z_]+) (ASC|DESC)/i.exec(text);
  if (!match) return { column: "created_at", direction: "DESC" };
  return { column: match[1], direction: match[2].toUpperCase() };
}

function compareByOrder(a, b, { column, direction }) {
  const rawA = a[column];
  const rawB = b[column];
  const isTime = column.endsWith("_at");
  const left = isTime ? new Date(rawA).getTime() : Number(rawA);
  const right = isTime ? new Date(rawB).getTime() : Number(rawB);

  let result = 0;
  if (left !== right) result = left < right ? -1 : 1;
  else if (Number(a.id) !== Number(b.id)) result = Number(a.id) < Number(b.id) ? -1 : 1;

  return direction === "DESC" ? -result : result;
}

/** Comparação de TUPLA do cursor, na direção da ordenação. */
function passesFeedCursor(row, { column, direction }, key, id) {
  const isTime = column.endsWith("_at");
  const rowKey = isTime ? new Date(row[column]).getTime() : Number(row[column]);
  const cursorKey = isTime ? new Date(key).getTime() : Number(key);

  if (rowKey !== cursorKey) {
    return direction === "ASC" ? rowKey > cursorKey : rowKey < cursorKey;
  }
  return direction === "ASC" ? Number(row.id) > Number(id) : Number(row.id) < Number(id);
}

/**
 * A loja de uma proposta, no formato que as queries de seleção projetam.
 *
 * O `LEFT JOIN cities` do repositório é reproduzido como `?? null`: uma loja sem
 * cidade resolvida aparece com nome e sem cidade — nunca some da lista. Um
 * `INNER JOIN` aqui esconderia a proposta dela do proprietário, que é uma
 * decisão de produto que ninguém tomou.
 */
function storeColumnsOf(advertiserId) {
  const advertiser = db.advertisers.find((item) => sameId(item.id, advertiserId));
  const city = advertiser ? cityOf(advertiser.city_id) : null;
  return {
    store_name: advertiser?.name ?? null,
    store_city_name: city?.name ?? null,
    store_city_state: city?.state ?? null,
  };
}

/**
 * A proposta ATUAL de cada loja — o `DISTINCT ON (advertiser_id)` do repositório.
 *
 * Re-implementado de verdade (a mais RECENTE por loja, e não a maior), e não
 * simulado devolvendo tudo: um fake que devolvesse o histórico inteiro faria o
 * teste de "uma linha por loja" passar mesmo se alguém apagasse o `DISTINCT ON`.
 */
function currentOffersOf(saleRequestId) {
  const byAdvertiser = new Map();

  for (const offer of db.saleRequestOffers) {
    if (!sameId(offer.sale_request_id, saleRequestId)) continue;

    const key = String(offer.advertiser_id);
    const current = byAdvertiser.get(key);
    const isNewer =
      !current ||
      new Date(offer.created_at).getTime() > new Date(current.created_at).getTime() ||
      (new Date(offer.created_at).getTime() === new Date(current.created_at).getTime() &&
        Number(offer.id) > Number(current.id));

    if (isNewer) byAdvertiser.set(key, offer);
  }

  return [...byAdvertiser.values()];
}

function handle(text, params, now) {
  // ==========================================================================
  // SELEÇÃO DE PROPOSTA (Fase 4.4)
  // ==========================================================================
  // Estes ramos vêm ANTES de tudo pelo mesmo motivo que os do lojista vêm antes
  // dos do dono: o SQL da seleção contém trechos que padrões mais genéricos
  // abaixo também casariam (`FROM sale_requests sr JOIN cities c`, por exemplo),
  // e o primeiro ramo a casar responde.

  // --- sale_requests: o LOCK da SELEÇÃO, escopado ao DONO -------------------
  //
  // A projeção é casada LITERALMENTE, incluindo `selected_offer_id`: ele é o
  // critério que distingue o retry idempotente do conflito, e precisa ser lido
  // na MESMA query do lock. Se alguém o mover para uma segunda leitura (fora do
  // mutex), este ramo deixa de casar e os testes de seleção caem — que é o
  // alarme certo.
  if (
    /^SELECT id, status, selected_offer_id FROM sale_requests WHERE id = \$1 AND owner_user_id = \$2 FOR UPDATE/i.test(
      text
    )
  ) {
    const [id, ownerUserId] = params;
    const row = db.saleRequests.find(
      (item) => sameId(item.id, id) && sameId(item.owner_user_id, ownerUserId)
    );
    return {
      rows: row
        ? [
            {
              id: row.id,
              status: row.status,
              // `?? null` e não `|| null`: a linha semeada sem a chave nunca
              // pode chegar ao service como `undefined`, que passaria
              // despercebido numa comparação de string.
              selected_offer_id: row.selected_offer_id ?? null,
            },
          ]
        : [],
      rowCount: row ? 1 : 0,
    };
  }

  // --- sale_request_offers: a oferta apontada, PROVADA como desta solicitação
  //
  // O `sale_request_id` entra no filtro de verdade. Apagá-lo do repository faz
  // o teste "oferta de outra solicitação é recusada" falhar — que é o ponto
  // deste fake existir.
  if (
    /^SELECT id, advertiser_id, dealer_user_id, amount FROM sale_request_offers WHERE id = \$1 AND sale_request_id = \$2/i.test(
      text
    )
  ) {
    const [offerId, saleRequestId] = params;
    const offer = db.saleRequestOffers.find(
      (item) => sameId(item.id, offerId) && sameId(item.sale_request_id, saleRequestId)
    );
    return {
      rows: offer
        ? [
            {
              id: offer.id,
              advertiser_id: offer.advertiser_id,
              dealer_user_id: offer.dealer_user_id,
              amount: offer.amount,
            },
          ]
        : [],
      rowCount: offer ? 1 : 0,
    };
  }

  // --- sale_request_offers: as propostas ATUAIS do proprietário -------------
  if (/FROM sale_request_offers o JOIN sale_requests sr ON sr\.id = o\.sale_request_id/i.test(text)) {
    const [saleRequestId, ownerUserId] = params;

    const saleRequest = db.saleRequests.find(
      (item) => sameId(item.id, saleRequestId) && sameId(item.owner_user_id, ownerUserId)
    );
    // O escopo por dono está no `WHERE` do repository. Apagá-lo de lá faz este
    // ramo devolver linhas para qualquer um — e o teste de IDOR falhar.
    if (!saleRequest) return { rows: [], rowCount: 0 };

    const rows = currentOffersOf(saleRequestId)
      .sort((a, b) => {
        const byAmount = Number(b.amount) - Number(a.amount);
        if (byAmount !== 0) return byAmount;
        return Number(b.id) - Number(a.id);
      })
      .map((offer) => ({
        id: offer.id,
        advertiser_id: offer.advertiser_id,
        amount: offer.amount,
        created_at: offer.created_at,
        ...storeColumnsOf(offer.advertiser_id),
      }));

    return { rows, rowCount: rows.length };
  }

  // --- sale_request_offer_selections: o INSERT da trilha --------------------
  //
  // O `ON CONFLICT (sale_request_id) DO NOTHING` é re-implementado: já existindo
  // seleção para a solicitação, devolve zero linhas. É o que prova que a rede
  // de segurança do §12 está no SQL, e não numa checagem em JS que o fake
  // pudesse estar simulando por conta própria.
  if (/^INSERT INTO sale_request_offer_selections/i.test(text)) {
    const [saleRequestId, offerId, advertiserId, selectedByUserId, amountSnapshot] = params;

    const exists = db.saleRequestOfferSelections.some((item) =>
      sameId(item.sale_request_id, saleRequestId)
    );
    if (exists) return { rows: [], rowCount: 0 };

    const row = {
      id: db.nextSelectionId,
      sale_request_id: saleRequestId,
      offer_id: offerId,
      advertiser_id: advertiserId,
      selected_by_user_id: selectedByUserId,
      amount_snapshot: amountSnapshot,
      selected_at: new Date(now).toISOString(),
    };
    db.nextSelectionId += 1;
    db.saleRequestOfferSelections.push(row);

    return { rows: [row], rowCount: 1 };
  }

  // --- sale_requests: aplica o ESTADO da seleção ----------------------------
  //
  // As TRÊS cláusulas do `WHERE` são reproduzidas — id, dono e status. Apagar
  // qualquer uma delas do repository faz um teste diferente falhar: a posse, a
  // transição única, ou as duas.
  if (/^UPDATE sale_requests SET status = \$4, selected_offer_id = \$3/i.test(text)) {
    const [id, ownerUserId, offerId, selectedStatus, receivingStatus] = params;

    const row = db.saleRequests.find(
      (item) =>
        sameId(item.id, id) &&
        sameId(item.owner_user_id, ownerUserId) &&
        item.status === receivingStatus
    );
    if (!row) return { rows: [], rowCount: 0 };

    row.status = selectedStatus;
    row.selected_offer_id = offerId;
    row.selected_offer_at = new Date(now).toISOString();
    row.updated_at = new Date(now).toISOString();
    return { rows: [], rowCount: 1 };
  }

  // --- sale_requests: a proposta SELECIONADA, para exibição -----------------
  if (/FROM sale_requests sr JOIN sale_request_offers o ON o\.id = sr\.selected_offer_id/i.test(text)) {
    const [saleRequestId, ownerUserId] = params;

    const saleRequest = db.saleRequests.find(
      (item) => sameId(item.id, saleRequestId) && sameId(item.owner_user_id, ownerUserId)
    );
    if (!saleRequest?.selected_offer_id) return { rows: [], rowCount: 0 };

    // INNER JOIN: sem a oferta não há linha. O CHECK de coerência da migration
    // 057 torna esse estado inexprimível no banco real; aqui a ausência de
    // fallback é o que faria um fake inconsistente aparecer como teste vermelho.
    const offer = db.saleRequestOffers.find((item) =>
      sameId(item.id, saleRequest.selected_offer_id)
    );
    if (!offer) return { rows: [], rowCount: 0 };

    return {
      rows: [
        {
          id: offer.id,
          advertiser_id: offer.advertiser_id,
          amount: offer.amount,
          selected_offer_at: saleRequest.selected_offer_at ?? null,
          ...storeColumnsOf(offer.advertiser_id),
        },
      ],
      rowCount: 1,
    };
  }

  // --- user_notifications: o INSERT idempotente ----------------------------
  //
  // O índice único `(recipient_user_id, idempotency_key)` é re-implementado:
  // a segunda chamada com a mesma chave não insere. É o que prova "uma
  // notificação, exatamente uma" no retry — em vez de o teste concordar consigo
  // mesmo contando um array que nunca recusa nada.
  if (/^INSERT INTO user_notifications/i.test(text)) {
    const [
      recipientUserId,
      eventType,
      title,
      body,
      entityType,
      entityId,
      actionPath,
      payload,
      idempotencyKey,
    ] = params;

    const exists = db.userNotifications.some(
      (item) =>
        sameId(item.recipient_user_id, recipientUserId) &&
        item.idempotency_key === idempotencyKey
    );
    if (exists) return { rows: [], rowCount: 0 };

    const row = {
      id: db.nextNotificationId,
      recipient_user_id: recipientUserId,
      event_type: eventType,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
      action_path: actionPath,
      payload: typeof payload === "string" ? JSON.parse(payload) : (payload ?? {}),
      idempotency_key: idempotencyKey,
      read_at: null,
      created_at: new Date(now).toISOString(),
    };
    db.nextNotificationId += 1;
    db.userNotifications.push(row);

    return { rows: [row], rowCount: 1 };
  }

  // --- user_notifications: a leitura do conflito idempotente ----------------
  if (/FROM user_notifications WHERE recipient_user_id = \$1 AND idempotency_key = \$2/i.test(text)) {
    const [recipientUserId, idempotencyKey] = params;
    const row = db.userNotifications.find(
      (item) =>
        sameId(item.recipient_user_id, recipientUserId) &&
        item.idempotency_key === idempotencyKey
    );
    return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
  }

  // ==========================================================================
  // ÁREA DO LOJISTA (Fase 4.3)
  // ==========================================================================
  // Estes ramos vêm PRIMEIRO por uma razão concreta, não por estilo: a consulta
  // de capas (`SELECT DISTINCT ON (sale_request_id) ... WHERE sale_request_id =
  // ANY(...)`) também casa o padrão da galeria em lote do dono, mais abaixo.
  // Invertida a ordem, o ramo do dono responderia primeiro e devolveria TODAS as
  // fotos onde o repository pediu uma capa por solicitação — o card mostraria a
  // foto certa por acidente e o teste de "capa é sort_order 0" passaria sem
  // provar nada.

  // --- sale_request_offers: LOCK da solicitação -----------------------------
  //
  // O fake não tem isolamento (é um array e uma "conexão" só), então o
  // `FOR UPDATE` aqui não serializa nada. O que este ramo prova é ALCANCE: que o
  // service pediu o lock da solicitação certa, JÁ ESCOPADO À CIDADE, antes de
  // ler a maior proposta. A serialização de verdade tem teste próprio contra
  // PostgreSQL real, com teste por mutação do lock.
  // A projeção é casada LITERALMENTE, incluindo `minimum_accepted_price`: o piso
  // é critério de aceitação da primeira proposta, e precisa ser lido na MESMA
  // query do lock. Se alguém movê-lo para uma segunda leitura (fora do mutex),
  // este ramo deixa de casar e os testes de oferta caem — que é o alarme certo.
  if (
    /^SELECT id, status, minimum_accepted_price FROM sale_requests WHERE id = \$1 AND city_id = \$2 FOR UPDATE/i.test(
      text
    )
  ) {
    const [id, cityId] = params;
    const row = db.saleRequests.find(
      (item) => sameId(item.id, id) && sameId(item.city_id, cityId)
    );
    return {
      rows: row
        ? [
            {
              id: row.id,
              status: row.status,
              // `?? null` e não `|| null`: a linha semeada sem a chave é o caso
              // LEGADO (anterior à 4.3.3), e ele precisa chegar ao service como
              // `null` — nunca como `undefined`, que passaria despercebido numa
              // comparação e nunca como 0, que seria um piso inventado.
              minimum_accepted_price: row.minimum_accepted_price ?? null,
            },
          ]
        : [],
      rowCount: row ? 1 : 0,
    };
  }

  // --- sale_request_offers: a MAIOR proposta --------------------------------
  if (/^SELECT amount FROM sale_request_offers WHERE sale_request_id = \$1 ORDER BY amount DESC/i.test(text)) {
    const rows = db.saleRequestOffers
      .filter((offer) => sameId(offer.sale_request_id, params[0]))
      .sort((a, b) => {
        const byAmount = Number(b.amount) - Number(a.amount);
        if (byAmount !== 0) return byAmount;
        return Number(b.id) - Number(a.id);
      });
    return rows.length
      ? { rows: [{ amount: rows[0].amount }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // --- sale_request_offers: a proposta VIGENTE de uma loja ------------------
  //
  // A mais RECENTE, não a maior — é a diferença que o repository documenta.
  if (/FROM sale_request_offers WHERE sale_request_id = \$1 AND advertiser_id = \$2 ORDER BY created_at DESC/i.test(text)) {
    const [saleRequestId, advertiserId] = params;
    const rows = db.saleRequestOffers
      .filter(
        (offer) =>
          sameId(offer.sale_request_id, saleRequestId) &&
          sameId(offer.advertiser_id, advertiserId)
      )
      .sort((a, b) => {
        const byDate = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byDate !== 0) return byDate;
        return Number(b.id) - Number(a.id);
      });
    return rows.length
      ? {
          rows: [
            {
              id: rows[0].id,
              amount: rows[0].amount,
              note: rows[0].note ?? null,
              created_at: rows[0].created_at,
            },
          ],
          rowCount: 1,
        }
      : { rows: [], rowCount: 0 };
  }

  // --- sale_request_offers: INSERT (append-only) ----------------------------
  if (/^INSERT INTO sale_request_offers/i.test(text)) {
    const [saleRequestId, dealerUserId, advertiserId, amount, note] = params;
    const row = {
      id: db.nextOfferId++,
      sale_request_id: saleRequestId,
      dealer_user_id: dealerUserId,
      advertiser_id: advertiserId,
      amount,
      note: note ?? null,
      created_at: new Date(now).toISOString(),
    };
    db.saleRequestOffers.push(row);
    return {
      rows: [{ id: row.id, amount: row.amount, note: row.note, created_at: row.created_at }],
      rowCount: 1,
    };
  }

  // --- sale_request_offers: contagem de uma solicitação ---------------------
  if (/^SELECT COUNT\(\*\)::int AS total FROM sale_request_offers WHERE sale_request_id = \$1/i.test(text)) {
    const total = db.saleRequestOffers.filter((offer) =>
      sameId(offer.sale_request_id, params[0])
    ).length;
    return { rows: [{ total }], rowCount: 1 };
  }

  // --- sale_request_offers: estado de disputa EM LOTE -----------------------
  if (/MAX\(amount\) FILTER \(WHERE advertiser_id = \$2\)/i.test(text)) {
    const ids = Array.isArray(params[0]) ? params[0] : [];
    const advertiserId = params[1];

    const grouped = new Map();
    for (const offer of db.saleRequestOffers) {
      if (!ids.some((id) => sameId(id, offer.sale_request_id))) continue;
      const key = String(offer.sale_request_id);
      const current = grouped.get(key) || { highest: null, mine: null, total: 0 };
      current.total += 1;
      if (current.highest == null || Number(offer.amount) > Number(current.highest)) {
        current.highest = offer.amount;
      }
      if (sameId(offer.advertiser_id, advertiserId)) {
        if (current.mine == null || Number(offer.amount) > Number(current.mine)) {
          current.mine = offer.amount;
        }
      }
      grouped.set(key, current);
    }

    return {
      rows: [...grouped.entries()].map(([saleRequestId, value]) => ({
        sale_request_id: saleRequestId,
        highest_amount: value.highest,
        my_amount: value.mine,
        total: value.total,
      })),
      rowCount: grouped.size,
    };
  }

  // --- sale_requests × ofertas da loja: as duas métricas do cabeçalho -------
  if (/LEFT JOIN LATERAL/i.test(text) && /FROM sale_requests sr/i.test(text)) {
    const [cityId, advertiserId, status] = params;
    const open = db.saleRequests.filter(
      (row) => sameId(row.city_id, cityId) && row.status === status
    );
    const withMine = open.filter((row) =>
      db.saleRequestOffers.some(
        (offer) =>
          sameId(offer.sale_request_id, row.id) && sameId(offer.advertiser_id, advertiserId)
      )
    ).length;
    return {
      rows: [{ with_mine: withMine, without_mine: open.length - withMine }],
      rowCount: 1,
    };
  }

  // --- advertisers: as lojas ELEGÍVEIS, com nome e cidade -------------------
  //
  // Query separada da do Produto 1 (logo abaixo) de propósito: aquela é o SQL
  // que a suíte de procuras casa por regex, e acrescentar um JOIN nela quebraria
  // o outro domínio. Esta é a do seletor de loja.
  if (/^SELECT adv.id AS advertiser_id/i.test(text)) {
    const [userId, activeStatus] = params;
    const rows = db.advertisers
      .filter((advertiser) => {
        if (!sameId(advertiser.user_id, userId)) return false;
        const status = String(advertiser.status ?? "").trim();
        if ((status === "" ? "active" : status) !== activeStatus) return false;
        // JOIN INNER com cities: loja cuja city_id não casa o catálogo não é
        // elegível — ela não veria feed nenhum.
        return cityOf(advertiser.city_id) != null;
      })
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((advertiser) => {
        const city = cityOf(advertiser.city_id);
        return {
          advertiser_id: advertiser.id,
          advertiser_name: advertiser.name ?? null,
          city_id: advertiser.city_id,
          city_name: city?.name ?? null,
          city_state: city?.state ?? null,
        };
      });
    return { rows, rowCount: rows.length };
  }

  // --- advertisers: a loja que resolve a cidade do lojista ------------------
  if (/^SELECT adv\.id, adv\.user_id, adv\.city_id, adv\.status FROM advertisers adv/i.test(text)) {
    const [userId, activeStatus] = params;
    const rows = db.advertisers
      .filter((advertiser) => {
        if (!sameId(advertiser.user_id, userId)) return false;
        // Espelha COALESCE(NULLIF(BTRIM(status), ''), 'active') = $2:
        // NULL e string vazia contam como ATIVO.
        const status = String(advertiser.status ?? "").trim();
        return (status === "" ? "active" : status) === activeStatus;
      })
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((advertiser) => ({
        id: advertiser.id,
        user_id: advertiser.user_id,
        city_id: advertiser.city_id ?? null,
        status: advertiser.status ?? null,
      }));
    return { rows, rowCount: rows.length };
  }

  // --- sale_request_images: CAPA de várias solicitações --------------------
  if (/^SELECT DISTINCT ON \(sale_request_id\)/i.test(text)) {
    const ids = Array.isArray(params[0]) ? params[0] : [];
    const seen = new Set();
    const rows = db.saleRequestImages
      .filter((image) => ids.some((id) => sameId(id, image.sale_request_id)))
      .sort((a, b) => {
        if (!sameId(a.sale_request_id, b.sale_request_id)) {
          return Number(a.sale_request_id) - Number(b.sale_request_id);
        }
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return Number(a.id) - Number(b.id);
      })
      .filter((image) => {
        const key = String(image.sale_request_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((image) => ({
        sale_request_id: image.sale_request_id,
        storage_key: image.storage_key,
      }));
    return { rows, rowCount: rows.length };
  }

  // --- sale_request_images: galeria de UMA solicitação ---------------------
  if (/FROM sale_request_images WHERE sale_request_id = \$1/i.test(text)) {
    const rows = db.saleRequestImages
      .filter((image) => sameId(image.sale_request_id, params[0]))
      .sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return Number(a.id) - Number(b.id);
      })
      .map((image) => ({ storage_key: image.storage_key, sort_order: image.sort_order }));
    return { rows, rowCount: rows.length };
  }

  // --- sale_requests: métricas do feed -------------------------------------
  if (/COUNT\(\*\)::int AS total, COUNT\(\*\) FILTER/i.test(text)) {
    const conditions = extractScalarConditions(text, params);
    const rows = db.saleRequests.filter((row) =>
      conditions.every((condition) => matchesCondition(row, condition))
    );
    const dayAgo = now - 24 * 60 * 60 * 1000;
    return {
      rows: [
        {
          total: rows.length,
          new_today: rows.filter((row) => new Date(row.created_at).getTime() >= dayAgo).length,
        },
      ],
      rowCount: 1,
    };
  }

  // --- sale_requests: DETALHE do lojista ------------------------------------
  //
  // As DUAS condições de visibilidade da Fase 4.4, re-implementadas de verdade:
  //
  //   `receiving_offers` → qualquer loja da cidade;
  //   `offer_selected`   → SÓ a loja cuja proposta foi a escolhida.
  //
  // A segunda comparação (`sel.advertiser_id = $5`) é o que faz o teste de
  // "lojista perdedor recebe 404" falhar se alguém a apagar do repository. Um
  // fake que ignorasse o advertiser devolveria a ficha para todo mundo e o teste
  // passaria enquanto a privacidade estivesse quebrada.
  if (
    /WHERE sr\.id = \$1 AND sr\.city_id = \$2 AND \( sr\.status = \$3 OR \(sr\.status = \$4 AND sel\.advertiser_id = \$5\) \)/i.test(
      text
    )
  ) {
    const [id, cityId, openStatus, selectedStatus, advertiserId] = params;

    const row = db.saleRequests.find(
      (item) => sameId(item.id, id) && sameId(item.city_id, cityId)
    );
    if (!row) return { rows: [], rowCount: 0 };

    // LEFT JOIN pelo `selected_offer_id` — a proposta ESCOLHIDA, não "uma
    // proposta desta loja".
    const selectedOffer = row.selected_offer_id
      ? db.saleRequestOffers.find((offer) => sameId(offer.id, row.selected_offer_id))
      : null;

    const visible =
      row.status === openStatus ||
      (row.status === selectedStatus &&
        selectedOffer != null &&
        sameId(selectedOffer.advertiser_id, advertiserId));

    if (!visible) return { rows: [], rowCount: 0 };

    return {
      rows: [
        {
          ...projectDealer(row),
          selected_offer_at: row.selected_offer_at ?? null,
          selected_offer_amount: selectedOffer?.amount ?? null,
        },
      ],
      rowCount: 1,
    };
  }

  // --- sale_requests: FEED do lojista ---------------------------------------
  //
  // Cidade, estado e filtros saem todos de `extractScalarConditions`, que LÊ o
  // SQL do repository. Nenhum deles é reimplementado aqui — ver o comentário
  // daquela função.
  if (/FROM sale_requests sr JOIN cities c/i.test(text) && /WHERE sr\.city_id = \$1/i.test(text)) {
    const conditions = extractScalarConditions(text, params);
    const order = extractOrder(text);
    const limit = Number(params[params.length - 1]);

    let rows = db.saleRequests.filter((row) =>
      conditions.every((condition) => matchesCondition(row, condition))
    );

    const cursorMatch = /\(sr\.[a-z_]+, sr\.id\) [<>] \(\$(\d+)(?:::timestamptz)?, \$(\d+)\)/i.exec(
      text
    );
    if (cursorMatch) {
      const key = params[Number(cursorMatch[1]) - 1];
      const id = params[Number(cursorMatch[2]) - 1];
      rows = rows.filter((row) => passesFeedCursor(row, order, key, id));
    }

    rows.sort((a, b) => compareByOrder(a, b, order));

    return {
      rows: rows.slice(0, limit).map(projectDealer),
      rowCount: rows.length,
    };
  }

  // --- cities ---------------------------------------------------------------
  if (/^SELECT id, name, state, slug FROM cities WHERE id = \$1/i.test(text)) {
    const city = cityOf(params[0]);
    return { rows: city ? [city] : [], rowCount: city ? 1 : 0 };
  }

  // --- users: o LOCK da criação --------------------------------------------
  //
  // O fake não tem isolamento (é um array e uma "conexão" só), então o
  // `FOR UPDATE` aqui não serializa nada. O que este ramo prova é ALCANCE: que o
  // service pediu o lock da conta certa antes de contar. A serialização de
  // verdade tem teste próprio contra PostgreSQL real.
  if (/^SELECT id FROM users WHERE id = \$1 FOR UPDATE/i.test(text)) {
    const user = db.users.find((item) => sameId(item.id, params[0]));
    return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 };
  }

  // --- sale_requests: contagem de abertas ----------------------------------
  if (/SELECT COUNT\(\*\)::int AS total FROM sale_requests/i.test(text)) {
    const [ownerUserId, status] = params;
    const total = db.saleRequests.filter(
      (item) => sameId(item.owner_user_id, ownerUserId) && item.status === status
    ).length;
    return { rows: [{ total }], rowCount: 1 };
  }

  // --- sale_requests: escrita ----------------------------------------------
  if (/^INSERT INTO sale_requests/i.test(text)) {
    const [
      ownerUserId,
      cityId,
      brand,
      brandSlug,
      model,
      modelSlug,
      fipeModelDescription,
      fipeCode,
      fipeReferenceValue,
      fipeReferenceAt,
      year,
      mileage,
      transmission,
      fuelType,
      declaredCondition,
      knownIssues,
      tireCondition,
      financingStatus,
      financingBalance,
      finesStatus,
      finesAmount,
      ipvaStatus,
      ipvaAmountDue,
      licensingStatus,
      cautionReportStatus,
      auctionHistory,
      collisionHistory,
      engineCondition,
      engineNotes,
      gearboxCondition,
      gearboxNotes,
      suspensionCondition,
      suspensionNotes,
      bodyPaintStatus,
      bodyPaintIssuesJson,
      bodyPaintNotes,
      minimumAcceptedPrice,
    ] = params;

    const createdAt = new Date(now).toISOString();
    const row = {
      id: db.nextRequestId,
      owner_user_id: String(ownerUserId),
      city_id: cityId,
      brand,
      brand_slug: brandSlug,
      model,
      model_slug: modelSlug,
      fipe_model_description: fipeModelDescription,
      fipe_code: fipeCode ?? null,
      fipe_reference_value: fipeReferenceValue ?? null,
      fipe_reference_at: fipeReferenceAt ?? null,
      year,
      mileage,
      transmission,
      fuel_type: fuelType,
      declared_condition: declaredCondition,
      known_issues: knownIssues ?? null,

      tire_condition: tireCondition ?? null,
      financing_status: financingStatus ?? null,
      financing_balance: financingBalance ?? null,
      fines_status: finesStatus ?? null,
      fines_amount: finesAmount ?? null,
      ipva_status: ipvaStatus ?? null,
      ipva_amount_due: ipvaAmountDue ?? null,
      licensing_status: licensingStatus ?? null,
      caution_report_status: cautionReportStatus ?? null,
      auction_history: auctionHistory ?? null,
      collision_history: collisionHistory ?? null,
      engine_condition: engineCondition ?? null,
      engine_notes: engineNotes ?? null,
      gearbox_condition: gearboxCondition ?? null,
      gearbox_notes: gearboxNotes ?? null,
      suspension_condition: suspensionCondition ?? null,
      suspension_notes: suspensionNotes ?? null,
      body_paint_status: bodyPaintStatus ?? null,
      // O repositório manda TEXTO com cast `::jsonb`. Desserializar aqui é o que
      // faz o fake devolver o mesmo array que o Postgres devolveria — e é o que
      // pegaria um dia em que alguém trocasse o cast por um array JS cru.
      body_paint_issues: parseJsonbArray(bodyPaintIssuesJson),
      body_paint_notes: bodyPaintNotes ?? null,

      // O PISO do proprietario (4.3.3). Posicional, como todo o resto: se alguem
      // acrescentar coluna ao INSERT sem acrescentar aqui, o valor entra na
      // chave errada e o teste que le o piso falha.
      minimum_accepted_price: minimumAcceptedPrice ?? null,

      // Espelha o literal 'receiving_offers' do INSERT real: o estado inicial é
      // do domínio, não da chamada.
      status: "receiving_offers",
      created_at: createdAt,
      updated_at: createdAt,
    };
    db.nextRequestId += 1;
    db.saleRequests.push(row);
    return { rows: [{ id: row.id }], rowCount: 1 };
  }

  if (/^INSERT INTO sale_request_images/i.test(text)) {
    const [saleRequestId, keys, orders] = params;
    const keyList = Array.isArray(keys) ? keys : [];
    const orderList = Array.isArray(orders) ? orders : [];

    for (let index = 0; index < keyList.length; index += 1) {
      const storageKey = keyList[index];

      // UNIQUE GLOBAL de `storage_key`. Sem `ON CONFLICT` no SQL real, então a
      // colisão precisa LANÇAR aqui também — é o que faz a transação abortar e o
      // teste de atomicidade valer alguma coisa.
      if (db.usedStorageKeys.has(storageKey)) {
        const error = new Error(
          'duplicate key value violates unique constraint "sale_request_images_storage_key_key"'
        );
        error.code = "23505";
        throw error;
      }

      db.usedStorageKeys.add(storageKey);
      db.saleRequestImages.push({
        id: db.nextImageId,
        sale_request_id: saleRequestId,
        storage_key: storageKey,
        sort_order: orderList[index] ?? index,
      });
      db.nextImageId += 1;
    }

    return { rows: [], rowCount: keyList.length };
  }

  if (/^UPDATE sale_requests SET status = \$3/i.test(text)) {
    const [id, ownerUserId, cancelled, receiving] = params;
    const row = db.saleRequests.find(
      (item) =>
        sameId(item.id, id) &&
        sameId(item.owner_user_id, ownerUserId) &&
        item.status === receiving
    );
    if (!row) return { rows: [], rowCount: 0 };
    row.status = cancelled;
    row.updated_at = new Date(now).toISOString();
    return { rows: [], rowCount: 1 };
  }

  // --- sale_request_images: leitura em lote --------------------------------
  if (/FROM sale_request_images WHERE sale_request_id = ANY/i.test(text)) {
    const ids = Array.isArray(params[0]) ? params[0] : [];
    const rows = db.saleRequestImages
      .filter((image) => ids.some((id) => sameId(id, image.sale_request_id)))
      .sort((a, b) => {
        if (!sameId(a.sale_request_id, b.sale_request_id)) {
          return Number(a.sale_request_id) - Number(b.sale_request_id);
        }
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return Number(a.id) - Number(b.id);
      })
      .map((image) => ({
        sale_request_id: image.sale_request_id,
        storage_key: image.storage_key,
        sort_order: image.sort_order,
      }));
    return { rows, rowCount: rows.length };
  }

  // --- sale_requests: leitura do dono --------------------------------------
  if (/WHERE sr\.id = \$1 AND sr\.owner_user_id = \$2/i.test(text)) {
    const [id, ownerUserId] = params;
    const row = db.saleRequests.find(
      (item) => sameId(item.id, id) && sameId(item.owner_user_id, ownerUserId)
    );
    return { rows: row ? [projectOwner(row)] : [], rowCount: row ? 1 : 0 };
  }

  if (/WHERE sr\.owner_user_id = \$1/i.test(text)) {
    const [ownerUserId] = params;
    const hasCursor = /\(sr\.created_at, sr\.id\) </i.test(text);
    const limit = Number(params[params.length - 1]);

    let rows = sortDesc(
      db.saleRequests.filter((item) => sameId(item.owner_user_id, ownerUserId))
    );
    if (hasCursor) {
      rows = rows.filter((row) => beforeCursor(row, params[1], params[2]));
    }
    return {
      rows: rows.slice(0, limit).map(projectOwner),
      rowCount: rows.length,
    };
  }

  return NOT_MATCHED;
}

/** `now` injetável para que os testes não dependam do relógio da máquina. */
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
 * O que ele prova: que o service passa o cliente adiante em todos os passos.
 *
 * O que ele NÃO prova, e nem tenta: isolamento, `FOR UPDATE` e rollback. O
 * estado é um array em memória e não existe segunda conexão para disputar com
 * ele — é por isso que o teto de 3 sob concorrência tem teste PRÓPRIO contra
 * PostgreSQL de verdade (tests/integration/sale-requests-concurrency...). Um
 * fake que "passasse" nesse cenário estaria só concordando consigo mesmo.
 *
 * O ROLLBACK é simulado de forma grosseira e HONESTA: se o callback lançar, o
 * estado NÃO é revertido aqui. Por isso o teste de atomicidade real também vive
 * na integração.
 */
export async function fakeWithTransaction(callback) {
  return callback({ query: (sql, params) => fakeQuery(sql, params) });
}
