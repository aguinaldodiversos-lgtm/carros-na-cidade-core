/**
 * As RODADAS de ofertas (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE UMA RODADA É
 * ════════════════════════════════════════════════════════════════════════════
 * O contexto comercial sob o qual um conjunto de ofertas foi feito. O piso mora
 * nela — e não mais só em `sale_requests` — porque é o piso que define o que
 * aquela disputa significava.
 *
 * Uma oferta de R$ 62.500 feita quando o mínimo era R$ 62.500 não quer dizer a
 * mesma coisa depois que o mínimo caiu para R$ 58.000. Sem rodada, as duas
 * apareceriam lado a lado como se fossem contemporâneas — e o proprietário
 * compararia números que nunca disputaram entre si.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A RODADA CORRENTE É UM NÚMERO, NÃO UM PONTEIRO
 * ════════════════════════════════════════════════════════════════════════════
 * `sale_requests.current_round_number` é um inteiro com `DEFAULT 1`. A razão
 * está na migration 060: a solicitação nasce ANTES da rodada dela, e um ponteiro
 * `NOT NULL` com FK falharia no próprio INSERT de criação sem `DEFERRABLE`.
 *
 * O par `(sale_request_id, current_round_number)` casa a UNIQUE de
 * `sale_request_rounds`, então resolver "qual é a rodada aberta" é uma leitura
 * exata, nunca um `MAX()` que poderia enxergar uma rodada meio-criada.
 */
import { query } from "../../infrastructure/database/db.js";

function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * Cria a rodada de uma solicitação.
 *
 * Usada em dois momentos: na PUBLICAÇÃO (rodada 1, na mesma transação que
 * insere a solicitação) e na ABERTURA de uma rodada nova.
 *
 * `ON CONFLICT DO NOTHING` sobre `(sale_request_id, round_number)` é a rede do
 * §43: dois cliques simultâneos em "iniciar nova rodada" não podem produzir duas
 * rodadas 2. Com o lock da solicitação isto não deveria disparar — e o ramo
 * existe justamente para o dia em que o lock não estiver lá, transformando
 * corrupção silenciosa em `null` tratável em vez de um 500 de constraint.
 */
export async function insertRound(
  { saleRequestId, roundNumber, minimumAcceptedPrice },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price)
    VALUES ($1, $2, $3)
    ON CONFLICT (sale_request_id, round_number) DO NOTHING
    RETURNING id, round_number, minimum_accepted_price, created_at
    `,
    [saleRequestId, roundNumber, minimumAcceptedPrice]
  );
  return result.rows[0] ?? null;
}

/**
 * A rodada ABERTA de uma solicitação.
 *
 * Resolvida pelo par (solicitação, número corrente) — leitura exata sobre a
 * UNIQUE, e não `ORDER BY round_number DESC LIMIT 1`. A diferença importa: o
 * `MAX` enxergaria uma rodada recém-inserida por uma transação concorrente que
 * ainda não moveu o ponteiro, e a oferta entraria numa rodada que ninguém
 * abriu ainda.
 */
export async function getCurrentRound(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT r.id, r.round_number, r.minimum_accepted_price, r.created_at
    FROM sale_request_rounds r
    JOIN sale_requests sr
      ON sr.id = r.sale_request_id
     AND sr.current_round_number = r.round_number
    WHERE r.sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * Move o ponteiro da rodada corrente E devolve a solicitação a
 * `receiving_offers`.
 *
 * As duas coisas no MESMO `UPDATE`, e não em dois: abrir uma rodada sem
 * reabrir a disputa deixaria a solicitação em `handoff_failed` com uma rodada
 * vazia que ninguém pode preencher, e reabrir sem mover o ponteiro faria as
 * ofertas novas entrarem na rodada velha. Nenhum dos dois estados intermediários
 * pode existir nem por um instante.
 *
 * `selected_offer_id` e `selected_offer_at` voltam a NULL porque o CHECK de
 * coerência da 060 exige (`receiving_offers` não tem seleção). Isso NÃO destrói
 * histórico: a trilha `sale_request_offer_selections` guarda todas as seleções
 * com valor e data, e é ela que responde "o que aconteceu". O ponteiro responde
 * apenas "o que está valendo agora".
 *
 * `fromStatus` no `WHERE` é o que torna a transição única e verificável — a
 * mesma disciplina de `markOfferSelected` (4.4) e `moveRequestStatus` (4.5/4.6).
 */
export async function openRound(
  { saleRequestId, ownerUserId, roundNumber, fromStatus, toStatus },
  exec
) {
  const result = await runner(exec)(
    `
    UPDATE sale_requests
    SET current_round_number = $3,
        status = $5,
        selected_offer_id = NULL,
        selected_offer_at = NULL,
        updated_at = NOW()
    WHERE id = $1
      AND owner_user_id = $2
      AND status = $4
      AND current_round_number = $3 - 1
    `,
    [saleRequestId, ownerUserId, roundNumber, fromStatus, toStatus]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * O histórico de rodadas, para leitura de tela.
 *
 * Ordem crescente: a rodada 1 primeiro, porque é a ordem em que aconteceram e a
 * ordem em que a pessoa vai lê-las.
 */
export async function listRounds(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, round_number, minimum_accepted_price, created_at
    FROM sale_request_rounds
    WHERE sale_request_id = $1
    ORDER BY round_number ASC
    `,
    [saleRequestId]
  );
  return result.rows;
}
