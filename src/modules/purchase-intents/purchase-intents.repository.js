// Acesso a dados das procuras. TODAS as queries são parametrizadas ($1,$2,...).
//
// REGRA DE OURO (herdada de notifications.repository.js): nenhuma função aceita
// "o id da procura" sozinho. Toda leitura e toda escrita do comprador carregam
// `buyerUserId` no WHERE, e toda leitura do lojista carrega `cityId` — a
// autorização acontece DENTRO da query, não num `if` do service. Um SELECT
// seguido de checagem em JS teria janela de corrida e, pior, um caminho novo
// poderia esquecer o `if`.
//
// DUAS LISTAS DE COLUNAS, DE PROPÓSITO
//
// `BUYER_COLUMNS` e `DEALER_COLUMNS` são allowlists separadas. A do lojista NÃO
// contém `buyer_user_id` — não porque o front esconde, mas porque a coluna nem
// sai do banco. `SELECT *` seguido de `delete row.buyer_user_id` no service
// falharia silenciosamente no dia em que alguém adicionasse uma coluna nova, e
// é exatamente esse dia que a allowlist protege.

import { query } from "../../infrastructure/database/db.js";
import { ADVERTISER_STATUS } from "../../shared/constants/status.js";

/** Colunas devolvidas ao DONO da procura. Sem `buyer_user_id`: ele já sabe quem é. */
const BUYER_COLUMNS = `
  pi.id,
  pi.intent_type,
  pi.brand,
  pi.brand_slug,
  pi.model,
  pi.model_slug,
  pi.body_type,
  pi.transmission,
  pi.max_price,
  pi.purchase_timeframe,
  pi.status,
  pi.expires_at,
  pi.created_at,
  pi.updated_at,
  (pi.expires_at <= NOW()) AS is_expired,
  c.name  AS city_name,
  c.state AS city_state,
  c.slug  AS city_slug
`;

/**
 * Colunas devolvidas ao LOJISTA. Allowlist mínima.
 *
 * Ausentes de propósito: buyer_user_id, e qualquer coisa que permita chegar ao
 * comprador. Nome, e-mail, telefone e documento nem sequer são JOINados — a
 * query não toca em `users`.
 */
const DEALER_COLUMNS = `
  pi.id,
  pi.intent_type,
  pi.brand,
  pi.model,
  pi.body_type,
  pi.transmission,
  pi.max_price,
  pi.purchase_timeframe,
  pi.created_at,
  pi.expires_at,
  c.name  AS city_name,
  c.state AS city_state,
  c.slug  AS city_slug
`;

/** Cidade do catálogo. Usado para provar que o `city_id` escolhido existe. */
export async function findCityById(cityId) {
  const result = await query(`SELECT id, name, state, slug FROM cities WHERE id = $1 LIMIT 1`, [
    cityId,
  ]);
  return result.rows[0] ?? null;
}

/**
 * Insere a procura já ATIVA, com `expires_at` calculado pelo BANCO.
 *
 * `NOW() + ($N || ' days')::interval` em vez de uma data montada em JS: o
 * relógio que vale é o do Postgres, o mesmo que a leitura do lojista compara em
 * `expires_at > NOW()`. Com a data vinda da aplicação, um servidor com relógio
 * adiantado publicaria procuras que nascem vencidas — ou que duram 31 dias.
 */
export async function insertPurchaseIntent(input) {
  const result = await query(
    `
    INSERT INTO purchase_intents (
      buyer_user_id, city_id, intent_type,
      brand, brand_slug, model, model_slug,
      body_type, transmission, max_price, purchase_timeframe,
      status, expires_at
    )
    VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      $8, $9, $10, $11,
      'active', NOW() + ($12 || ' days')::interval
    )
    RETURNING id
    `,
    [
      input.buyerUserId,
      input.cityId,
      input.intentType,
      input.brand,
      input.brandSlug,
      input.model,
      input.modelSlug,
      input.bodyType,
      input.transmission,
      input.maxPrice,
      input.purchaseTimeframe,
      String(input.activeDays),
    ]
  );

  return result.rows[0]?.id ?? null;
}

/**
 * Página de procuras de UM comprador, mais recentes primeiro.
 *
 * `limit + 1` para descobrir se há próxima página sem COUNT, e comparação de
 * TUPLA no cursor — um `created_at <` puro perderia linhas com timestamp
 * idêntico, e `<=` as repetiria.
 *
 * Inclui procuras encerradas e vencidas: para o comprador isso é histórico, e
 * apagar da vista o que ele publicou seria esconder trabalho dele.
 */
export async function listByBuyer({ buyerUserId, limit, cursor }) {
  const params = [buyerUserId];
  let cursorClause = "";

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorClause = `AND (pi.created_at, pi.id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }

  params.push(limit + 1);

  const result = await query(
    `
    SELECT ${BUYER_COLUMNS}
    FROM purchase_intents pi
    JOIN cities c ON c.id = pi.city_id
    WHERE pi.buyer_user_id = $1
    ${cursorClause}
    ORDER BY pi.created_at DESC, pi.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows.slice(0, limit);
  return { rows, hasMore: result.rows.length > limit };
}

/** UMA procura, escopada ao dono. Linha de outro usuário simplesmente não casa. */
export async function getByIdForBuyer(purchaseIntentId, buyerUserId) {
  const result = await query(
    `
    SELECT ${BUYER_COLUMNS}
    FROM purchase_intents pi
    JOIN cities c ON c.id = pi.city_id
    WHERE pi.id = $1
      AND pi.buyer_user_id = $2
    LIMIT 1
    `,
    [purchaseIntentId, buyerUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * Encerra a procura, com a posse dentro do próprio UPDATE.
 *
 * Não existe SELECT-checa-UPDATE aqui: o `AND buyer_user_id = $2` é a
 * autorização. `status <> 'closed'` evita reescrever `updated_at` de uma linha
 * que já estava encerrada.
 *
 * Quando o UPDATE não casa, pode ser (a) já encerrada ou (b) inexistente/de
 * outro dono — e essas duas coisas precisam de respostas diferentes. O SELECT
 * de desempate é igualmente escopado ao dono, então continua impossível
 * descobrir a procura alheia por aqui.
 *
 * @returns {Promise<{ intent: object|null, changed: boolean }>}
 */
export async function closeForBuyer(purchaseIntentId, buyerUserId) {
  const updated = await query(
    `
    UPDATE purchase_intents
    SET status = 'closed',
        updated_at = NOW()
    WHERE id = $1
      AND buyer_user_id = $2
      AND status <> 'closed'
    `,
    [purchaseIntentId, buyerUserId]
  );

  const intent = await getByIdForBuyer(purchaseIntentId, buyerUserId);
  return { intent, changed: (updated.rowCount ?? 0) > 0 };
}

/**
 * Oportunidades ATIVAS de UMA cidade, para o lojista.
 *
 * Os três filtros são o produto inteiro desta fase:
 *   - `pi.city_id = $1` — mesma cidade, sem raio, sem region_memberships,
 *     sem cidade vizinha. `cityId` vem SEMPRE do advertiser do usuário
 *     autenticado, nunca do navegador.
 *   - `pi.status = 'active'` — encerrada some na hora.
 *   - `pi.expires_at > NOW()` — vencida some sozinha, sem job.
 */
export async function listActiveByCity({ cityId, limit, cursor }) {
  const params = [cityId];
  let cursorClause = "";

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorClause = `AND (pi.created_at, pi.id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }

  params.push(limit + 1);

  const result = await query(
    `
    SELECT ${DEALER_COLUMNS}
    FROM purchase_intents pi
    JOIN cities c ON c.id = pi.city_id
    WHERE pi.city_id = $1
      AND pi.status = 'active'
      AND pi.expires_at > NOW()
    ${cursorClause}
    ORDER BY pi.created_at DESC, pi.id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows.slice(0, limit);
  return { rows, hasMore: result.rows.length > limit };
}

/**
 * UMA oportunidade, escopada à cidade da loja.
 *
 * A cidade está no WHERE junto do id: uma procura de outra cidade não casa e o
 * service devolve 404. Não existe caminho em que a linha seja lida e depois
 * recusada — que é o que permitiria a um lojista de Bragança confirmar, pelo
 * tempo de resposta ou pela mensagem, que a procura 42 existe em Atibaia.
 */
export async function getActiveByIdForCity(purchaseIntentId, cityId) {
  const result = await query(
    `
    SELECT ${DEALER_COLUMNS}
    FROM purchase_intents pi
    JOIN cities c ON c.id = pi.city_id
    WHERE pi.id = $1
      AND pi.city_id = $2
      AND pi.status = 'active'
      AND pi.expires_at > NOW()
    LIMIT 1
    `,
    [purchaseIntentId, cityId]
  );
  return result.rows[0] ?? null;
}

/**
 * Predicado de advertiser OPERACIONAL.
 *
 * `advertisers.status` é NULLABLE na prática: a coluna nasce
 * `NOT NULL DEFAULT 'active'` no CREATE, mas as migrations 003 e 012 também a
 * re-adicionam como `ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'` para
 * bancos legados — e o DEFAULT não preenche linha que já existia. A própria 012
 * declara a interpretação do projeto ao fazer o backfill
 * `status = COALESCE(NULLIF(status, ''), 'active')`.
 *
 * Por isso NULL e '' contam como ACTIVE. Tratá-los como "não ativo" seria
 * fail-closed no papel e um defeito na prática: trancaria para fora lojistas
 * legítimos cuja linha é anterior à coluna, um estrago maior que o problema que
 * esta regra corrige. `suspended` e `blocked` são estados EXPLÍCITOS — sempre
 * escritos por uma ação de moderação.
 *
 * Mesmo formato de `public-dealer.service.js:57`, que já usa
 * `COALESCE(adv.status, 'active') = 'active'`.
 *
 * O predicado é MONTADO por função porque a Fase 3 precisa dele em consultas
 * com outra numeração de parâmetro e outro alias de tabela. Copiar a expressão
 * para lá criaria duas versões da mesma regra de moderação — e a que ficasse
 * para trás numa correção seria justamente a que decide quem fica no ar.
 *
 * @param {{ alias?: string, param?: number }} [options]
 */
export function advertiserIsOperational({ alias = "adv", param = 2 } = {}) {
  return `COALESCE(NULLIF(BTRIM(${alias}.status), ''), 'active') = $${param}`;
}

export const ADVERTISER_IS_OPERATIONAL = advertiserIsOperational();

/**
 * Linhas de advertiser OPERACIONAIS do usuário — TODAS, sem LIMIT.
 *
 * O LIMIT 1 é o erro clássico aqui. `advertisers.user_id` não tem UNIQUE (nem
 * nas migrations, nem em produção — verificado na Fase 0.1), então "a loja do
 * usuário" pode ser mais de uma linha. Com `LIMIT 1` sem `ORDER BY`, o Postgres
 * devolve uma qualquer, e a autorização passaria a depender de qual linha
 * apareceu primeiro. Devolvemos o conjunto e deixamos o service FALHAR FECHADO
 * quando houver conflito.
 *
 * O filtro de status entra AQUI, no SQL, e não numa checagem do service: uma
 * loja suspensa não deve nem chegar à camada que decide a cidade. Como
 * consequência direta, um advertiser bloqueado em OUTRA cidade não gera
 * conflito — ele simplesmente não faz parte do conjunto.
 */
export async function listActiveAdvertisersByUserId(userId) {
  const result = await query(
    `
    SELECT adv.id, adv.user_id, adv.city_id, adv.status
    FROM advertisers adv
    WHERE adv.user_id = $1
      AND ${ADVERTISER_IS_OPERATIONAL}
    ORDER BY adv.id ASC
    `,
    [userId, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows;
}

/**
 * Destinatários do fan-out: usuários CNPJ com loja NA CIDADE da procura.
 *
 * `DISTINCT` porque um mesmo `user_id` pode ter mais de uma linha em
 * `advertisers` (sem UNIQUE) — sem ele, o lojista duplicado receberia duas
 * notificações. A idempotência do módulo de notificações resolveria isso de
 * qualquer forma (mesma chave, mesmo destinatário), mas depender disso seria
 * confiar num efeito colateral de outro domínio.
 *
 * O filtro de CNPJ é `LOWER(BTRIM(document_type)) = 'cnpj'` porque a coluna
 * guarda minúsculo ('cnpj') enquanto `req.user.account_type` é 'CNPJ'. Comparar
 * com o valor da aplicação sem normalizar não casaria nenhuma linha — e o
 * sintoma seria "ninguém recebe notificação", que é silencioso.
 *
 * `city_id` NULL nunca casa `= $1`, então lojista sem cidade fica de fora
 * naturalmente: fail closed sem cláusula extra.
 *
 * Loja suspensa/bloqueada NÃO é notificada — mesmo predicado de status da
 * resolução de cidade, para que "ver a oportunidade" e "ser avisado dela"
 * nunca discordem. Se divergissem, a loja suspensa receberia o aviso e bateria
 * num 404 ao clicar.
 *
 * O JOIN em `users` existe SÓ para validar CNPJ. A consulta de oportunidades
 * (a que responde ao lojista) continua sem tocar em `users`.
 */
export async function listDealerRecipientsByCity(cityId) {
  const result = await query(
    `
    SELECT DISTINCT adv.user_id AS user_id
    FROM advertisers adv
    JOIN users u ON u.id = adv.user_id
    WHERE adv.city_id = $1
      AND ${ADVERTISER_IS_OPERATIONAL}
      AND adv.user_id IS NOT NULL
      AND LOWER(BTRIM(COALESCE(u.document_type, ''))) = 'cnpj'
    `,
    [cityId, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows.map((row) => row.user_id).filter((userId) => userId != null);
}
