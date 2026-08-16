// Acesso a dados das solicitações de venda. TODAS as queries são
// parametrizadas ($1,$2,...).
//
// ────────────────────────────────────────────────────────────────────────────
// REGRA DE OURO (herdada de purchase-intents.repository.js)
// ────────────────────────────────────────────────────────────────────────────
// Nenhuma função aceita "o id da solicitação" sozinho. Toda leitura e toda
// escrita do dono carregam `ownerUserId` no WHERE — a autorização acontece
// DENTRO da query, não num `if` do service. Um SELECT seguido de checagem em JS
// teria janela de corrida e, pior, um caminho novo poderia esquecer o `if`.
//
// ────────────────────────────────────────────────────────────────────────────
// `OWNER_COLUMNS` É ALLOWLIST, NUNCA `SELECT *`
// ────────────────────────────────────────────────────────────────────────────
// `owner_user_id` NÃO está na lista: o dono já sabe quem é, e a coluna não tem
// por que trafegar. Mais importante, a lista é o contrato que a Fase 4.2 vai
// espelhar num `DEALER_COLUMNS` separado — e uma allowlist só protege se existir
// ANTES de haver um segundo público. Com `SELECT *`, adicionar uma coluna
// sensível amanhã a entregaria de graça aos dois.
//
// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR INJETÁVEL (`exec`)
// ────────────────────────────────────────────────────────────────────────────
// As funções da criação recebem `exec`: sem pool quando ausente, cliente da
// TRANSAÇÃO quando presente. Sem isso, o `SELECT ... FOR UPDATE` do limite
// ficaria numa conexão e o `INSERT` em outra — o lock não valeria nada e o teto
// de 3 seria furável por dois cliques simultâneos.

import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";

/** Pool por omissão; cliente da transação quando fornecido. */
function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * Colunas devolvidas ao DONO da solicitação.
 *
 * Sem `owner_user_id`. Sem nada de `users` — a query nem faz JOIN nessa tabela,
 * então e-mail, telefone, documento e nome não têm por onde vazar.
 */
const OWNER_COLUMNS = `
  sr.id,
  sr.brand,
  sr.brand_slug,
  sr.model,
  sr.model_slug,
  sr.fipe_model_description,
  sr.fipe_code,
  sr.fipe_reference_value,
  sr.fipe_reference_at,
  sr.year,
  sr.mileage,
  sr.transmission,
  sr.fuel_type,
  sr.declared_condition,
  sr.known_issues,
  sr.status,
  sr.created_at,
  sr.updated_at,
  c.name  AS city_name,
  c.state AS city_state,
  c.slug  AS city_slug
`;

/** Cidade do catálogo. Usado para provar que o `city_id` escolhido existe. */
export async function findCityById(cityId, exec) {
  const result = await runner(exec)(
    `SELECT id, name, state, slug FROM cities WHERE id = $1 LIMIT 1`,
    [cityId]
  );
  return result.rows[0] ?? null;
}

/**
 * TRAVA a linha do usuário — o ponto de serialização da criação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O LOCK É EM `users`, E NÃO EM `sale_requests`
 * ────────────────────────────────────────────────────────────────────────────
 * O invariante que precisa ser serializado é "quantas solicitações ABERTAS este
 * usuário tem". No instante da criação ainda NÃO existe a linha nova que
 * poderia servir de mutex, e `SELECT ... FOR UPDATE` sobre as linhas já
 * existentes não resolve o caso do usuário com ZERO solicitações — não há
 * nenhuma linha para travar, então dois requests simultâneos passariam os dois.
 *
 * É a mesma razão pela qual a Fase 3 trava `purchase_intents` (a procura) e não
 * `purchase_intent_offers` (as ofertas): trava-se a entidade que EXISTE e cujo
 * invariante global está sendo modificado. Aqui essa entidade é a CONTA.
 *
 * Consequência aceita: dois requests do MESMO usuário serializam. Isso é
 * exatamente o desejado — é o duplo clique que precisamos ordenar. Usuários
 * diferentes travam linhas diferentes e não se bloqueiam.
 *
 * @returns {Promise<{ id: string }|null>} `null` quando o usuário não existe
 */
export async function lockOwnerForCreate(ownerUserId, exec) {
  const result = await runner(exec)(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [ownerUserId]);
  return result.rows[0] ?? null;
}

/**
 * Quantas solicitações ABERTAS o usuário tem.
 *
 * Só conta `receiving_offers`: cancelada não ocupa vaga, então quem cancelou e
 * quer republicar não fica preso pelo próprio histórico.
 *
 * A contagem só é confiável DENTRO da transação que já chamou
 * `lockOwnerForCreate` — é o lock que faz esta leitura enxergar o INSERT do
 * request anterior.
 */
export async function countOpenByOwner(ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT COUNT(*)::int AS total
    FROM sale_requests
    WHERE owner_user_id = $1
      AND status = $2
    `,
    [ownerUserId, SALE_REQUEST_STATUS.RECEIVING_OFFERS]
  );
  return result.rows[0]?.total ?? 0;
}

/**
 * Insere a solicitação já ABERTA.
 *
 * `status` é literal na query e não parâmetro: o estado inicial é do domínio,
 * não da chamada. Um parâmetro aqui permitiria a um caminho futuro criar a linha
 * já cancelada por engano.
 */
export async function insertSaleRequest(input, exec) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_requests (
      owner_user_id, city_id,
      brand, brand_slug, model, model_slug, fipe_model_description,
      fipe_code, fipe_reference_value, fipe_reference_at,
      year, mileage, transmission, fuel_type,
      declared_condition, known_issues,
      status
    )
    VALUES (
      $1, $2,
      $3, $4, $5, $6, $7,
      $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16,
      'receiving_offers'
    )
    RETURNING id
    `,
    [
      input.ownerUserId,
      input.cityId,
      input.brand,
      input.brandSlug,
      input.model,
      input.modelSlug,
      input.fipeModelDescription,
      input.fipeCode,
      input.fipeReferenceValue,
      input.fipeReferenceAt,
      input.year,
      input.mileage,
      input.transmission,
      input.fuelType,
      input.declaredCondition,
      input.knownIssues,
    ]
  );

  return result.rows[0]?.id ?? null;
}

/**
 * Insere a galeria inteira em UMA query.
 *
 * `unnest` em vez de N INSERTs: doze round-trips dentro de uma transação
 * mantêm o lock do usuário preso por doze latências de rede, e o lock é o
 * recurso mais caro deste caminho.
 *
 * SEM `ON CONFLICT`: a colisão do `UNIQUE` global de `storage_key` DEVE derrubar
 * a transação. Uma chave já usada por outra solicitação significa que algo está
 * errado (reenvio de formulário antigo, ou tentativa de reivindicar objeto
 * alheio que passou pela validação de prefixo), e engolir isso silenciosamente
 * criaria uma solicitação com menos fotos do que a pessoa enviou — sem erro.
 */
export async function insertSaleRequestImages({ saleRequestId, photos }, exec) {
  if (!Array.isArray(photos) || photos.length === 0) return 0;

  const result = await runner(exec)(
    `
    INSERT INTO sale_request_images (sale_request_id, storage_key, sort_order)
    SELECT $1, key, ord
    FROM UNNEST($2::text[], $3::int[]) AS t(key, ord)
    `,
    [saleRequestId, photos.map((p) => p.storageKey), photos.map((p) => p.sortOrder)]
  );

  return result.rowCount ?? 0;
}

/**
 * Página de solicitações de UM dono, mais recentes primeiro.
 *
 * `limit + 1` para descobrir se há próxima página sem COUNT, e comparação de
 * TUPLA no cursor — um `created_at <` puro perderia linhas com timestamp
 * idêntico, e `<=` as repetiria.
 *
 * Inclui canceladas: para o dono isso é histórico, e sumir com o que ele
 * publicou seria esconder trabalho dele.
 */
export async function listByOwner({ ownerUserId, limit, cursor }) {
  const params = [ownerUserId];
  let cursorClause = "";

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorClause = `AND (sr.created_at, sr.id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }

  params.push(limit + 1);

  const result = await query(
    `
    SELECT ${OWNER_COLUMNS}
    FROM sale_requests sr
    JOIN cities c ON c.id = sr.city_id
    WHERE sr.owner_user_id = $1
    ${cursorClause}
    ORDER BY sr.created_at DESC, sr.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows.slice(0, limit);
  return { rows, hasMore: result.rows.length > limit };
}

/** UMA solicitação, escopada ao dono. Linha de outra pessoa simplesmente não casa. */
export async function getByIdForOwner(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT ${OWNER_COLUMNS}
    FROM sale_requests sr
    JOIN cities c ON c.id = sr.city_id
    WHERE sr.id = $1
      AND sr.owner_user_id = $2
    LIMIT 1
    `,
    [saleRequestId, ownerUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * Fotos de VÁRIAS solicitações, em lote.
 *
 * Uma query para a página inteira — é o que impede o N+1 da listagem. Devolve
 * `storage_key` cru; a conversão para URL pública é do service, que usa o
 * helper canônico do projeto.
 *
 * @returns {Promise<Map<string, Array<{ storage_key: string, sort_order: number }>>>}
 */
export async function listImagesByRequestIds(saleRequestIds) {
  const ids = Array.from(
    new Set(
      (saleRequestIds || [])
        .map((id) => String(id ?? "").trim())
        .filter((id) => /^\d+$/.test(id))
    )
  );

  if (ids.length === 0) return new Map();

  const result = await query(
    `
    SELECT sale_request_id, storage_key, sort_order
    FROM sale_request_images
    WHERE sale_request_id = ANY($1::bigint[])
    ORDER BY sale_request_id, sort_order, id
    `,
    [ids]
  );

  const map = new Map();
  for (const row of result.rows) {
    const key = String(row.sale_request_id);
    const current = map.get(key) || [];
    current.push({ storage_key: row.storage_key, sort_order: row.sort_order });
    map.set(key, current);
  }
  return map;
}

/**
 * Cancela a solicitação, com a posse dentro do próprio UPDATE.
 *
 * Não existe SELECT-checa-UPDATE aqui: `AND owner_user_id = $2` É a autorização.
 * `AND status = 'receiving_offers'` garante que só o estado cancelável muda, e é
 * também o que torna o retry seguro — o segundo clique não casa nenhuma linha e
 * não reescreve `updated_at`.
 *
 * Quando o UPDATE não casa pode ser (a) já cancelada ou (b) inexistente/de outro
 * dono, e essas duas coisas precisam de respostas diferentes. O SELECT de
 * desempate é igualmente escopado ao dono, então continua impossível descobrir a
 * solicitação alheia por aqui.
 *
 * NUNCA `DELETE`: cancelar é mudança de estado. A linha permanece no histórico.
 *
 * @returns {Promise<{ row: object|null, changed: boolean }>}
 */
export async function cancelForOwner(saleRequestId, ownerUserId) {
  const updated = await query(
    `
    UPDATE sale_requests
    SET status = $3,
        updated_at = NOW()
    WHERE id = $1
      AND owner_user_id = $2
      AND status = $4
    `,
    [
      saleRequestId,
      ownerUserId,
      SALE_REQUEST_STATUS.CANCELLED,
      SALE_REQUEST_STATUS.RECEIVING_OFFERS,
    ]
  );

  const row = await getByIdForOwner(saleRequestId, ownerUserId);
  return { row, changed: (updated.rowCount ?? 0) > 0 };
}
