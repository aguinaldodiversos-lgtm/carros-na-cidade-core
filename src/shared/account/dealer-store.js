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
 * A CIDADE do lojista — a pergunta do Produto 1, e só ela.
 *
 * "Uma cidade" e "uma loja" são perguntas DIFERENTES, e é a diferença que esta
 * fase precisou tornar explícita. Um lojista com duas lojas na MESMA cidade tem
 * uma cidade inequívoca (o Produto 1 funciona) e uma loja ambígua (o Produto 2
 * não pode escolher por ele — a proposta grava `advertiser_id`, e gravar a loja
 * errada é atribuir uma oferta comercial a uma empresa que não a fez).
 *
 * Por isso são duas funções, e não uma com um parâmetro. Esta continua
 * respondendo exatamente o que respondia na Fase 2, com o mesmo SQL e o mesmo
 * resultado em todos os casos — inclusive o de duas lojas na mesma cidade, que
 * aqui resolve e no Produto 2 passou a exigir escolha.
 *
 * @param {string|number} userId — `req.user.id`, NUNCA um valor do corpo/query
 * @param {{ action?: string }} [options] — nome da ação no log de domínio
 * @returns {Promise<number|null>}
 */
async function resolveUniqueCityId(userId, { action } = {}) {
  const rows = await listOperationalAdvertisers(userId);

  // Só linhas com cidade REAL entram na decisão. `''` e `'  '` são tratados
  // como ausência: uma cidade em branco não identifica lugar nenhum, e deixá-la
  // passar produziria um `city_id` que não casa com `cities`.
  const located = rows.filter(
    (row) => row.city_id != null && String(row.city_id).trim() !== ""
  );

  const distinctCities = [...new Set(located.map((row) => String(row.city_id)))];

  if (distinctCities.length === 1) {
    return Number(located[0].city_id);
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
    "[dealer-store] cidade do lojista indefinida — acesso comercial suspenso"
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
  return resolveUniqueCityId(userId, options);
}

// ============================================================================
// A LOJA — a pergunta do Produto 2
// ============================================================================
//
// Uma proposta grava `advertiser_id`: ela diz que ESTA EMPRESA ofereceu ESTE
// valor. Escolher a loja por um critério de conveniência — "a primeira",
// "a de menor id" — é estável, mas atribui uma oferta comercial a uma empresa
// que talvez não a tenha feito. Estável não é o mesmo que correto.
//
// Por isso a regra abaixo é por CARDINALIDADE, e não por ordenação:
//
//   0 lojas elegíveis  → acesso recusado (não há em nome de quem agir)
//   1 loja elegível    → resolve sozinha (não há o que escolher)
//   2+ lojas elegíveis → o lojista ESCOLHE. O servidor não adivinha.
//
// "Elegível" é uma loja OPERACIONAL com cidade real. A cidade importa porque a
// visibilidade do feed é territorial; sem ela a loja não sabe onde está e não
// participa.

/**
 * Todas as lojas elegíveis do usuário, com o nome da cidade para o seletor.
 *
 * Query SEPARADA de `listOperationalAdvertisers` de propósito. Aquela é o SQL
 * que o Produto 1 usa há duas fases, e o fake de testes daquele domínio o casa
 * por REGEX sobre o texto — acrescentar um JOIN ali quebraria a suíte de
 * procuras por um motivo que não tem nada a ver com procuras.
 *
 * O JOIN com `cities` é INNER, não LEFT: uma loja cuja `city_id` não casa o
 * catálogo é uma loja sem lugar, e ela não pode aparecer num seletor como opção
 * — o lojista escolheria uma loja que não veria feed nenhum.
 */
export async function listEligibleDealerStores(userId) {
  const result = await query(
    `
    SELECT
      adv.id        AS advertiser_id,
      adv.name      AS advertiser_name,
      adv.city_id   AS city_id,
      c.name        AS city_name,
      c.state       AS city_state
    FROM advertisers adv
    JOIN cities c ON c.id = adv.city_id
    WHERE adv.user_id = $1
      AND ${ADVERTISER_IS_OPERATIONAL}
    ORDER BY adv.id ASC
    `,
    [userId, ADVERTISER_STATUS.ACTIVE]
  );

  return result.rows.map((row) => ({
    advertiserId: Number(row.advertiser_id),
    cityId: Number(row.city_id),
    name: row.advertiser_name || null,
    city: { name: row.city_name, state: row.city_state },
  }));
}

/**
 * Resultados possíveis de `resolveDealerStoreSelection`.
 *
 * Um objeto discriminado, e não `null` + exceção, porque os três casos de falha
 * pedem respostas HTTP e mensagens DIFERENTES — e um `null` genérico obrigaria
 * cada chamador a redescobrir qual deles aconteceu.
 */
export const DEALER_STORE_RESOLUTION = Object.freeze({
  OK: "ok",
  /** Nenhuma loja operacional com cidade. Não há em nome de quem agir. */
  NONE: "none",
  /** Duas ou mais lojas e nenhuma escolhida. O servidor NÃO desempata. */
  SELECTION_REQUIRED: "selection_required",
  /** A loja pedida não é do usuário, não existe, ou não está operacional. */
  INVALID_SELECTION: "invalid_selection",
});

/**
 * A loja em nome da qual o lojista está agindo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O `advertiserId` PEDIDO É UMA PREFERÊNCIA, NUNCA UMA AUTORIZAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Ele pode vir do cliente — é o único jeito de o lojista dizer qual das lojas
 * dele está comprando. O que NÃO vem do cliente é a permissão: o valor pedido é
 * confrontado com o conjunto que o SERVIDOR montou a partir de `req.user.id`.
 *
 * Uma loja de outro usuário, uma loja suspensa, uma loja sem cidade e um id
 * inventado caem todos no MESMO ramo (`INVALID_SELECTION`) — não porque sejam a
 * mesma coisa, mas porque distinguir as respostas contaria a quem sonda ids
 * qual deles existe.
 *
 * Note o que este desenho torna impossível: não há caminho em que o
 * `advertiserId` recebido seja usado sem antes aparecer em `listEligibleDealerStores`.
 * A verificação não é um `if` que alguém possa esquecer — é a ausência de
 * qualquer outra origem para o valor devolvido.
 *
 * @param {string|number} userId — `req.user.id`
 * @param {{ advertiserId?: unknown, action?: string }} [options]
 */
export async function resolveDealerStoreSelection(
  userId,
  { advertiserId = null, action = "account.dealer_store.select" } = {}
) {
  const stores = await listEligibleDealerStores(userId);

  if (stores.length === 0) {
    logger.warn(
      {
        ...buildDomainFields({ action, result: "error", userId, reason: "none" }),
      },
      "[dealer-store] usuário sem loja operacional com cidade"
    );
    return { status: DEALER_STORE_RESOLUTION.NONE, stores };
  }

  const requested = String(advertiserId ?? "").trim();

  if (requested !== "") {
    // Comparação por STRING contra o conjunto do servidor. `pg` devolve BIGINT
    // como string e a query string sempre é texto; normalizar os dois lados
    // evita que `20` e `"20"` deixem de casar por diferença de tipo.
    const chosen = stores.find((store) => String(store.advertiserId) === requested);

    if (!chosen) {
      logger.warn(
        {
          ...buildDomainFields({
            action,
            result: "error",
            userId,
            reason: "invalid_selection",
          }),
          eligibleStores: stores.length,
        },
        "[dealer-store] loja pedida não pertence ao usuário ou não está operacional"
      );
      return { status: DEALER_STORE_RESOLUTION.INVALID_SELECTION, stores };
    }

    return { status: DEALER_STORE_RESOLUTION.OK, store: chosen, stores };
  }

  if (stores.length === 1) {
    // Uma loja só: não existe escolha a fazer, e pedir uma seria atrito puro.
    return { status: DEALER_STORE_RESOLUTION.OK, store: stores[0], stores };
  }

  logger.info(
    {
      ...buildDomainFields({
        action,
        result: "error",
        userId,
        reason: "selection_required",
      }),
      eligibleStores: stores.length,
    },
    "[dealer-store] mais de uma loja elegível — escolha explícita necessária"
  );

  return { status: DEALER_STORE_RESOLUTION.SELECTION_REQUIRED, stores };
}
