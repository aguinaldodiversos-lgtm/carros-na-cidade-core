import { query } from "../../../infrastructure/database/db.js";
import { accountTypeSqlPredicate } from "../../../shared/account/account-type.js";

/**
 * Leitura administrativa de CONTAS (`users`) — Admin U1.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REGRA DE OURO: NUNCA `SELECT *` EM `users`
 * ────────────────────────────────────────────────────────────────────────────
 * `users` guarda `password_hash`, `password`, `reset_token`,
 * `email_verification_token` e `document_number`. Um `SELECT *` aqui não é um
 * descuido de estilo — é entregar hash de senha e token de recuperação num
 * payload HTTP. Toda query deste arquivo enumera colunas explicitamente, e
 * `tests/admin/admin-users-pii.test.js` falha se uma chave sensível aparecer no
 * payload serializado.
 *
 * `document_number` (CPF/CNPJ) fica FORA por decisão de escopo da U1: a tela
 * classifica a conta por TIPO (derivado de `document_type`), e para isso o
 * número não é necessário. Menos dado no payload, menos superfície.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE A LISTAGEM NÃO JUNTA `advertisers` / `ads` / `purchase_intents`
 * ────────────────────────────────────────────────────────────────────────────
 * `advertisers.user_id` NÃO tem UNIQUE (verificado na Fase 0.1 e nesta
 * auditoria: migration 003 cria só um índice comum). Um `LEFT JOIN advertisers`
 * na listagem multiplicaria a linha do usuário por quantas lojas ele tiver — e
 * um `LEFT JOIN ads` por cima multiplicaria de novo, inflando qualquer COUNT
 * pelo produto cartesiano.
 *
 * Como a pergunta desta tela é "quem tem conta?", a resposta tem que ser uma
 * linha por conta. Atividade é pergunta do DETALHE, respondida por queries
 * dedicadas em `getUserActivity` — cada uma agregando na sua própria tabela,
 * sem produto cartesiano possível.
 */

/**
 * Colunas de identidade lidas na lista e no detalhe. Lista literal e única:
 * qualquer campo novo tem que ser adicionado aqui conscientemente, e o teste de
 * PII vê o resultado.
 *
 * `email_verified` e `is_email_verified` coexistem por herança de schema
 * (migration 002 adiciona as duas). O service resolve o par num único booleano,
 * igual a `auth.service.js#buildSessionUser`.
 */
const USER_IDENTITY_COLUMNS = `
  u.id,
  u.name,
  u.email,
  u.role,
  u.document_type,
  u.plan_id,
  u.email_verified,
  u.is_email_verified,
  u.locked_until,
  u.created_at
`;

/**
 * Escapa os curingas de LIKE para que o termo digitado seja tratado como texto
 * literal. Sem isto, buscar `%` casaria TODAS as contas e `_` casaria qualquer
 * caractere — a busca pareceria "quebrada de um jeito estranho" em vez de
 * simplesmente não encontrar nada.
 *
 * Não é defesa contra injeção: o termo já viaja como parâmetro ($n). É
 * correção semântica.
 */
function escapeLikeTerm(term) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Monta WHERE + params UMA ÚNICA VEZ, para que a query de dados e a de
 * contagem sejam literalmente a mesma condição.
 *
 * Este projeto já sangrou por divergência entre dataQuery e countQuery (filtros
 * da Fase 3 no `/comprar`: o count não tinha os JOINs do where e explodia com
 * "missing FROM-clause entry"). A prevenção estrutural é não haver duas
 * cláusulas para manter alinhadas — há uma, construída aqui.
 *
 * INVARIANTE: toda condição produzida aqui referencia SOMENTE o alias `u`.
 * Se algum filtro futuro precisar de `subscription_plans` (ex.: filtrar por
 * NOME do plano), a query de contagem passa a precisar do mesmo LEFT JOIN —
 * e `tests/admin/admin-users-repository.test.js` tem um teste que falha
 * exatamente nesse caso.
 */
function buildUserFilters({ search, accountType, role } = {}) {
  const conditions = [];
  const params = [];

  const term = typeof search === "string" ? search.trim() : "";
  if (term) {
    const like = `%${escapeLikeTerm(term)}%`;
    params.push(like);
    const likeIdx = params.length;

    // Busca por ID só entra quando o termo é um inteiro positivo. Comparar
    // `u.id::text ILIKE '%1%'` seria "buscar por ID" de mentira: casaria 1, 10,
    // 21, 100… e o operador confiaria numa lista que não é o que ele pediu.
    const byId = /^[0-9]+$/.test(term);
    if (byId) {
      params.push(term);
      conditions.push(
        `(u.name ILIKE $${likeIdx} ESCAPE '\\' OR u.email ILIKE $${likeIdx} ESCAPE '\\' OR u.id = $${params.length})`
      );
    } else {
      conditions.push(
        `(u.name ILIKE $${likeIdx} ESCAPE '\\' OR u.email ILIKE $${likeIdx} ESCAPE '\\')`
      );
    }
  }

  // Sem parâmetro: o predicado é montado a partir de um vocabulário fechado
  // (ACCOUNT_TYPE) e lança se receber qualquer outra coisa. Nada do usuário
  // entra na string SQL — o service já validou antes de chegar aqui.
  if (accountType) {
    conditions.push(accountTypeSqlPredicate(accountType, "u.document_type"));
  }

  if (role) {
    params.push(role);
    conditions.push(`COALESCE(NULLIF(BTRIM(u.role), ''), 'user') = $${params.length}`);
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

// Exportado só para teste: prova que dados e contagem compartilham a cláusula.
export { buildUserFilters as __buildUserFiltersForTest };

/**
 * Lista contas. UMA linha por conta, sempre.
 *
 * ORDER BY tem desempate por `id DESC` obrigatoriamente. Com apenas
 * `created_at DESC`, duas contas criadas no mesmo instante (import, seed,
 * cadastro concorrente) não têm ordem definida entre si — e paginação por
 * OFFSET sobre ordem indefinida repete registro numa página e omite em outra.
 * A listagem de anunciantes tinha esse defeito; não o repetimos aqui.
 */
export async function listUsers({ limit = 30, offset = 0, search, accountType, role } = {}) {
  const { where, params } = buildUserFilters({ search, accountType, role });

  const dataParams = [...params, limit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const result = await query(
    `SELECT
       ${USER_IDENTITY_COLUMNS},
       p.name AS plan_name
     FROM users u
     LEFT JOIN subscription_plans p ON p.id = u.plan_id
     ${where}
     ORDER BY u.created_at DESC NULLS LAST, u.id DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams
  );

  // Mesma cláusula, mesmos params — sem o JOIN, que só serve para o NOME do
  // plano e não participa de nenhum filtro (ver INVARIANTE em buildUserFilters).
  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM users u ${where}`,
    params
  );

  return {
    data: result.rows,
    total: countResult.rows[0]?.total || 0,
    limit,
    offset,
  };
}

/** Identidade de uma conta. `null` quando não existe (o service traduz em 404). */
export async function findUserById(id) {
  const result = await query(
    `SELECT
       ${USER_IDENTITY_COLUMNS},
       p.name AS plan_name
     FROM users u
     LEFT JOIN subscription_plans p ON p.id = u.plan_id
     WHERE u.id = $1
     LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

/**
 * Lojas do usuário. Pode devolver 0, 1 ou N linhas — `advertisers.user_id` não
 * é UNIQUE, e o detalhe precisa mostrar a verdade, não a primeira linha.
 *
 * `LEFT JOIN cities` porque a cidade CONFIÁVEL de uma conta é a da loja
 * (`advertisers.city_id`, FK real, validada na criação desde a Fase 0.1) — e
 * não `users.city`, que é texto livre e cuja adivinhação foi deliberadamente
 * removida do produto. LEFT e não INNER: uma loja com `city_id` órfão deve
 * aparecer na lista com cidade vazia, não sumir dela.
 */
export async function listAdvertisersByUserId(userId) {
  const result = await query(
    `SELECT
       adv.id, adv.name, adv.company_name, adv.status, adv.city_id,
       adv.created_at,
       c.name AS city_name, c.state AS city_state
     FROM advertisers adv
     LEFT JOIN cities c ON c.id = adv.city_id
     WHERE adv.user_id = $1
     ORDER BY adv.id ASC`,
    [userId]
  );
  return result.rows;
}

/**
 * Contadores de anúncios do usuário, agregados via subquery em `advertisers`.
 *
 * A subquery (em vez de JOIN) é o que impede o produto cartesiano quando o
 * usuário tem mais de uma loja: `IN (SELECT ...)` filtra linhas de `ads`, não
 * as multiplica.
 *
 * `total` usa `<> 'deleted'` — mesmo recorte da listagem de anunciantes, para
 * que os dois números do admin queiram dizer a mesma coisa.
 */
export async function countAdsByUserId(userId) {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (WHERE a.status = 'active')::int   AS active,
       COUNT(*) FILTER (WHERE a.status <> 'deleted')::int AS total
     FROM ads a
     WHERE a.advertiser_id IN (SELECT adv.id FROM advertisers adv WHERE adv.user_id = $1)`,
    [userId]
  );
  return { active: result.rows[0]?.active || 0, total: result.rows[0]?.total || 0 };
}

/**
 * Procuras publicadas pelo usuário (Compradores Ativos).
 *
 * `live` replica a definição do próprio produto: `status = 'active'` E
 * `expires_at > NOW()`. A expiração é LAZY — nenhum job muda o status quando o
 * prazo vence (migration 050), então contar só por `status` mostraria como
 * ativa uma procura que nenhum lojista enxerga há semanas.
 */
export async function countPurchaseIntentsByUserId(userId) {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE pi.status = 'active' AND pi.expires_at > NOW())::int AS live
     FROM purchase_intents pi
     WHERE pi.buyer_user_id = $1`,
    [userId]
  );
  return { total: result.rows[0]?.total || 0, live: result.rows[0]?.live || 0 };
}

/** Últimas procuras, para contexto no detalhe (somente leitura, sem ações). */
export async function listRecentPurchaseIntentsByUserId(userId, { limit = 5 } = {}) {
  const result = await query(
    `SELECT
       pi.id, pi.intent_type, pi.brand, pi.model, pi.body_type,
       pi.status, pi.expires_at, pi.created_at,
       c.name AS city_name, c.state AS city_state
     FROM purchase_intents pi
     LEFT JOIN cities c ON c.id = pi.city_id
     WHERE pi.buyer_user_id = $1
     ORDER BY pi.created_at DESC, pi.id DESC
     LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

/**
 * Veículos que lojistas enviaram para as procuras deste usuário.
 *
 * O vínculo com a conta é indireto — `purchase_intent_offers.purchase_intent_id
 * → purchase_intents.buyer_user_id` — porque a oferta pertence ao lojista que
 * a enviou (`dealer_user_id`), não ao comprador. Contar por `dealer_user_id`
 * aqui responderia a outra pergunta ("quantos veículos esta pessoa ENVIOU"),
 * que não é a desta seção.
 */
export async function countReceivedOffersByUserId(userId) {
  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM purchase_intent_offers o
     JOIN purchase_intents pi ON pi.id = o.purchase_intent_id
     WHERE pi.buyer_user_id = $1`,
    [userId]
  );
  return result.rows[0]?.total || 0;
}
