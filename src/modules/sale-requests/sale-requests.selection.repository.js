/**
 * Acesso a dados da SELEÇÃO PRELIMINAR (Fase 4.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM ARQUIVO PRÓPRIO
 * ────────────────────────────────────────────────────────────────────────────
 * As queries daqui são do DONO (escopo por `owner_user_id`) mas leem
 * `sale_request_offers` e fazem JOIN com `advertisers` e `cities` — coisas que
 * nenhuma query de `sale-requests.repository.js` conhecia até agora.
 *
 * Pôr isto lá misturaria dois escopos de autorização no mesmo arquivo: aquele
 * garante posse por `owner_user_id`, o de ofertas garante território por
 * `city_id`, e um leitor futuro precisaria saber qual regra vale para cada
 * função. Pôr no de ofertas seria pior: aquele arquivo é lido pela área do
 * LOJISTA, e o nome comercial das lojas rivais — que aqui é dado legítimo para o
 * proprietário — não pode nem passar perto de lá.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O EXECUTOR INJETÁVEL (`exec`)
 * ────────────────────────────────────────────────────────────────────────────
 * Mesma disciplina dos outros repositórios do domínio: o pool quando ausente, o
 * cliente da TRANSAÇÃO quando presente. Sem isso, o `SELECT ... FOR UPDATE` da
 * solicitação ficaria numa conexão e a leitura da proposta atual em outra — o
 * lock não valeria nada e a checagem de "esta oferta ainda é a atual?" leria o
 * estado ANTERIOR ao lance concorrente, que é exatamente a corrida do §13.
 */
import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";

/** Pool por omissão; cliente da transação quando fornecido. */
function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * TRAVA a solicitação para a decisão — o ponto de serialização de TUDO nesta
 * fase.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * É A MESMA LINHA QUE `lockSaleRequestForOffer` TRAVA
 * ────────────────────────────────────────────────────────────────────────────
 * E isso não é coincidência: é o mecanismo inteiro do §13. A proposta trava
 * `sale_requests` (escopada à cidade da loja) e a seleção trava `sale_requests`
 * (escopada ao dono). Como é a MESMA linha, o PostgreSQL serializa as duas — e
 * é por isso que "selecionar a oferta antiga enquanto a loja aumenta" não pode
 * acontecer, em nenhuma ordem:
 *
 *   aumento primeiro  → a seleção acorda, relê a proposta atual da loja e
 *                       encontra a oferta NOVA. A antiga vira stale → 409.
 *   seleção primeiro  → a proposta acorda, relê o status e encontra
 *                       `offer_selected` → 409 (`OFFER_CLOSED`).
 *
 * Se cada lado travasse uma linha diferente (a solicitação de um lado, a lista
 * de propostas do outro), as duas transações rodariam em paralelo e as duas
 * passariam.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A POSSE ESTÁ NO `WHERE` DO PRÓPRIO LOCK
 * ────────────────────────────────────────────────────────────────────────────
 * Não existe "trava e depois confere o dono num `if`": a autorização é parte da
 * mesma query. A solicitação de outra pessoa não casa, a função devolve `null` e
 * o service transforma isso em 404 — sem nunca ter travado nada, e sem revelar
 * que a linha existe.
 *
 * `status` NÃO entra no `WHERE`, de propósito: precisamos distinguir "não existe
 * / não é sua" (404) de "é sua, mas já foi decidida" (409), e essas duas
 * respostas pedem telas diferentes. Filtrar por status aqui colapsaria as duas
 * num 404 só.
 *
 * `selected_offer_id` vem na mesma leitura porque é critério da decisão: é ele
 * que distingue o RETRY idempotente (mesma oferta → 200) do conflito (outra
 * oferta → 409). Lido fora do lock, seria um valor de antes da trava.
 *
 * @returns {Promise<{ id: string, status: string, selected_offer_id: string|null }|null>}
 */
export async function lockSaleRequestForSelection(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, status, selected_offer_id
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
 * A proposta apontada, PROVADA como pertencente a esta solicitação.
 *
 * `sale_request_id` está no `WHERE` junto do `id`: uma proposta de OUTRA
 * solicitação simplesmente não casa. Não é um `if` comparando
 * `offer.sale_request_id === saleRequestId` depois de ler — é a ausência de
 * qualquer caminho em que a linha errada chegue ao service.
 *
 * Devolve `advertiser_id` porque o passo seguinte precisa dele para descobrir
 * qual é a proposta ATUAL daquela loja. `note` NÃO é selecionada: ela é interna
 * (migration 055) e não tem por que trafegar num caminho que termina em resposta
 * ao proprietário.
 */
export async function findOfferForSelection(saleRequestId, offerId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, advertiser_id, dealer_user_id, amount
    FROM sale_request_offers
    WHERE id = $1
      AND sale_request_id = $2
    LIMIT 1
    `,
    [offerId, saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * As propostas ATUAIS da solicitação — uma por loja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `DISTINCT ON (advertiser_id)` É A DEFINIÇÃO DE "PROPOSTA ATUAL"
 * ────────────────────────────────────────────────────────────────────────────
 * A tabela é append-only e guarda o histórico inteiro de lances (migration 055).
 * O proprietário NÃO vê histórico: vê uma linha por loja, com o último valor que
 * ela disse.
 *
 * A regra é a MESMA de `findCurrentOfferForAdvertiser`: a mais RECENTE
 * (`created_at DESC, id DESC`), não a maior. Hoje as duas coincidem, porque a
 * regra da 4.3 só permite aumentar — mas "a proposta da loja" é, por definição,
 * a última coisa que ela disse, e escrever `MAX(amount)` aqui esconderia essa
 * decisão atrás de uma coincidência temporária. No dia em que uma correção
 * administrativa permitir um valor menor, esta lista continua certa e um `MAX`
 * mostraria um valor que a loja já retirou.
 *
 * As duas definições precisam ser IDÊNTICAS, e não parecidas: a lista alimenta a
 * tela, e `findCurrentOfferForAdvertiser` decide se o que a tela apontou ainda
 * vale (§9). Se divergissem, a tela ofereceria para seleção uma proposta que a
 * transação recusaria como obsoleta — um botão que nunca funciona. Há teste
 * provando a igualdade entre as duas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A ORDENAÇÃO FINAL É POR VALOR, E O DESEMPATE É DETERMINÍSTICO
 * ────────────────────────────────────────────────────────────────────────────
 * `amount DESC, id DESC` (§4). O `id DESC` fecha a ordem total: duas lojas com o
 * MESMO valor são possíveis (nada impede duas primeiras propostas iguais ao
 * piso), e sem desempate elas trocariam de posição entre dois carregamentos —
 * o proprietário veria a lista se reorganizar sozinha entre um olhar e outro.
 *
 * Ordenar por valor NÃO é ordenar por preferência: qualquer proposta da lista
 * pode ser selecionada (§4), e a de cima não tem nenhum privilégio no servidor.
 *
 * O `ORDER BY` externo é obrigatório porque `DISTINCT ON` impõe a própria
 * ordenação interna (por `advertiser_id`) — sem a subquery, a lista sairia
 * ordenada por id de loja, que não significa nada para quem lê.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA QUERY SELECIONA, E O QUE ELA RECUSA A SELECIONAR
 * ────────────────────────────────────────────────────────────────────────────
 * Nome comercial da loja e cidade/UF — os dois dados que permitem ao
 * proprietário comparar (§3). Nada além disso sai do banco:
 *
 *   `o.dealer_user_id`  não é selecionado — é a PESSOA que operou, e o
 *                       proprietário não negocia com pessoa nenhuma nesta fase;
 *   `o.note`            não é selecionada — é interna e não é canal de conversa;
 *   `adv.*`             não existe: e-mail, telefone, CNPJ e documento da loja
 *                       não têm por onde vazar porque não são pedidos.
 *
 * `o.advertiser_id` É selecionado, e fica no repositório: o service precisa dele
 * para agrupar, e o serializador do DTO não o repassa (§3). É a mesma disciplina
 * de `purchase-intent-offers`, onde o `buyer_user_id` é lido para endereçar a
 * notificação e não aparece em resposta nenhuma.
 *
 * A posse está no `WHERE` (`sr.owner_user_id = $2`): a lista de propostas de
 * outra pessoa não casa, e a função devolve vazio em vez de erro — quem chama já
 * provou a posse da solicitação antes.
 */
export async function listCurrentOffersForOwner(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      current_offers.id,
      current_offers.advertiser_id,
      current_offers.amount,
      current_offers.created_at,
      adv.name  AS store_name,
      c.name    AS store_city_name,
      c.state   AS store_city_state
    FROM (
      SELECT DISTINCT ON (o.advertiser_id)
        o.id, o.advertiser_id, o.amount, o.created_at
      FROM sale_request_offers o
      JOIN sale_requests sr ON sr.id = o.sale_request_id
      WHERE o.sale_request_id = $1
        AND sr.owner_user_id = $2
      ORDER BY o.advertiser_id, o.created_at DESC, o.id DESC
    ) AS current_offers
    JOIN advertisers adv ON adv.id = current_offers.advertiser_id
    LEFT JOIN cities c ON c.id = adv.city_id
    ORDER BY current_offers.amount DESC, current_offers.id DESC
    `,
    [saleRequestId, ownerUserId]
  );
  return result.rows;
}

/**
 * Registra o EVENTO de seleção. Append-only: nunca UPDATE, nunca DELETE.
 *
 * `ON CONFLICT DO NOTHING` sobre o UNIQUE de `sale_request_id`, e a escolha
 * merece explicação porque parece redundante: o lock da solicitação já
 * serializou as duas transações, então a segunda deveria ter LIDO o
 * `selected_offer_id` da primeira e sido recusada pelo service muito antes de
 * chegar aqui.
 *
 * Deveria — e é justamente por isso que o `ON CONFLICT` fica. Ele é a rede que
 * transforma "alguém removeu o lock" ou "apareceu um segundo caminho de escrita"
 * de corrupção silenciosa (duas seleções) em `rowCount = 0` visível, que o
 * service trata como conflito. Sem ele, o mesmo cenário viraria um 500 de
 * violação de constraint, com stack de banco no log e nenhuma mensagem útil para
 * quem clicou.
 *
 * `amount_snapshot` vem de FORA (do valor lido dentro do lock), não de um
 * `SELECT amount FROM sale_request_offers` embutido: o valor congelado precisa
 * ser o mesmo que o service validou, e uma segunda leitura — ainda que na mesma
 * transação — daria à próxima pessoa a impressão de que os dois podem divergir.
 *
 * @returns {Promise<object|null>} a linha criada, ou `null` quando já existia
 */
export async function insertOfferSelection(
  { saleRequestId, offerId, advertiserId, selectedByUserId, amountSnapshot },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_offer_selections (
      sale_request_id, offer_id, advertiser_id, selected_by_user_id, amount_snapshot
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (sale_request_id) DO NOTHING
    RETURNING id, sale_request_id, offer_id, advertiser_id, amount_snapshot, selected_at
    `,
    [saleRequestId, offerId, advertiserId, selectedByUserId, amountSnapshot]
  );
  return result.rows[0] ?? null;
}

/**
 * Aplica o ESTADO da seleção na solicitação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O `WHERE` É A ÚLTIMA BARREIRA, E ELE REPETE TUDO DE PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 * `owner_user_id` (a posse) e `status = 'receiving_offers'` (a transição válida)
 * estão aqui mesmo já tendo sido conferidos no lock, alguns microssegundos
 * antes, na mesma transação. A repetição não é desconfiança do lock — é o que
 * mantém a escrita correta se um caminho futuro chamar esta função sem ter
 * travado: o `UPDATE` não casa linha nenhuma, `changed` volta `false`, e o
 * service recusa. Um `WHERE id = $1` puro confiaria em quem chama.
 *
 * `status = 'receiving_offers'` no `WHERE` também é o que torna a transição
 * ÚNICA (§8): uma solicitação já `offer_selected` não casa, então não há como
 * trocar de loja por este caminho — nem por um retry, nem por um caminho novo
 * que esqueça de conferir o estado antes.
 *
 * `selected_offer_at` é `NOW()` da transação, e não um `Date` do Node: o
 * instante da decisão é o do COMMIT, e o relógio do processo de aplicação pode
 * estar dessincronizado do banco. Toda ordenação futura da trilha compara
 * `selected_at` com `created_at` das propostas — dois relógios diferentes
 * produziriam uma seleção "anterior" à proposta que ela escolheu.
 *
 * @returns {Promise<boolean>} `true` quando a linha mudou
 */
export async function markOfferSelected(
  { saleRequestId, ownerUserId, offerId },
  exec
) {
  const result = await runner(exec)(
    `
    UPDATE sale_requests
    SET status = $4,
        selected_offer_id = $3,
        selected_offer_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
      AND owner_user_id = $2
      AND status = $5
    `,
    [
      saleRequestId,
      ownerUserId,
      offerId,
      SALE_REQUEST_STATUS.OFFER_SELECTED,
      SALE_REQUEST_STATUS.RECEIVING_OFFERS,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * A proposta SELECIONADA de uma solicitação, com a loja — para exibição.
 *
 * Leitura de tela, fora de transação: a seleção é imutável nesta fase (§8), e um
 * valor "atrasado" aqui não existe — depois do commit ele não muda mais.
 *
 * Escopada ao dono, como tudo neste arquivo. O JOIN parte de
 * `sr.selected_offer_id` (o ESTADO), e não de `sale_request_offer_selections` (o
 * EVENTO): esta função responde "o que mostrar agora", e o estado é a fonte
 * dessa pergunta. A trilha responde "o que aconteceu", e ninguém a lê para
 * montar tela.
 *
 * `INNER JOIN` e não `LEFT`: o CHECK de coerência da migration 057 garante que
 * `selected_offer_id` só é não-nulo com `status = 'offer_selected'`, e a FK
 * garante que a proposta existe. Um `LEFT JOIN` sugeriria um estado — seleção
 * apontando para o vazio — que o banco torna inexprimível.
 */
export async function getSelectedOfferForOwner(saleRequestId, ownerUserId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      o.id,
      o.advertiser_id,
      o.amount,
      sr.selected_offer_at,
      adv.name  AS store_name,
      c.name    AS store_city_name,
      c.state   AS store_city_state
    FROM sale_requests sr
    JOIN sale_request_offers o ON o.id = sr.selected_offer_id
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
