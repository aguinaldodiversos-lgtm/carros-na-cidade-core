// Regras do domínio de procuras (Fase 2 — Compradores ativos).
//
// Duas superfícies, com autorizações diferentes:
//
//   1. COMPRADOR (PF) — publica, lista, vê e encerra as PRÓPRIAS procuras.
//      Identidade sempre de `req.user.id`; `buyer_user_id` nunca vem do corpo.
//
//   2. LOJISTA (CNPJ) — vê as procuras ATIVAS da cidade DA LOJA DELE. A cidade
//      é resolvida no servidor a partir do advertiser; o navegador não tem como
//      pedir "me mostre as oportunidades da cidade X".
//
// O que este módulo NÃO faz, de propósito: não seleciona anúncios compatíveis,
// não conta veículos, não pontua, não envia veículo, não abre WhatsApp. Nada
// disso existe na Fase 2 — a entidade é a procura, e só.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { createUserNotification } from "../notifications/notifications.service.js";
import { NOTIFICATION_EVENT_TYPE } from "../notifications/notifications.constants.js";
import * as repo from "./purchase-intents.repository.js";
import {
  BODY_TYPE_LABEL,
  PURCHASE_INTENT_ACTIVE_DAYS,
  PURCHASE_INTENT_PAGE,
  PURCHASE_INTENT_STATUS,
  PURCHASE_INTENT_TYPE,
  TRANSMISSION_LABEL,
} from "./purchase-intents.constants.js";
import {
  decodeCursor,
  encodeCursor,
  parseLimit,
  parsePurchaseIntentId,
  validateNewPurchaseIntent,
} from "./purchase-intents.validation.js";

/**
 * Normaliza o id do usuário autenticado.
 *
 * Mesma guarda de `requireRecipientUserId` no módulo de notificações: `pg`
 * devolve BIGINT como string, então o id alterna entre number e string ao longo
 * da aplicação. `0` é recusado explicitamente — `users.id` é serial e começa em
 * 1, então zero só chegaria aqui por engano e morreria lá embaixo como violação
 * de FK (um 500 no log de banco em vez da causa real).
 *
 * EXPORTADA para o módulo de ofertas (Fase 3) usar a MESMA guarda. Reescrevê-la
 * lá daria duas definições de "id de sessão válido", e a que ficasse mais frouxa
 * seria a que decide se um valor torto chega ao banco.
 */
export function requireUserId(raw) {
  const value = String(raw ?? "").trim();
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new AppError("Sessão inválida.", 401, true, {
      code: "PURCHASE_INTENT_INVALID_USER",
    });
  }
  return value;
}

/**
 * Quem pode PUBLICAR uma procura.
 *
 * A regra é por exclusão: qualquer conta que não seja CNPJ pode publicar,
 * inclusive `pending`. Exigir CPF verificado aqui adicionaria atrito num
 * cadastro que hoje não pede documento — e o produto precisa de compradores,
 * não de formulários.
 *
 * CNPJ é recusado porque o lojista tem a área dele: deixá-lo publicar procura
 * pelo fluxo PF criaria uma oportunidade que outros lojistas da cidade veriam,
 * o que não é o produto desta fase.
 */
function assertBuyerAccount(user) {
  if (user?.account_type === "CNPJ") {
    throw new AppError(
      "Conta de lojista não publica procura. Use a área de oportunidades da loja.",
      403,
      true,
      { code: "PURCHASE_INTENT_BUYER_ONLY" }
    );
  }
}

/** Monta o objeto `city` a partir das colunas do JOIN. */
function cityOf(row) {
  return {
    name: row.city_name,
    state: row.city_state,
    slug: row.city_slug,
  };
}

/**
 * Estado que o COMPRADOR enxerga.
 *
 * `expired` não existe na coluna `status` — é derivado de `expires_at`, avaliado
 * pelo relógio do Postgres (`is_expired` vem da query). Encerrada vence
 * expirada: quem encerrou no dia 3 não deve ver "Expirada" no dia 31.
 */
function displayStatusOf(row) {
  if (row.status === PURCHASE_INTENT_STATUS.CLOSED) return "closed";
  if (row.is_expired) return "expired";
  return "active";
}

function serializeForBuyer(row) {
  return {
    id: row.id,
    intent_type: row.intent_type,
    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    body_type: row.body_type,
    transmission: row.transmission,
    max_price: row.max_price,
    purchase_timeframe: row.purchase_timeframe,
    status: row.status,
    display_status: displayStatusOf(row),
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    city: cityOf(row),
  };
}

/**
 * Projeção entregue ao LOJISTA — allowlist, não blacklist.
 *
 * Cada campo daqui foi escolhido um a um. O que NÃO está: identidade do
 * comprador em qualquer forma. `buyer_user_id` nem chega do banco (ver
 * DEALER_COLUMNS no repository), e este objeto é montado campo a campo em vez
 * de espalhar `...row` — um spread devolveria de graça qualquer coluna nova que
 * alguém adicionasse à consulta depois.
 */
function serializeForDealer(row) {
  return {
    id: row.id,
    intent_type: row.intent_type,
    brand: row.brand,
    model: row.model,
    body_type: row.body_type,
    transmission: row.transmission,
    max_price: row.max_price,
    purchase_timeframe: row.purchase_timeframe,
    created_at: row.created_at,
    expires_at: row.expires_at,
    city: cityOf(row),
  };
}

/**
 * Confere que a cidade escolhida EXISTE no catálogo.
 *
 * Mesmo espírito de `resolveCityIdForNewAdvertiser` (Fase 0.1): fail closed, sem
 * nenhum fallback. Não há "tenta users.city", não há "pega a primeira", não há
 * cookie territorial. Cidade inexistente é 400 com o motivo no log.
 */
async function resolveCityForIntent(userId, cityId) {
  const city = await repo.findCityById(cityId);
  if (!city) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "purchase_intent.city.resolve",
          result: "error",
          userId,
          reason: "not_found",
        }),
        receivedCityId: cityId,
      },
      "[purchase-intents] cidade inexistente — publicação recusada"
    );
    throw new AppError("Cidade inválida.", 400, true, {
      code: "PURCHASE_INTENT_CITY_REQUIRED",
      field: "city_id",
    });
  }
  return city;
}

/**
 * Texto da notificação enviada aos lojistas.
 *
 * Zero PII: descreve o VEÍCULO procurado e a cidade, nunca quem procura. É a
 * mesma fronteira da API do lojista — se o corpo da notificação vazasse um
 * nome, esconder o campo na resposta não teria adiantado nada.
 */
function buildNotificationBody(intent) {
  const transmission = (TRANSMISSION_LABEL[intent.transmission] || "").toLowerCase();
  const city = intent.city.name;

  if (intent.intent_type === PURCHASE_INTENT_TYPE.SPECIFIC_MODEL) {
    return `Uma pessoa está procurando ${intent.brand} ${intent.model} ${transmission} em ${city}.`;
  }

  const body = BODY_TYPE_LABEL[intent.body_type] || intent.body_type;
  return `Uma pessoa está procurando um ${body} ${transmission} em ${city}.`;
}

/**
 * Avisa os lojistas CNPJ da cidade. BEST-EFFORT, por decisão explícita.
 *
 * A procura JÁ ESTÁ PERSISTIDA quando isto roda, e `purchase_intents` é a fonte
 * de verdade da visibilidade: mesmo que todo o fan-out falhe, a oportunidade
 * continua aparecendo em "Compradores ativos". Por isso esta função nunca
 * propaga erro — derrubar a publicação porque um aviso falhou trocaria um
 * problema pequeno (lojista não viu o sino piscar) por um grande (o comprador
 * achou que publicou e não publicou).
 *
 * O try/catch é POR DESTINATÁRIO. Com um único try em volta do laço, o primeiro
 * destinatário problemático abortaria os demais — e o sintoma seria "só metade
 * das lojas foi avisada", que ninguém percebe.
 *
 * Idempotência: a chave é `purchase_intent:{id}:created`, IGUAL para todos os
 * destinatários. O índice único de `user_notifications` é
 * (recipient_user_id, idempotency_key), então a mesma chave em usuários
 * diferentes gera linhas diferentes — é assim que um evento vira N avisos — e
 * reprocessar o evento não duplica nenhum deles.
 */
async function notifyDealersOfNewIntent(intent) {
  const outcome = { recipients: 0, created: 0, failed: 0 };

  let recipients = [];
  try {
    recipients = await repo.listDealerRecipientsByCity(intent.city_id);
  } catch (error) {
    logger.error(
      {
        ...buildDomainFields({
          action: "purchase_intent.notification_fanout",
          result: "error",
          reason: "recipients_query_failed",
        }),
        purchaseIntentId: intent.id,
        err: error?.message || String(error),
      },
      "[purchase-intents] falha ao listar destinatários — procura permanece publicada"
    );
    return outcome;
  }

  outcome.recipients = recipients.length;

  const idempotencyKey = `purchase_intent:${intent.id}:created`;
  const body = buildNotificationBody(intent);

  for (const recipientUserId of recipients) {
    try {
      const result = await createUserNotification({
        recipientUserId,
        eventType: NOTIFICATION_EVENT_TYPE.PURCHASE_INTENT_CREATED,
        title: "Novo comprador na sua cidade",
        body,
        entityType: "purchase_intent",
        entityId: intent.id,
        actionPath: `/dashboard-loja/oportunidades/compradores/${intent.id}`,
        idempotencyKey,
      });
      if (result.created) outcome.created += 1;
    } catch (error) {
      outcome.failed += 1;
      // Log SEM PII: id do destinatário e da procura, nunca o texto nem dados
      // do comprador.
      logger.error(
        {
          ...buildDomainFields({
            action: "purchase_intent.notification_fanout",
            result: "error",
            userId: recipientUserId,
          }),
          purchaseIntentId: intent.id,
          err: error?.message || String(error),
        },
        "[purchase-intents] falha ao notificar lojista"
      );
    }
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent.notification_fanout",
        result: outcome.failed > 0 ? "error" : "success",
      }),
      purchaseIntentId: intent.id,
      cityId: intent.city_id,
      recipients: outcome.recipients,
      created: outcome.created,
      failed: outcome.failed,
    },
    "[purchase-intents] fan-out de notificação concluído"
  );

  return outcome;
}

/**
 * Publica uma procura.
 *
 * Ordem importa: valida → confere cidade → PERSISTE → avisa. O aviso é o último
 * passo e não pode desfazer nada do que veio antes.
 */
export async function createPurchaseIntent(user, input) {
  const buyerUserId = requireUserId(user?.id);
  assertBuyerAccount(user);

  const normalized = validateNewPurchaseIntent(input || {});
  const city = await resolveCityForIntent(buyerUserId, normalized.cityId);

  const insertedId = await repo.insertPurchaseIntent({
    ...normalized,
    buyerUserId,
    activeDays: PURCHASE_INTENT_ACTIVE_DAYS,
  });

  const row = await repo.getByIdForBuyer(insertedId, buyerUserId);
  if (!row) {
    // Não deveria acontecer: acabamos de inserir com este mesmo dono.
    throw new AppError("Não foi possível publicar a procura.", 500, false);
  }

  const intent = serializeForBuyer(row);

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent.create",
        result: "success",
        userId: buyerUserId,
      }),
      purchaseIntentId: intent.id,
      intentType: intent.intent_type,
      cityId: normalized.cityId,
    },
    "[purchase-intents] procura publicada"
  );

  await notifyDealersOfNewIntent({
    id: intent.id,
    city_id: normalized.cityId,
    city,
    intent_type: intent.intent_type,
    brand: intent.brand,
    model: intent.model,
    body_type: intent.body_type,
    transmission: intent.transmission,
  });

  return { purchase_intent: intent };
}

/** Página de procuras do PRÓPRIO comprador, mais recentes primeiro. */
export async function listMyPurchaseIntents(userId, { limit: rawLimit, cursor: rawCursor } = {}) {
  const buyerUserId = requireUserId(userId);
  const limit = parseLimit(rawLimit);
  const cursor = decodeCursor(rawCursor);

  const { rows, hasMore } = await repo.listByBuyer({ buyerUserId, limit, cursor });

  return {
    purchase_intents: rows.map(serializeForBuyer),
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    limit,
  };
}

/**
 * UMA procura do próprio comprador.
 *
 * 404 (e não 403) quando é de outra pessoa: responder "pertence a outro
 * usuário" confirmaria a existência da linha para quem está sondando ids.
 */
export async function getMyPurchaseIntent(userId, rawId) {
  const buyerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawId);

  const row = await repo.getByIdForBuyer(purchaseIntentId, buyerUserId);
  if (!row) {
    throw new AppError("Procura não encontrada.", 404);
  }
  return { purchase_intent: serializeForBuyer(row) };
}

/**
 * Encerra a procura do próprio comprador.
 *
 * Idempotente: encerrar de novo devolve 200 com a mesma linha, sem erro. Um 409
 * aqui só serviria para o usuário que clicou duas vezes ver uma mensagem de
 * falha para uma ação que, do ponto de vista dele, deu certo.
 */
export async function closeMyPurchaseIntent(userId, rawId) {
  const buyerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawId);

  const { intent, changed } = await repo.closeForBuyer(purchaseIntentId, buyerUserId);
  if (!intent) {
    throw new AppError("Procura não encontrada.", 404);
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent.close",
        result: "success",
        userId: buyerUserId,
      }),
      purchaseIntentId,
      changed,
    },
    "[purchase-intents] procura encerrada"
  );

  return { purchase_intent: serializeForBuyer(intent) };
}

/**
 * Cidade da loja do usuário autenticado — a única fonte da visibilidade do
 * lojista.
 *
 * FAIL CLOSED em quatro situações, todas devolvendo `null`:
 *
 *   - nenhum advertiser: o usuário é CNPJ mas ainda não tem loja;
 *   - nenhum advertiser ATIVO: todas as lojas dele estão suspensas ou
 *     bloqueadas. Moderação não é sobre plano nem estoque — é sobre não
 *     entregar demanda privada a quem foi tirado do ar;
 *   - advertiser sem `city_id`: a Fase 0.1 proíbe inferir cidade, e inferir
 *     aqui (de `users.city`, do primeiro anúncio, do cookie) entregaria
 *     oportunidades de gente real para a cidade errada;
 *   - MAIS DE UMA cidade distinta entre os advertisers ATIVOS do mesmo usuário:
 *     `advertisers.user_id` não tem UNIQUE, então isso é possível hoje. Escolher
 *     "a primeira" seria decidir por sorteio de que cidade o lojista é.
 *
 * Linhas duplicadas apontando para a MESMA cidade não são conflito — a resposta
 * é a mesma seja qual for a linha lida. E uma loja bloqueada em outra cidade
 * também não é conflito: ela não entra no conjunto.
 *
 * `null` não é erro: a listagem devolve vazio e o detalhe devolve 404. O lojista
 * sem localização válida simplesmente não participa desta fase, exatamente como
 * a especificação pede.
 */
export async function resolveDealerCityId(userId) {
  // Só lojas OPERACIONAIS entram no conjunto — suspensa/bloqueada é filtrada no
  // SQL. Consequência que importa: um advertiser bloqueado em outra cidade não
  // vira conflito, porque nem chega aqui. Quem foi suspenso perde o acesso, não
  // ganha um empate que tranca a loja boa junto.
  const rows = await repo.listActiveAdvertisersByUserId(userId);

  const cityIds = [
    ...new Set(
      rows
        .map((row) => row.city_id)
        .filter((cityId) => cityId != null && String(cityId).trim() !== "")
        .map((cityId) => String(cityId))
    ),
  ];

  if (cityIds.length === 1) {
    return Number(cityIds[0]);
  }

  logger.warn(
    {
      ...buildDomainFields({
        action: "purchase_intent.dealer_city.resolve",
        result: "error",
        userId,
        reason: cityIds.length === 0 ? "missing" : "ambiguous",
      }),
      advertiserRows: rows.length,
      distinctCities: cityIds.length,
    },
    "[purchase-intents] cidade da loja indefinida — oportunidades ocultas"
  );

  return null;
}

/**
 * Oportunidades ativas da cidade da loja.
 *
 * `cityId` NUNCA vem do cliente. Chega de `resolveDealerCityId`, que só olha o
 * advertiser do usuário autenticado — é isso que impede um lojista de Bragança
 * de listar Atibaia trocando um parâmetro.
 */
export async function listDealerOpportunities(userId, { limit: rawLimit, cursor: rawCursor } = {}) {
  const dealerUserId = requireUserId(userId);
  const limit = parseLimit(rawLimit);
  const cursor = decodeCursor(rawCursor);

  const cityId = await resolveDealerCityId(dealerUserId);
  if (cityId == null) {
    return { purchase_intents: [], next_cursor: null, limit };
  }

  const { rows, hasMore } = await repo.listActiveByCity({ cityId, limit, cursor });

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent.dealer_list",
        result: "success",
        userId: dealerUserId,
      }),
      cityId,
      returned: rows.length,
    },
    "[purchase-intents] oportunidades listadas para lojista"
  );

  return {
    purchase_intents: rows.map(serializeForDealer),
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    limit,
  };
}

/**
 * UMA oportunidade, se for da cidade da loja e estiver ativa.
 *
 * Sempre 404 quando não casa — nunca "esta oportunidade é de outra cidade".
 * Distinguir os motivos confirmaria a existência da procura para quem está
 * sondando ids de fora da cidade.
 */
export async function getDealerOpportunity(userId, rawId) {
  const dealerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawId);

  const cityId = await resolveDealerCityId(dealerUserId);
  if (cityId == null) {
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  const row = await repo.getActiveByIdForCity(purchaseIntentId, cityId);
  if (!row) {
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  return { purchase_intent: serializeForDealer(row) };
}

export { PURCHASE_INTENT_PAGE };
