/**
 * Acesso a dados das PROPOSTAS (`sale_request_offers`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O EXECUTOR INJETÁVEL (`exec`) É O ARQUIVO INTEIRO
 * ────────────────────────────────────────────────────────────────────────────
 * Toda função do caminho de escrita recebe `exec`: o pool quando ausente, o
 * cliente da TRANSAÇÃO quando presente.
 *
 * Sem isso, o `SELECT ... FOR UPDATE` do lock ficaria numa conexão e o
 * `SELECT MAX(amount)` em outra — o lock não valeria nada, e a leitura da maior
 * proposta enxergaria o estado ANTERIOR ao lance concorrente. Duas lojas
 * propondo ao mesmo tempo passariam as duas, e a que oferecesse MENOS entraria
 * depois da que oferecia mais.
 *
 * É a mesma disciplina de `sale-requests.repository.js`, e a razão de o teto de
 * 3 daquele módulo funcionar.
 */
import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";

/** Pool por omissão; cliente da transação quando fornecido. */
function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * TRAVA a solicitação — o ponto de serialização de toda proposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O LOCK É EM `sale_requests`, E NÃO EM `sale_request_offers`
 * ────────────────────────────────────────────────────────────────────────────
 * O invariante a serializar é "qual é a MAIOR proposta desta solicitação". No
 * instante do lance ainda não existe a linha nova que poderia servir de mutex, e
 * travar as propostas EXISTENTES não resolve o caso da PRIMEIRA proposta — não
 * há nenhuma linha para travar, então dois requests simultâneos passariam os
 * dois.
 *
 * Trava-se a entidade que EXISTE e cujo invariante global está sendo modificado:
 * a solicitação. É a mesma razão pela qual a Fase 3 trava `purchase_intents` (a
 * procura) e não `purchase_intent_offers`, e pela qual a criação da Fase 4.1
 * trava `users` (a conta).
 *
 * Consequência aceita e desejada: propostas para a MESMA solicitação serializam
 * — é exatamente a disputa que precisamos ordenar. Solicitações diferentes
 * travam linhas diferentes e não se bloqueiam.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CIDADE ESTÁ NO `WHERE` DO PRÓPRIO LOCK
 * ────────────────────────────────────────────────────────────────────────────
 * Não existe "trava e depois confere a cidade num `if`": a autorização
 * territorial é parte da mesma query. Uma solicitação de outra cidade não casa,
 * a função devolve `null` e o service transforma isso em 404 — sem nunca ter
 * travado nada.
 *
 * `status` NÃO entra aqui, de propósito. Precisamos distinguir "não existe / não
 * é da sua cidade" (404) de "existe, é sua, mas foi cancelada" (409), e essas
 * duas respostas pedem reações diferentes do lojista. Filtrar por status no lock
 * colapsaria as duas num 404 só.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PISO VEM NA MESMA LEITURA (4.3.3)
 * ────────────────────────────────────────────────────────────────────────────
 * `minimum_accepted_price` é selecionado AQUI, e não numa segunda query, porque
 * ele é critério de aceitação da proposta: lido fora do lock, seria um valor de
 * antes da trava — e ainda que hoje o piso seja imutável após a publicação
 * (§7 da 4.3.3), o dia em que uma fase futura permitir alterá-lo, esta função
 * já estará lendo a versão travada. Uma leitura de critério fora do mutex que
 * decide é uma corrida esperando o writer aparecer.
 *
 * @returns {Promise<{ id: string, status: string, minimum_accepted_price: string|null }|null>}
 */
export async function lockSaleRequestForOffer(saleRequestId, cityId, exec) {
  const result = await runner(exec)(
    `
    SELECT sr.id, sr.status, sr.minimum_accepted_price, sr.current_round_number
    FROM sale_requests sr
    WHERE sr.id = $1
      AND sr.city_id = $2
    FOR UPDATE
    `,
    [saleRequestId, cityId]
  );
  return result.rows[0] ?? null;
}

/**
 * A MAIOR proposta atual de uma solicitação.
 *
 * Só é confiável DENTRO da transação que já chamou `lockSaleRequestForOffer` —
 * é o lock que faz esta leitura enxergar o INSERT do request anterior. Fora
 * dele, o valor é uma leitura informativa (o que a tela mostra), e a tela pode
 * estar um instante atrasada sem consequência: quem decide é a transação.
 *
 * Devolve `null` quando ainda não há proposta — e `null` NÃO é zero. Zero
 * significaria "alguém ofereceu nada", e a regra "a nova proposta precisa
 * superar a maior atual" tem de saber que ainda não existe atual.
 *
 * @returns {Promise<string|null>} NUMERIC como string (é como o driver devolve)
 */
export async function findHighestAmount(saleRequestId, roundId, exec) {
  const result = await runner(exec)(
    `
    SELECT amount
    FROM sale_request_offers
    WHERE sale_request_id = $1
      AND round_id = $2
    ORDER BY amount DESC, id DESC
    LIMIT 1
    `,
    [saleRequestId, roundId]
  );
  return result.rows[0]?.amount ?? null;
}

/**
 * A proposta VIGENTE de uma loja numa solicitação: a mais RECENTE, não a maior.
 *
 * A distinção só importa se uma regra futura permitir lance menor que o próprio
 * anterior. Hoje as duas coincidem — mas "a minha proposta" é, por definição, a
 * última coisa que a loja disse, e escrever `MAX` aqui esconderia essa decisão
 * atrás de uma coincidência temporária.
 *
 * Escopo por LOJA e não por conta: dois operadores da mesma loja precisam ver a
 * mesma proposta corrente.
 */
export async function findCurrentOfferForAdvertiser(saleRequestId, advertiserId, roundId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, amount, note, created_at
    FROM sale_request_offers
    WHERE sale_request_id = $1
      AND advertiser_id = $2
      AND round_id = $3
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [saleRequestId, advertiserId, roundId]
  );
  return result.rows[0] ?? null;
}

/**
 * Insere o lance.
 *
 * Sem `ON CONFLICT`: não existe chave única a violar, porque a mesma loja
 * propondo de novo é o comportamento central do produto (ver o cabeçalho da
 * migration 055). O que impede o clique duplo é a regra "precisa superar a maior
 * atual", avaliada dentro da transação travada — dois cliques mandam o MESMO
 * valor, e o segundo perde para o primeiro.
 */
export async function insertOffer(
  { saleRequestId, roundId, dealerUserId, advertiserId, amount, note },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_offers (
      sale_request_id, round_id, dealer_user_id, advertiser_id, amount, note
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, amount, note, created_at
    `,
    [saleRequestId, roundId, dealerUserId, advertiserId, amount, note]
  );
  return result.rows[0] ?? null;
}

/**
 * Contagem de propostas de uma solicitação.
 *
 * Serve ao detalhe ("N propostas recebidas"), e é um número que NÃO revela
 * concorrente: quantas existem não diz de quem são. A identidade das lojas
 * rivais nunca sai deste módulo.
 */
export async function countOffers(saleRequestId, exec) {
  const result = await runner(exec)(
    `SELECT COUNT(*)::int AS total FROM sale_request_offers WHERE sale_request_id = $1`,
    [saleRequestId]
  );
  return result.rows[0]?.total ?? 0;
}

/**
 * Estado de disputa de VÁRIAS solicitações, em lote — uma query para a página
 * inteira. É o que impede o N+1 do feed.
 *
 * Devolve, por solicitação, a maior proposta geral e a proposta vigente DESTA
 * loja. As duas saem da mesma varredura porque respondem à mesma pergunta do
 * card ("estou liderando?") e separá-las custaria dois planejamentos do mesmo
 * índice.
 *
 * `FILTER (WHERE advertiser_id = $2)` é o que mantém a proposta da própria loja
 * escopada sem um segundo JOIN — e note que o `MAX(amount)` geral NÃO carrega
 * `advertiser_id` junto: a identidade do líder não é selecionada em lugar
 * nenhum, então não há como ela vazar para o DTO.
 *
 * @returns {Promise<Map<string, { highest: string|null, mine: string|null, total: number }>>}
 */
export async function listOfferStateByRequestIds(saleRequestIds, advertiserId) {
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
    -- FASE 4.7 — SÓ A RODADA ABERTA.
    --
    -- O JOIN com sale_request_rounds pela rodada CORRENTE e o que impede uma
    -- oferta da rodada 1 de aparecer como proposta atual na rodada 2. Sem ele, a
    -- loja veria um valor que ofereceu sob outro piso, e o feed diria que ela ja
    -- esta na disputa quando ela nao esta.
    --
    -- (Sem crases neste comentario: ele esta DENTRO de um template literal, e
    -- uma crase aqui fecharia a string no meio do SQL.)
    SELECT
      o.sale_request_id,
      MAX(o.amount)                                        AS highest_amount,
      MAX(o.amount) FILTER (WHERE o.advertiser_id = $2)    AS my_amount,
      COUNT(*)::int                                        AS total
    FROM sale_request_offers o
    JOIN sale_requests sr
      ON sr.id = o.sale_request_id
    JOIN sale_request_rounds r
      ON r.sale_request_id = sr.id
     AND r.round_number = sr.current_round_number
    WHERE o.sale_request_id = ANY($1::bigint[])
      AND o.round_id = r.id
    GROUP BY o.sale_request_id
    `,
    [ids, advertiserId]
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.sale_request_id), {
      highest: row.highest_amount ?? null,
      mine: row.my_amount ?? null,
      total: row.total ?? 0,
    });
  }
  return map;
}

/**
 * Quantas solicitações ABERTAS da cidade esta loja já propôs — e quantas ainda
 * não.
 *
 * Alimenta as duas métricas do cabeçalho que dependem de proposta. As duas saem
 * da MESMA query, sobre a mesma fonte, porque juntas descrevem uma partição:
 * `withMine + withoutMine` tem de ser igual ao total do feed sem filtros. Duas
 * queries independentes poderiam divergir e mostrar um par de números que não
 * fecha.
 *
 * O `LEFT JOIN LATERAL` existe para não contar solicitação duas vezes quando a
 * loja fez vários lances nela — que é o normal numa disputa. Um `LEFT JOIN`
 * simples multiplicaria as linhas pelo número de lances.
 */
export async function countCityOffersForAdvertiser({ cityId, advertiserId }) {
  const result = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE mine.id IS NOT NULL)::int AS with_mine,
      COUNT(*) FILTER (WHERE mine.id IS NULL)::int     AS without_mine
    FROM sale_requests sr
    LEFT JOIN LATERAL (
      SELECT o.id
      FROM sale_request_offers o
      JOIN sale_request_rounds r
        ON r.sale_request_id = sr.id
       AND r.round_number = sr.current_round_number
      WHERE o.sale_request_id = sr.id
        AND o.advertiser_id = $2
        -- FASE 4.7: "ja propus nesta" e sobre a rodada ABERTA. Uma proposta da
        -- rodada anterior nao conta: a loja precisa ofertar de novo.
        AND o.round_id = r.id
      LIMIT 1
    ) mine ON TRUE
    WHERE sr.city_id = $1
      AND sr.status = $3
    `,
    [cityId, advertiserId, SALE_REQUEST_STATUS.RECEIVING_OFFERS]
  );

  return {
    withMine: result.rows[0]?.with_mine ?? 0,
    withoutMine: result.rows[0]?.without_mine ?? 0,
  };
}
