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
  saleRequests: [],
  saleRequestImages: [],
  nextRequestId: 1,
  nextImageId: 1,
  /** Todas as chaves já usadas — espelha o UNIQUE GLOBAL da migration 053. */
  usedStorageKeys: new Set(),
};

export function resetDb(seed = {}) {
  db.cities = seed.cities ?? [];
  db.users = seed.users ?? [];
  db.saleRequests = seed.saleRequests ?? [];
  db.saleRequestImages = seed.saleRequestImages ?? [];
  db.nextRequestId = seed.nextRequestId ?? 1;
  db.nextImageId = seed.nextImageId ?? 1;
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
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
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

function handle(text, params, now) {
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
