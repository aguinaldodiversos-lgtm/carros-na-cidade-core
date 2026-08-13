// Acesso a dados do envio de veículos (Fase 3). Todas as queries são
// parametrizadas ($1,$2,...).
//
// ────────────────────────────────────────────────────────────────────────────
// A MESMA REGRA DE OURO DA FASE 2
// ────────────────────────────────────────────────────────────────────────────
// Nenhuma função aceita "o id" sozinho. A leitura do comprador carrega
// `buyerUserId`; a leitura e a escrita do lojista carregam `dealerUserId` e o
// JOIN em `advertisers` que prova a posse do anúncio. A autorização acontece
// DENTRO da query — um SELECT seguido de `if` em JS tem janela de corrida e,
// pior, um caminho novo pode esquecer o `if`.
//
// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR INJETÁVEL (`exec`)
// ────────────────────────────────────────────────────────────────────────────
// Toda função recebe `exec` opcional: quando ausente usa o pool, quando
// presente usa o cliente da TRANSAÇÃO. Sem isso, o `SELECT ... FOR UPDATE` do
// envio ficaria numa conexão e o `INSERT` em outra — o lock não valeria nada e
// o limite de 3 seria furável por dois cliques simultâneos.
//
// ────────────────────────────────────────────────────────────────────────────
// `ads` É A FONTE DE VERDADE DO VEÍCULO
// ────────────────────────────────────────────────────────────────────────────
// Nenhuma query aqui escreve em `ads`. Enviar um veículo não muda status, não
// muda prioridade, não conta lead e não toca em nada público — só cria a linha
// de relação.

import { query } from "../../infrastructure/database/db.js";
import { AD_STATUS, ADVERTISER_STATUS } from "../../shared/constants/status.js";
import { advertiserIsOperational } from "./purchase-intents.repository.js";

/** Pool por omissão; cliente da transação quando fornecido. */
function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * Colunas do anúncio necessárias para (a) decidir compatibilidade e (b) montar
 * o card. Allowlist explícita, nunca `a.*`.
 *
 * `images` (JSONB) é a ÚNICA coluna de imagem que `ads` tem. A normalização
 * para URL pública é feita por `ads.public-images.js` — a estratégia canônica
 * do projeto, reaproveitada em vez de reimplementada (ver o service).
 *
 * NÃO existe `ads.image_url`, e a tentação de selecioná-la é real: o objeto que
 * `normalizePublicAdRow` DEVOLVE tem um campo `image_url` (a capa já resolvida),
 * e a allowlist de DTO em `ads.public-listing.js` lista `image_url` entre os
 * campos do card. Os dois são SAÍDA do serializer, não coluna de tabela — a
 * migration 004 nunca criou `image_url` em `ads`, e nenhuma migration posterior
 * criou (a única `image_url` do schema é a de `blog_posts`, na 035).
 *
 * Selecioná-la fazia o PostgreSQL responder
 * `column a.image_url does not exist` e derrubar os três caminhos desta fase.
 * `buildNormalizedPublicImages` lê `row.images` e trata `row.image_url` como
 * OPCIONAL (`if (row?.image_url != null)`), então a ausência da coluna não muda
 * nada no resultado.
 */
const AD_CARD_COLUMNS = `
  a.id,
  a.slug,
  a.title,
  a.brand,
  a.model,
  a.year,
  a.mileage,
  a.transmission,
  a.body_type,
  a.price,
  a.images,
  a.status
`;

/**
 * Contexto de matching de UMA procura, escopado à cidade da loja.
 *
 * Existe porque `DEALER_COLUMNS` (Fase 2) não traz `brand_slug` nem
 * `model_slug` — os campos que o casamento compara. Continua SEM
 * `buyer_user_id`: esta consulta alimenta a tela do lojista, e a identidade do
 * comprador não sai do banco por este caminho.
 *
 * Os filtros de cidade/status/validade são os MESMOS da Fase 2. Uma procura de
 * outra cidade, encerrada ou vencida simplesmente não casa, e o service devolve
 * 404 sem distinguir os motivos.
 */
export async function getMatchingContextForCity(purchaseIntentId, cityId, exec) {
  const result = await runner(exec)(
    `
    SELECT
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
      pi.created_at,
      pi.expires_at,
      c.name  AS city_name,
      c.state AS city_state,
      c.slug  AS city_slug
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
 * A MESMA procura, agora TRAVADA para escrita — e com `buyer_user_id`.
 *
 * ATENÇÃO: esta é a única consulta do módulo que devolve `buyer_user_id`. O
 * valor serve para UMA coisa (endereçar a notificação ao comprador) e nunca
 * entra em DTO nenhum do lojista. Ver `serializeOffer` no service.
 *
 * `FOR UPDATE` na linha da procura é o que serializa os envios concorrentes:
 * quatro requests para a mesma procura entram em fila no primeiro SELECT, então
 * a contagem de vagas de um enxerga o INSERT do anterior. Sem ele, os quatro
 * leriam `count = 0` e inseririam quatro — o índice único impediria a
 * duplicata, mas não o excesso, porque são ANÚNCIOS DIFERENTES.
 *
 * O lock é na `purchase_intents`, e não em `purchase_intent_offers`, porque o
 * que precisa ser serializado é "quantas vagas restam NESTA procura" — e não
 * existe linha de oferta para travar antes de a primeira ser criada
 * (`SELECT ... FOR UPDATE` sobre zero linhas não bloqueia ninguém).
 *
 * Os filtros de status/validade estão DENTRO do SELECT travado: se o comprador
 * encerrar a procura no intervalo entre a tela do lojista e o clique, o POST não
 * casa nada e é recusado — o estado que vale é o do banco no instante do envio,
 * não o que o navegador carregou.
 */
export async function lockActiveIntentForCity(purchaseIntentId, cityId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      pi.id,
      pi.buyer_user_id,
      pi.city_id,
      pi.intent_type,
      pi.brand,
      pi.brand_slug,
      pi.model,
      pi.model_slug,
      pi.body_type,
      pi.transmission,
      pi.max_price
    FROM purchase_intents pi
    WHERE pi.id = $1
      AND pi.city_id = $2
      AND pi.status = 'active'
      AND pi.expires_at > NOW()
    FOR UPDATE
    `,
    [purchaseIntentId, cityId]
  );
  return result.rows[0] ?? null;
}

/**
 * Estoque ATIVO do PRÓPRIO lojista.
 *
 * `adv.user_id = $1` é a cláusula que impede o produto errado: esta lista nunca
 * pode virar "todos os anúncios compatíveis da cidade". O lojista envia carro
 * do estoque dele, não do concorrente.
 *
 * O status do ADVERTISER entra aqui e não numa checagem posterior: loja
 * suspensa não deve nem montar a lista. Como `advertisers.user_id` não tem
 * UNIQUE, o JOIN pode trazer o anúncio por qualquer uma das linhas de loja do
 * usuário — todas filtradas pelo mesmo predicado de moderação.
 *
 * SEM filtro de cidade no ANÚNCIO, de propósito: a regra territorial da fase é
 * sobre o LOJISTA (a cidade da procura tem de ser a da loja dele, resolvida
 * antes desta consulta). Exigir `a.city_id = <cidade da procura>` esconderia do
 * lojista de Atibaia um carro que ele mesmo cadastrou com a cidade vizinha —
 * estoque dele, que ele tem todo o direito de oferecer.
 */
export async function listActiveAdsByDealer({ dealerUserId, limit }, exec) {
  const result = await runner(exec)(
    `
    SELECT ${AD_CARD_COLUMNS}
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE adv.user_id = $1
      AND a.status = $2
      AND ${advertiserIsOperational({ param: 3 })}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $4
    `,
    [dealerUserId, AD_STATUS.ACTIVE, ADVERTISER_STATUS.ACTIVE, limit + 1]
  );

  const rows = result.rows.slice(0, limit);
  return { rows, truncated: result.rows.length > limit };
}

/**
 * UM anúncio, provado como sendo DO LOJISTA autenticado.
 *
 * É a defesa contra o ataque de §18: o navegador manda `ad_id`, e nada no
 * request diz de quem ele é. Aqui a posse é reconstruída pelo servidor —
 * `ads.advertiser_id → advertisers.id → advertisers.user_id`, o mesmo modelo de
 * `ad-ownership.js` — e o anúncio de outra loja simplesmente não casa. O service
 * transforma isso em 404, sem confirmar que o anúncio existe.
 *
 * SEM filtro de status, de propósito: quem decide o que fazer com um anúncio
 * pausado/vendido é o service, e ele precisa distinguir "não é seu" (404) de
 * "é seu, mas não está ativo" (recusa com código próprio). Um `AND status =
 * 'active'` aqui colapsaria os dois casos em 404 e o lojista não entenderia por
 * que o próprio carro sumiu.
 */
export async function getAdForDealer({ adId, dealerUserId }, exec) {
  const result = await runner(exec)(
    `
    SELECT ${AD_CARD_COLUMNS}
    FROM ads a
    JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE a.id = $1
      AND adv.user_id = $2
      AND ${advertiserIsOperational({ param: 3 })}
    LIMIT 1
    `,
    [adId, dealerUserId, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows[0] ?? null;
}

/** A relação já existe? Chave natural (procura, anúncio) — a mesma do UNIQUE. */
export async function findOfferByIntentAndAd({ purchaseIntentId, adId }, exec) {
  const result = await runner(exec)(
    `
    SELECT id, purchase_intent_id, dealer_user_id, ad_id, created_at
    FROM purchase_intent_offers
    WHERE purchase_intent_id = $1
      AND ad_id = $2
    LIMIT 1
    `,
    [purchaseIntentId, adId]
  );
  return result.rows[0] ?? null;
}

/**
 * Quantas VAGAS o lojista ocupa nesta procura.
 *
 * Conta apenas ofertas cujo anúncio ainda está ACTIVE e cuja loja ainda está
 * operacional. Um carro vendido depois do envio LIBERA a vaga — a relação
 * permanece no histórico do comprador, mas deixa de bloquear o lojista de
 * oferecer outra coisa. É a leitura correta do limite: ele existe para não
 * monopolizar a tela do comprador com opções vivas, e um carro vendido não
 * ocupa tela nenhuma.
 *
 * `adv.id IS NOT NULL` com LEFT JOIN: anúncio sem linha de advertiser não conta
 * como disponível. Com INNER JOIN o efeito seria o mesmo aqui, mas o LEFT deixa
 * explícito que a ausência é tratada, e não acidentalmente filtrada.
 */
export async function countAvailableOffersByDealer({ purchaseIntentId, dealerUserId }, exec) {
  const result = await runner(exec)(
    `
    SELECT COUNT(*)::int AS total
    FROM purchase_intent_offers o
    JOIN ads a ON a.id = o.ad_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE o.purchase_intent_id = $1
      AND o.dealer_user_id = $2
      AND a.status = $3
      AND adv.id IS NOT NULL
      AND ${advertiserIsOperational({ param: 4 })}
    `,
    [purchaseIntentId, dealerUserId, AD_STATUS.ACTIVE, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows[0]?.total ?? 0;
}

/**
 * Cria a relação. `ON CONFLICT DO NOTHING` sobre o índice único (procura,
 * anúncio).
 *
 * Devolve `null` quando a linha já existia — inclusive quando um request
 * concorrente venceu a corrida entre a checagem de duplicidade e este INSERT.
 * O service trata `null` como "já enviado" e responde idempotente; transformar
 * isso num 500 puniria um retry legítimo de rede.
 */
export async function insertOffer({ purchaseIntentId, dealerUserId, adId }, exec) {
  const result = await runner(exec)(
    `
    INSERT INTO purchase_intent_offers (purchase_intent_id, dealer_user_id, ad_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (purchase_intent_id, ad_id) DO NOTHING
    RETURNING id, purchase_intent_id, dealer_user_id, ad_id, created_at
    `,
    [purchaseIntentId, dealerUserId, adId]
  );
  return result.rows[0] ?? null;
}

/** Ids já enviados PELO LOJISTA nesta procura — alimenta o selo "Enviado". */
export async function listSentAdIdsByDealer({ purchaseIntentId, dealerUserId }, exec) {
  const result = await runner(exec)(
    `
    SELECT ad_id
    FROM purchase_intent_offers
    WHERE purchase_intent_id = $1
      AND dealer_user_id = $2
    `,
    [purchaseIntentId, dealerUserId]
  );
  return result.rows.map((row) => String(row.ad_id));
}

/**
 * Veículos recebidos, para o COMPRADOR. Uma query só.
 *
 * Sem N+1: os dados do anúncio, o nome da loja e a disponibilidade saem todos
 * daqui. A única consulta adicional do fluxo é a de imagens, que é feita EM
 * LOTE para todos os anúncios da página (ver o service).
 *
 * A posse está no WHERE (`pi.buyer_user_id = $2`) e não num `if` do service:
 * pedir as ofertas da procura de outra pessoa não casa nenhuma linha. O JOIN
 * com `purchase_intents` existe para isso.
 *
 * `available` é COMPUTADO na leitura, a partir do estado ATUAL do anúncio e da
 * loja. Não existe coluna equivalente em `purchase_intent_offers` — se
 * existisse, precisaria de alguém para atualizá-la quando o carro fosse vendido.
 *
 * `LEFT JOIN advertisers` preserva o HISTÓRICO: se a linha da loja sumisse, um
 * INNER JOIN faria o card desaparecer da área do comprador. Com LEFT ele
 * continua lá, marcado como indisponível.
 */
export async function listOffersForBuyer({ purchaseIntentId, buyerUserId }, exec) {
  const result = await runner(exec)(
    `
    SELECT
      o.id         AS offer_id,
      o.created_at AS sent_at,
      ${AD_CARD_COLUMNS},
      c.name  AS city_name,
      c.state AS city_state,
      adv.name AS dealer_name,
      (
        a.status = $3
        AND adv.id IS NOT NULL
        AND ${advertiserIsOperational({ param: 4 })}
      ) AS available
    FROM purchase_intent_offers o
    JOIN purchase_intents pi ON pi.id = o.purchase_intent_id
    JOIN ads a ON a.id = o.ad_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    LEFT JOIN cities c ON c.id = a.city_id
    WHERE o.purchase_intent_id = $1
      AND pi.buyer_user_id = $2
    ORDER BY o.created_at DESC, o.id DESC
    `,
    [purchaseIntentId, buyerUserId, AD_STATUS.ACTIVE, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows;
}

/**
 * Contato da loja para UMA oferta — Fase 3.1.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODA A AUTORIZAÇÃO ESTÁ NO `WHERE`
 * ────────────────────────────────────────────────────────────────────────────
 * As três condições que a fase exige vivem na query, não num `if` do service:
 *
 *   o.id = $1                    — a oferta pedida;
 *   o.purchase_intent_id = $2    — ela pertence ÀQUELA procura (§40: a oferta
 *                                  de outra procura do mesmo comprador não casa);
 *   pi.buyer_user_id = $3        — a procura é de QUEM está pedindo (§39).
 *
 * Qualquer combinação torta devolve zero linhas, e o service responde 404 sem
 * distinguir os motivos — distinguir confirmaria a existência da oferta alheia
 * para quem está sondando ids.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DE ONDE SAI O NÚMERO
 * ────────────────────────────────────────────────────────────────────────────
 * `COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone)` — a MESMA precedência
 * de `ads.repository.js`, `ads-filter.builder.js` e `leads.service.js`, e a que
 * `store-profile.service.js` documenta como fonte de verdade única (a tela
 * "Dados da loja" grava em `advertisers.whatsapp`, que vence o COALESCE).
 *
 * `advertisers` ainda tem `telefone` e `telephone`, colunas legadas que NENHUM
 * caminho do produto lê. Incluí-las aqui inventaria uma quarta precedência e
 * faria esta rota discordar do botão de WhatsApp do anúncio público.
 *
 * O advertiser vem do ANÚNCIO (`a.advertiser_id`), nunca de "algum advertiser
 * do usuário": é o anúncio que determina qual loja enviou o veículo.
 *
 * `LEFT JOIN` + `adv.id IS NOT NULL` no predicado: anúncio órfão de loja é
 * "não operacional", e não um NULL que o COALESCE de status transformaria em
 * 'active' silenciosamente.
 */
export async function getOfferContactForBuyer({ offerId, purchaseIntentId, buyerUserId }, exec) {
  const result = await runner(exec)(
    `
    SELECT
      o.id AS offer_id,
      a.id AS ad_id,
      a.brand,
      a.model,
      a.year,
      a.title,
      a.status AS ad_status,
      adv.name AS dealer_name,
      (
        adv.id IS NOT NULL
        AND ${advertiserIsOperational({ param: 4 })}
      ) AS dealer_operational,
      COALESCE(adv.whatsapp, adv.mobile_phone, adv.phone) AS whatsapp_number
    FROM purchase_intent_offers o
    JOIN purchase_intents pi ON pi.id = o.purchase_intent_id
    JOIN ads a ON a.id = o.ad_id
    LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
    WHERE o.id = $1
      AND o.purchase_intent_id = $2
      AND pi.buyer_user_id = $3
    LIMIT 1
    `,
    [offerId, purchaseIntentId, buyerUserId, ADVERTISER_STATUS.ACTIVE]
  );
  return result.rows[0] ?? null;
}
