/**
 * Acesso a dados da DECISÃO DO PROPRIETÁRIO sobre a proposta final (Fase 4.6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TUDO QUE É CRITÉRIO É LIDO DEPOIS DO LOCK, EM COMANDO PRÓPRIO
 * ════════════════════════════════════════════════════════════════════════════
 * O lock é um `SELECT ... FOR UPDATE` sobre a linha de `sale_requests` — e SÓ
 * sobre ela, sem JOIN nenhum. A proposta final, a loja destinatária e a decisão
 * já existente vêm de três leituras separadas, executadas depois.
 *
 * Isso não é fragmentação gratuita: é a lição que a 4.5 registrou neste mesmo
 * domínio. Em READ COMMITTED, `FOR UPDATE` re-avalia apenas a linha travada; as
 * outras tabelas de um JOIN continuam vindo do snapshot anterior ao commit
 * concorrente. Uma decisão pós-inspeção gravada por uma transação que acabou de
 * commitar apareceria como INEXISTENTE para quem trouxe tudo num JOIN só — e o
 * caminho seguiria adiante decidindo sobre uma proposta que já mudou.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE MÓDULO NUNCA SELECIONA
 * ════════════════════════════════════════════════════════════════════════════
 * `internal_note` da decisão da loja. É a nota operacional dela, e o
 * proprietário nunca a vê — a coluna existe separada de `adjustment_note`
 * exatamente para que estas queries possam deixá-la de fora sem pensar duas
 * vezes. A garantia não é "o DTO não repassa": é que o dado não chega ao
 * service.
 *
 * E nenhum dado de contato, dos dois lados: nem `users.email`/`phone` do
 * proprietário para a loja, nem `advertisers.email`/`phone`/`whatsapp` da loja
 * para o proprietário. Não há JOIN com nenhuma das duas tabelas neste arquivo.
 */
import { query } from "../../infrastructure/database/db.js";
import { POST_INSPECTION_DECISION } from "./sale-requests.inspection.constants.js";

function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * TRAVA a solicitação pelo lado do PROPRIETÁRIO.
 *
 * A posse (`owner_user_id`) está no `WHERE` — mesma disciplina de todo o
 * repositório do dono desde a 4.1. Linha de outra pessoa simplesmente não casa,
 * e o service transforma isso em 404 indistinguível de "não existe" (§12).
 *
 * `sr.status` NÃO entra no `WHERE`, de propósito: precisamos distinguir "não é
 * sua / não existe" (404) de "é sua, mas o estado não permite" (409). Filtrar
 * por status aqui colapsaria as duas numa só, e as telas são diferentes.
 *
 * @returns {Promise<object|null>}
 */
export async function lockRequestForOwner(saleRequestId, ownerUserId, exec) {
  const locked = await runner(exec)(
    `
    SELECT
      sr.id,
      sr.status,
      sr.selected_offer_id
    FROM sale_requests sr
    WHERE sr.id = $1
      AND sr.owner_user_id = $2
    FOR UPDATE
    `,
    [saleRequestId, ownerUserId]
  );

  return locked.rows[0] ?? null;
}

/**
 * A proposta final da loja — o pai da trilha que vamos escrever.
 *
 * Lida DEPOIS do lock, em comando próprio. Traz tudo que a decisão do
 * proprietário precisa copiar (`id`, `advertiser_id`, `decision_type`,
 * `final_amount`) e o `decision_type` está aqui para ser CONFERIDO no service,
 * não para ser escolhido: o `no_offer` é recusado antes do INSERT, e a FK
 * composta da 059 o torna inalcançável mesmo se a conferência sumisse.
 */
export async function getPostInspectionDecision(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      id,
      advertiser_id,
      inspection_id,
      selected_offer_id,
      decision_type,
      final_amount
    FROM sale_request_post_inspection_decisions
    WHERE sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * A conta que recebe o aviso: quem enviou a proposta preliminar selecionada.
 *
 * É ENDEREÇAMENTO, nunca autorização — a mesma distinção que a 4.5 documenta.
 * Quem tem direito de agir do outro lado é o advertiser inteiro; este id existe
 * só para que a notificação tenha um destinatário determinístico, e ele não
 * entra em DTO nenhum.
 */
export async function getSelectedOfferRecipient(saleRequestId, selectedOfferId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      o.id,
      o.advertiser_id,
      o.dealer_user_id
    FROM sale_request_offers o
    WHERE o.id = $1
      AND o.sale_request_id = $2
    LIMIT 1
    `,
    [selectedOfferId, saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * A decisão do proprietário, se já existir.
 *
 * Serve a dois chamadores com necessidades opostas e o mesmo formato: dentro da
 * transação é o que decide entre retry idempotente e 409 (§16); fora dela é o
 * que alimenta os DTOs das duas telas.
 *
 * `decided_by_user_id`, `advertiser_id` e `post_inspection_decision_id` NÃO são
 * selecionados. Nenhuma tela precisa deles, e o §29 é explícito: id interno não
 * atravessa a fronteira. Não é o DTO que os omite — é a query que não os pede.
 */
export async function getOwnerDecision(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      id,
      decision_type,
      final_amount_snapshot,
      created_at
    FROM sale_request_owner_final_decisions
    WHERE sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * Registra a decisão. APPEND-ONLY: nunca UPDATE, nunca DELETE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O VALOR E O TIPO DE ORIGEM SÃO ESCRITOS AQUI, NÃO ESCOLHIDOS LÁ FORA
 * ────────────────────────────────────────────────────────────────────────────
 * `post_inspection_decision_type` é o literal `final_offer` vindo da constante —
 * o service não tem como passar outro, porque não existe parâmetro para isso. E
 * `finalAmount` é o valor que o service ACABOU de ler da proposta final travada,
 * nunca um número do corpo da requisição.
 *
 * As duas coisas são conferidas pelo banco: a FK composta de 5 colunas da 059
 * exige que o par (tipo, valor) case exatamente com a linha-pai. Um valor
 * diferente — inclusive um que viesse do navegador por um bug futuro — não
 * grava; levanta violação de FK.
 *
 * `ON CONFLICT DO NOTHING` sobre o UNIQUE de `sale_request_id`, pela mesma razão
 * das trilhas da 4.4 e da 4.5: com o lock na mão isto não deveria disparar, e o
 * ramo existe para o dia em que o lock não estiver lá. Sem ele, o mesmo cenário
 * viraria um 500 de violação de constraint em vez de um 409 legível.
 */
export async function insertOwnerDecision(
  {
    saleRequestId,
    postInspectionDecisionId,
    advertiserId,
    decisionType,
    finalAmount,
    decidedByUserId,
  },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_owner_final_decisions (
      sale_request_id, post_inspection_decision_id, advertiser_id,
      post_inspection_decision_type, decision_type, final_amount_snapshot,
      decided_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (sale_request_id) DO NOTHING
    RETURNING id, decision_type, final_amount_snapshot, created_at
    `,
    [
      saleRequestId,
      postInspectionDecisionId,
      advertiserId,
      POST_INSPECTION_DECISION.FINAL_OFFER,
      decisionType,
      finalAmount,
      decidedByUserId,
    ]
  );
  return result.rows[0] ?? null;
}

/**
 * Move o status da SOLICITAÇÃO.
 *
 * `fromStatus` no `WHERE` é o que torna a transição única e verificável — mesma
 * disciplina de `markOfferSelected` (4.4) e `moveRequestStatus` (4.5). Um
 * `WHERE id = $1` puro confiaria em quem chama ter conferido o estado antes, e
 * é justamente a conferência que a concorrência invalida.
 */
export async function moveRequestStatus({ saleRequestId, fromStatus, toStatus }, exec) {
  const result = await runner(exec)(
    `
    UPDATE sale_requests
    SET status = $3,
        updated_at = NOW()
    WHERE id = $1
      AND status = $2
    `,
    [saleRequestId, fromStatus, toStatus]
  );
  return (result.rowCount ?? 0) > 0;
}
