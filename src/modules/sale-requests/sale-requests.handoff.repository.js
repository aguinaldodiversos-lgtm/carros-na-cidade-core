/**
 * Acesso a dados do HANDOFF (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A ÚNICA QUERY DO DOMÍNIO QUE LÊ CONTATO DE LOJA
 * ════════════════════════════════════════════════════════════════════════════
 * `getSelectedStoreContact` seleciona `advertisers.whatsapp` — e é a única em
 * todo o Produto 2 que seleciona um canal de contato.
 *
 * Isso é deliberado e é a fronteira inteira da privacidade desta fase: antes do
 * aceite NENHUMA query traz contato de ninguém, e depois do aceite exatamente
 * UMA traz o WhatsApp COMERCIAL da loja ESCOLHIDA, para o dono da solicitação.
 * Não é o DTO que filtra — é que o dado não chega ao service por nenhum outro
 * caminho.
 *
 * O escopo está no `WHERE`: `sr.owner_user_id` e o JOIN por
 * `sr.selected_offer_id`. Outra pessoa não casa; uma loja que não é a escolhida
 * não casa.
 *
 * E o inverso continua valendo sem exceção: nada do PROPRIETÁRIO é selecionado
 * em lugar nenhum deste arquivo. A loja não recebe telefone, e-mail nem CPF pelo
 * portal — quem abre a conversa é a pessoa, pelo WhatsApp, e é o WhatsApp que
 * revela o número dela, como aconteceria em qualquer contato do mundo real.
 */
import { query } from "../../infrastructure/database/db.js";

function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * TRAVA a solicitação pelo lado do PROPRIETÁRIO.
 *
 * `FOR UPDATE` sobre `sale_requests` e só ela — a MESMA linha que a seleção e a
 * abertura de rodada travam. É o que serializa os três caminhos entre si (§41,
 * §42, §43): aceitar outra oferta, informar que não houve acordo e abrir nova
 * rodada não podem acontecer em paralelo sobre o mesmo negócio.
 *
 * Sem JOIN: a seleção corrente e o desfecho já registrado são lidos em comandos
 * PRÓPRIOS depois do lock. Em READ COMMITTED o `FOR UPDATE` re-avalia apenas a
 * linha travada, e um JOIN traria as demais tabelas do snapshot anterior ao
 * commit concorrente — a lição que a 4.5 registrou em `readInspectionRow`.
 */
export async function lockRequestForOwner(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, status, selected_offer_id, current_round_number
    FROM sale_requests
    WHERE id = $1
      AND owner_user_id = $2
    FOR UPDATE
    `,
    [saleRequestId, ownerUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * A seleção ATUAL — a que corresponde ao ponteiro `selected_offer_id`.
 *
 * A trilha guarda TODAS as seleções da solicitação desde a 4.7; esta função
 * devolve a que está valendo, casando `offer_id` com o ponteiro. É o que liga o
 * ESTADO (a coluna) ao EVENTO (a linha da trilha) sem depender de ordenação por
 * data — duas seleções no mesmo instante são improváveis, mas "a mais recente"
 * é uma heurística e o ponteiro é um fato.
 */
export async function getCurrentSelection(saleRequestId, selectedOfferId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, round_id, offer_id, advertiser_id, amount_snapshot, selected_at
    FROM sale_request_offer_selections
    WHERE sale_request_id = $1
      AND offer_id = $2
    LIMIT 1
    `,
    [saleRequestId, selectedOfferId]
  );
  return result.rows[0] ?? null;
}

/** O desfecho já registrado para uma seleção, se houver. */
export async function getOutcomeForSelection(selectionId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, outcome, created_at
    FROM sale_request_handoff_outcomes
    WHERE selection_id = $1
    LIMIT 1
    `,
    [selectionId]
  );
  return result.rows[0] ?? null;
}

/**
 * Registra o desfecho. APPEND-ONLY.
 *
 * `ON CONFLICT DO NOTHING` sobre o UNIQUE de `selection_id`: com o lock na mão
 * isto não deveria disparar, e o ramo existe para o dia em que o lock não
 * estiver lá — transformando "duas confirmações simultâneas" em `null` tratável
 * em vez de um 500 de constraint.
 *
 * O `outcome` é escrito pelo repositório a partir da constante, e não recebido
 * como parâmetro: não existe segundo valor, e um parâmetro sugeriria que existe.
 */
export async function insertOutcome(
  { saleRequestId, selectionId, outcome, recordedByUserId },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_handoff_outcomes (
      sale_request_id, selection_id, outcome, recorded_by_user_id
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (selection_id) DO NOTHING
    RETURNING id, outcome, created_at
    `,
    [saleRequestId, selectionId, outcome, recordedByUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * Move o status da solicitação.
 *
 * `fromStatus` no `WHERE` torna a transição única e verificável — a mesma
 * disciplina de todas as fases anteriores. O ponteiro da seleção NÃO é mexido:
 * `handoff_failed` continua apontando para a oferta que falhou, porque é ela que
 * a tela mostra enquanto o proprietário decide o que fazer.
 */
export async function moveRequestStatus(
  { saleRequestId, ownerUserId, fromStatus, toStatus },
  exec
) {
  const result = await runner(exec)(
    `
    UPDATE sale_requests
    SET status = $4,
        updated_at = NOW()
    WHERE id = $1
      AND owner_user_id = $2
      AND status = $3
    `,
    [saleRequestId, ownerUserId, fromStatus, toStatus]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Os dados COMERCIAIS da loja escolhida, para o handoff.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA QUERY SELECIONA — E POR QUE CADA CAMPO ESTÁ AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * `name`, `address`, cidade/UF e `whatsapp`. Os três primeiros para a pessoa
 * saber COM QUEM e ONDE; o quarto para ela conseguir COMBINAR.
 *
 * `adv.email`, `adv.phone`, `adv.mobile_phone`, `adv.telephone`, `adv.telefone`
 * e o documento NÃO são pedidos. Em especial os telefones: o schema tem cinco
 * colunas de contato por herança (migrations antigas), e usar qualquer uma
 * delas como "o WhatsApp" entregaria o número pessoal de um operador no lugar do
 * canal comercial da loja. `whatsapp` é o campo que a loja preenche em
 * `/dashboard-loja/dados` sabendo que é público.
 *
 * O veículo vem junto porque a MENSAGEM precisa dele — e vem como marca +
 * descrição FIPE, os mesmos campos que a loja viu no card.
 */
export async function getSelectedStoreContact(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      adv.id          AS advertiser_id,
      adv.name        AS store_name,
      adv.address     AS store_address,
      adv.whatsapp    AS store_whatsapp,
      c.name          AS store_city_name,
      c.state         AS store_city_state,
      o.amount        AS offer_amount,
      sr.brand        AS vehicle_brand,
      sr.model        AS vehicle_model,
      sr.year         AS vehicle_year
    FROM sale_requests sr
    JOIN sale_request_offers o
      ON o.id = sr.selected_offer_id
     AND o.sale_request_id = sr.id
    JOIN advertisers adv ON adv.id = o.advertiser_id
    LEFT JOIN cities c ON c.id = adv.city_id
    WHERE sr.id = $1
      AND sr.owner_user_id = $2
    LIMIT 1
    `,
    [saleRequestId, ownerUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * O histórico de seleções da solicitação, para a tela do proprietário.
 *
 * Uma linha por aceite, da mais recente para a mais antiga, com o nome da loja e
 * se aquele match foi encerrado. É o que sustenta "Não houve acordo com a Loja
 * A" na tela de resseleção.
 *
 * `dealer_user_id` e contato NÃO são selecionados: este é histórico, não canal.
 */
export async function listSelectionHistory(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      s.id,
      s.round_id,
      s.offer_id,
      s.amount_snapshot,
      s.selected_at,
      adv.name       AS store_name,
      r.round_number,
      out.outcome,
      out.created_at AS outcome_at
    FROM sale_request_offer_selections s
    JOIN advertisers adv ON adv.id = s.advertiser_id
    JOIN sale_request_rounds r ON r.id = s.round_id
    LEFT JOIN sale_request_handoff_outcomes out ON out.selection_id = s.id
    WHERE s.sale_request_id = $1
    ORDER BY s.selected_at DESC, s.id DESC
    `,
    [saleRequestId]
  );
  return result.rows;
}
