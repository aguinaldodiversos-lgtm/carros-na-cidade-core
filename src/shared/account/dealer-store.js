/**
 * "De que loja é este usuário, e em que cidade ela fica?"
 *
 * A resolução CANÔNICA da identidade comercial de um lojista autenticado —
 * usada pelo Produto 1 (procuras) e pelo Produto 2 (venda para lojas).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE MÓDULO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * A regra nasceu dentro de `purchase-intents.service.js#resolveDealerCityId` na
 * Fase 2. A Fase 4.3 precisa da MESMA decisão para outro produto, e precisa de
 * um dado a mais: além da cidade (que decide o que o lojista VÊ), o
 * `advertiser_id` (que registra qual LOJA fez a proposta).
 *
 * Reimplementar a resolução no domínio de venda criaria duas respostas
 * possíveis para "de que cidade é este lojista" — e a divergência apareceria
 * como um lojista que enxerga a oportunidade no feed e é recusado ao propor,
 * ou o contrário. `resolveDealerCityId` continua exportado de
 * `purchase-intents.service.js`, agora delegando para cá: um só lugar decide.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FAIL CLOSED — as quatro situações que devolvem `null`
 * ────────────────────────────────────────────────────────────────────────────
 *   - nenhum advertiser: a conta é CNPJ mas ainda não tem loja;
 *   - nenhum advertiser ATIVO: todas as lojas estão suspensas ou bloqueadas.
 *     Moderação não é sobre plano nem estoque — é sobre não entregar demanda
 *     privada a quem foi tirado do ar;
 *   - advertiser sem `city_id`: inferir a cidade (de `users.city`, do primeiro
 *     anúncio, do cookie territorial, de Atibaia) entregaria oportunidades de
 *     gente real para a cidade errada. A Fase 0.1 proíbe, e continua proibido;
 *   - MAIS DE UMA cidade distinta entre os advertisers ATIVOS do mesmo usuário.
 *
 * `null` não é erro. A listagem devolve vazio, o detalhe devolve 404 e a
 * proposta é recusada. O lojista sem localização válida simplesmente não
 * participa — que é o comportamento seguro quando a pergunta não tem UMA
 * resposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MÚLTIPLAS LOJAS DO MESMO USUÁRIO — A REGRA EXPLÍCITA
 * ────────────────────────────────────────────────────────────────────────────
 * `advertisers.user_id` NÃO tem UNIQUE (verificado na Fase 0.1, e ainda é
 * verdade em produção). Então "a loja do usuário" pode ser mais de uma linha, e
 * é preciso dizer o que acontece em cada caso — não deixar o Postgres decidir
 * por ordem de retorno:
 *
 *   CIDADES DIFERENTES  → `null`. Escolher "a primeira" seria decidir por
 *                         sorteio de que cidade o lojista é, e o sorteio mudaria
 *                         entre dois deploys. Enquanto não existir seletor de
 *                         loja na UI, a resposta honesta é "não sei".
 *
 *   MESMA CIDADE, N linhas → a de MENOR `id`. Aqui a cidade — que é o que
 *                         governa visibilidade — é inequívoca; o que sobra é
 *                         escolher qual linha REPRESENTA a loja na proposta.
 *                         `MIN(id)` é a linha mais antiga: estável entre
 *                         requests, entre deploys e entre réplicas, e imune a
 *                         `UPDATE` de qualquer outra coluna. `advertisers[0]`
 *                         de um SELECT sem ORDER BY não é nada disso.
 *
 * A ordenação vem do SQL (`ORDER BY adv.id ASC`), não de um `sort` em JS: é o
 * banco que garante a ordem que a escolha usa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE MÓDULO NÃO FAZ
 * ────────────────────────────────────────────────────────────────────────────
 * Não verifica plano, assinatura nem entitlement — mesma fronteira de
 * `dealer.middleware.js`. Quando a diferenciação comercial existir, ela entra
 * como uma camada SEPARADA, composta com esta, e o contrato daqui não muda.
 */
import { query } from "../../infrastructure/database/db.js";
import { logger } from "../logger.js";
import { buildDomainFields } from "../domainLog.js";
import { ADVERTISER_STATUS } from "../constants/status.js";
import { ADVERTISER_IS_OPERATIONAL } from "./advertiser-status.js";

/**
 * Linhas de advertiser OPERACIONAIS do usuário — TODAS, sem LIMIT.
 *
 * O `LIMIT 1` é o erro clássico aqui: sem UNIQUE em `user_id` e sem ORDER BY, o
 * Postgres devolve uma linha qualquer, e a autorização passaria a depender de
 * qual apareceu primeiro. Devolvemos o conjunto inteiro e decidimos em cima
 * dele, com a regra escrita.
 *
 * O filtro de status entra no SQL, e não numa checagem posterior: uma loja
 * suspensa não deve nem chegar à camada que decide a cidade. Consequência
 * direta e desejada — um advertiser bloqueado em OUTRA cidade não vira
 * conflito, porque não faz parte do conjunto.
 */
async function listOperationalAdvertisers(userId) {
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
 * Identidade comercial do lojista autenticado.
 *
 * @param {string|number} userId — `req.user.id`, NUNCA um valor do corpo/query
 * @param {{ action?: string }} [options] — nome da ação no log de domínio
 * @returns {Promise<{ advertiserId: number, cityId: number }|null>}
 */
export async function resolveDealerStore(userId, { action = "account.dealer_store.resolve" } = {}) {
  const rows = await listOperationalAdvertisers(userId);

  // Só linhas com cidade REAL entram na decisão. `''` e `'  '` são tratados
  // como ausência: uma cidade em branco não identifica lugar nenhum, e deixá-la
  // passar produziria um `city_id` que não casa com `cities`.
  const located = rows.filter(
    (row) => row.city_id != null && String(row.city_id).trim() !== ""
  );

  const distinctCities = [...new Set(located.map((row) => String(row.city_id)))];

  if (distinctCities.length === 1) {
    // `located` já vem ordenado por `adv.id ASC` do SQL, e todas as linhas
    // apontam para a mesma cidade — então a primeira É a de menor id.
    const chosen = located[0];
    return { advertiserId: Number(chosen.id), cityId: Number(chosen.city_id) };
  }

  logger.warn(
    {
      ...buildDomainFields({
        action,
        result: "error",
        userId,
        reason: distinctCities.length === 0 ? "missing" : "ambiguous",
      }),
      advertiserRows: rows.length,
      locatedRows: located.length,
      distinctCities: distinctCities.length,
    },
    "[dealer-store] loja do lojista indefinida — acesso comercial suspenso"
  );

  return null;
}

/**
 * Só a cidade — a forma que o Produto 1 já usava.
 *
 * Mantida como função própria (e não como `(await resolveDealerStore(...))?.cityId`
 * espalhado por aí) para que o call site continue lendo a intenção: quem só
 * decide VISIBILIDADE não precisa saber qual linha de loja representa o usuário.
 *
 * @returns {Promise<number|null>}
 */
export async function resolveDealerCityId(userId, options) {
  const store = await resolveDealerStore(userId, options);
  return store ? store.cityId : null;
}
