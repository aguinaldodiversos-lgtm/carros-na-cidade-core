// Regras do domínio "Venda seu carro para lojas" (Produto 2, Fase 4.1).
//
// UMA superfície nesta fase: o DONO (pessoa física). Ele publica, lista, vê e
// cancela as PRÓPRIAS solicitações. A identidade sai sempre de `req.user.id`;
// `owner_user_id` nunca vem do corpo.
//
// ────────────────────────────────────────────────────────────────────────────
// O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO
// ────────────────────────────────────────────────────────────────────────────
// Não distribui a solicitação para lojista, não notifica ninguém, não pontua,
// não recebe lance, não seleciona loja, não abre WhatsApp e não expira nada.
// Nenhuma dessas entidades existe ainda — e notificar um lojista sobre uma tela
// que ele não pode abrir seria pior que não notificar.
//
// Também NÃO existe edição. Publicou, não edita campo economicamente relevante:
// quando os lances chegarem (Fase 4.3), mudar km ou ano por baixo de uma oferta
// já feita seria alterar o objeto do negócio depois da proposta.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { buildCanonicalImageUrlFromStorageKey } from "../ads/ads.public-images.js";
import { ACCOUNT_TYPE } from "../../shared/middlewares/dealer.middleware.js";
import { resolveFipeReference } from "../fipe/fipe.service.js";
import * as repo from "./sale-requests.repository.js";
import {
  SALE_REQUEST_ACTIVE_LIMIT,
  SALE_REQUEST_CODE,
  SALE_REQUEST_PAGE,
  SALE_REQUEST_STATUS,
} from "./sale-requests.constants.js";
import {
  requireUserId,
  decodeCursor,
  encodeCursor,
  parseLimit,
  parseSaleRequestId,
  validateNewSaleRequest,
} from "./sale-requests.validation.js";

/**
 * `requireUserId` MUDOU DE CASA na Fase 4.3.
 *
 * A guarda passou para `sale-requests.validation.js`, junto do resto da
 * validação de entrada, porque o domínio ganhou um SEGUNDO service (a área do
 * lojista) que precisa dela. Mantê-la aqui obrigaria aquele service a importar
 * este — arrastando FIPE, storage e notificações para um caminho que só lista
 * veículos.
 *
 * A reexportação preserva os call sites existentes
 * (`sale-requests.photos.service.js` e a suíte do dono): é UMA definição, com
 * dois caminhos de import.
 */
export { requireUserId };


/**
 * Quem pode PUBLICAR uma solicitação de venda.
 *
 * Regra por EXCLUSÃO: qualquer conta que não seja CNPJ pode publicar, inclusive
 * `pending`. Exigir CPF verificado adicionaria atrito num cadastro que hoje não
 * pede documento — e o produto precisa de vendedores, não de formulários.
 *
 * A autoridade é `req.user.account_type`, derivado pelo `authMiddleware` a partir
 * de `users.document_type` a cada request. Nunca cookie de UI, corpo, query ou
 * header — o frontend não é barreira nenhuma para quem fala HTTP.
 *
 * CNPJ é recusado porque o lojista é o OUTRO lado deste mercado: ele compra. Um
 * lojista publicando pelo fluxo de PF criaria uma oportunidade que os
 * concorrentes da cidade dele veriam na Fase 4.2.
 *
 * Vive no service, e não num middleware de rota, pelo mesmo motivo documentado
 * em `purchase-intents.routes.js`: é regra de PRODUTO, e a mensagem precisa
 * dizer ao lojista para onde ir.
 */
function assertOwnerAccount(user) {
  if (user?.account_type === ACCOUNT_TYPE.CNPJ) {
    throw new AppError(
      "Conta de lojista não vende veículo por aqui. Use a área de oportunidades da loja.",
      403,
      true,
      { code: SALE_REQUEST_CODE.OWNER_ONLY }
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
 * `storage_key` → URL pública, pelo helper CANÔNICO do projeto.
 *
 * `buildCanonicalImageUrlFromStorageKey` resolve R2 público quando configurado e
 * cai para o proxy `/api/vehicle-images?key=` quando não. Uma segunda regra de
 * URL aqui divergiria da primeira na próxima mudança de storage, e o sintoma
 * seria foto quebrada só nesta área.
 */
function imagesOf(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows
    .map((row) => buildCanonicalImageUrlFromStorageKey(row.storage_key))
    .filter(Boolean);
}

/**
 * DTO do DONO — montado campo a campo, NUNCA `...row`.
 *
 * Um spread devolveria de graça qualquer coluna nova que alguém adicionasse à
 * consulta depois. `owner_user_id` já não sai do banco (ver `OWNER_COLUMNS`), e
 * nada de `users` é lido em nenhum momento — e-mail, telefone, documento e nome
 * não têm por onde vazar.
 */
function serializeForOwner(row, { images = [] } = {}) {
  return {
    id: row.id,
    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    fipe_model_description: row.fipe_model_description,
    fipe_code: row.fipe_code,
    fipe_reference_value: row.fipe_reference_value,
    fipe_reference_at: row.fipe_reference_at,
    year: row.year,
    mileage: row.mileage,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    declared_condition: row.declared_condition,
    known_issues: row.known_issues,

    // ────────────────────────────────────────────────────────────────────────
    // FICHA DE AVALIAÇÃO — campo a campo, e NULL preservado
    // ────────────────────────────────────────────────────────────────────────
    // Nenhum `?? "unknown"` e nenhum `?? false` aqui. Uma solicitação publicada
    // antes desta evolução tem NULL em todas estas colunas, e NULL significa
    // "não foi perguntado" — que é diferente de "a pessoa respondeu que não
    // sabe" e MUITO diferente de "não". Traduzir NULL para um valor do
    // vocabulário aqui inventaria uma resposta que ninguém deu, e o lojista
    // leria como declaração do proprietário.
    //
    // Quem decide como isso APARECE é a tela, que mostra "Não informado".
    tire_condition: row.tire_condition,

    financing_status: row.financing_status,
    financing_balance: row.financing_balance,
    fines_status: row.fines_status,
    fines_amount: row.fines_amount,
    ipva_status: row.ipva_status,
    ipva_amount_due: row.ipva_amount_due,
    licensing_status: row.licensing_status,

    caution_report_status: row.caution_report_status,
    auction_history: row.auction_history,
    collision_history: row.collision_history,

    engine_condition: row.engine_condition,
    engine_notes: row.engine_notes,
    gearbox_condition: row.gearbox_condition,
    gearbox_notes: row.gearbox_notes,
    suspension_condition: row.suspension_condition,
    suspension_notes: row.suspension_notes,

    body_paint_status: row.body_paint_status,
    // JSONB chega já desserializado pelo driver. O guarda de tipo mantém a
    // distinção que importa: array (inclusive vazio) = respondido; null =
    // linha legada. Um `|| []` colapsaria as duas.
    body_paint_issues: Array.isArray(row.body_paint_issues) ? row.body_paint_issues : null,
    body_paint_notes: row.body_paint_notes,

    status: row.status,
    images,
    city: cityOf(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Confere que a cidade escolhida EXISTE no catálogo.
 *
 * Fail closed, sem nenhum fallback: não há "tenta users.city", não há "pega a
 * primeira", não há cookie territorial, não há Atibaia. Cidade inexistente é 400
 * com o motivo no log.
 */
async function resolveCityForRequest(ownerUserId, cityId) {
  const city = await repo.findCityById(cityId);
  if (!city) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "sale_request.city.resolve",
          result: "error",
          userId: ownerUserId,
          reason: "not_found",
        }),
        receivedCityId: cityId,
      },
      "[sale-requests] cidade inexistente — publicação recusada"
    );
    throw new AppError("Cidade inválida.", 400, true, {
      code: SALE_REQUEST_CODE.CITY_REQUIRED,
      field: "city_id",
    });
  }
  return city;
}

/**
 * Resolve o valor FIPE no SERVIDOR. Best-effort, e fora da transação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE FORA DA TRANSAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * `resolveFipeReference` faz chamada HTTP externa. Dentro da transação, ela
 * seguraria o `FOR UPDATE` da linha do usuário durante toda a latência de um
 * provedor de terceiros — e um provedor lento viraria, na prática, um lock de
 * vários segundos por publicação.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NUNCA FALHA A PUBLICAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * FIPE é uma ÂNCORA, não um requisito. Derrubar a publicação porque um provedor
 * externo está fora trocaria um problema pequeno (o lojista avalia sem a
 * referência na tela) por um grande (a pessoa não consegue vender o carro).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE SÓ `confidence: "high"` VIRA VALOR
 * ────────────────────────────────────────────────────────────────────────────
 * `resolveFipeReference` tem um caminho de "client hint" que aceita o valor
 * enviado pelo cliente como dado informativo de baixa confiança. Aqui esse
 * caminho é IGNORADO por construção: não passamos `client_hint_value`, e o valor
 * só é gravado quando o snapshot é `ok` com confiança alta — que é exatamente o
 * que `fipeValueForRiskScoring` já formaliza no pipeline de anúncios.
 *
 * O cliente não é autoridade sobre o valor de mercado do próprio carro. Se
 * fosse, um vendedor poderia publicar "FIPE R$ 200.000" num carro de R$ 40.000 e
 * o lojista veria um número fabricado com aparência de referência oficial.
 *
 * @returns {Promise<{ fipeCode: string|null, fipeReferenceValue: string|null, fipeReferenceAt: Date|null }>}
 */
async function resolveFipeSnapshot({ ownerUserId, input, deps = {} }) {
  const empty = { fipeCode: null, fipeReferenceValue: null, fipeReferenceAt: null };

  const resolve = typeof deps.resolveFipeReference === "function"
    ? deps.resolveFipeReference
    : resolveFipeReference;

  let snapshot = null;
  try {
    snapshot = await resolve({
      fipe_brand_code: input?.fipe_brand_code,
      fipe_model_code: input?.fipe_model_code,
      fipe_year_code: input?.fipe_year_code,
      fipe_code: input?.fipe_code,
      vehicle_type: "carros",
      // Deliberadamente SEM `client_hint_value` — ver o bloco acima.
    });
  } catch (error) {
    logger.warn(
      {
        ...buildDomainFields({
          action: "sale_request.fipe.resolve",
          result: "error",
          userId: ownerUserId,
          reason: "provider_threw",
        }),
        err: error?.message || String(error),
      },
      "[sale-requests] FIPE indisponível — solicitação segue sem referência"
    );
    return empty;
  }

  if (!snapshot?.ok || snapshot.confidence !== "high") {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.fipe.resolve",
          result: "success",
          userId: ownerUserId,
          reason: snapshot?.failure_reason || "not_high_confidence",
        }),
        confidence: snapshot?.confidence || "none",
      },
      "[sale-requests] FIPE não resolvida com alta confiança — gravando NULL"
    );
    return empty;
  }

  const value = Number(snapshot.value);
  if (!Number.isFinite(value) || value <= 0) return empty;

  return {
    fipeCode: snapshot.fipe_code ? String(snapshot.fipe_code).trim() : null,
    // String com 2 casas: o driver `pg` devolve NUMERIC como texto, então manter
    // o valor em texto nas duas direções evita que um float de ida e um texto de
    // volta pareçam valores diferentes.
    fipeReferenceValue: value.toFixed(2),
    fipeReferenceAt: snapshot.fipe_snapshot_at ? new Date(snapshot.fipe_snapshot_at) : new Date(),
  };
}

/**
 * Publica uma solicitação de venda.
 *
 * ORDEM DAS ETAPAS — cada uma depende da anterior:
 *
 *   1. identidade e tipo de conta (nada de I/O);
 *   2. validação do corpo, incluindo POSSE das fotos pelo prefixo da chave;
 *   3. existência da cidade;
 *   4. FIPE (externo, best-effort) — FORA da transação;
 *   5. TRANSAÇÃO: trava a conta → conta abertas → recusa ou insere
 *      solicitação + galeria, atômico.
 *
 * O passo 5 é o P0 desta fase. Ver `lockOwnerForCreate` no repositório para o
 * argumento completo de por que o lock é na linha do USUÁRIO.
 */
export async function createSaleRequest(user, input, deps = {}) {
  const ownerUserId = requireUserId(user?.id);
  assertOwnerAccount(user);

  const normalized = validateNewSaleRequest(input || {}, { ownerUserId });
  const city = await resolveCityForRequest(ownerUserId, normalized.cityId);
  const fipe = await resolveFipeSnapshot({ ownerUserId, input: input || {}, deps });

  const insertedId = await withTransaction(async (tx) => {
    // 1. Serializa por CONTA. Dois cliques simultâneos entram em fila aqui, e é
    //    isso que faz a contagem do segundo enxergar o INSERT do primeiro.
    const owner = await repo.lockOwnerForCreate(ownerUserId, tx);
    if (!owner) {
      // A sessão é válida (o token foi verificado) mas a conta sumiu do banco.
      // 401 e não 404: o problema é a sessão, não um recurso pedido.
      throw new AppError("Sessão inválida.", 401, true, {
        code: SALE_REQUEST_CODE.INVALID_USER,
      });
    }

    // 2. Teto de solicitações abertas. Cancelada não conta.
    const open = await repo.countOpenByOwner(ownerUserId, tx);
    if (open >= SALE_REQUEST_ACTIVE_LIMIT) {
      throw new AppError(
        `Você já tem ${SALE_REQUEST_ACTIVE_LIMIT} solicitações recebendo ofertas. Cancele uma para publicar outra.`,
        409,
        true,
        {
          code: SALE_REQUEST_CODE.ACTIVE_LIMIT_REACHED,
          active_limit: SALE_REQUEST_ACTIVE_LIMIT,
        }
      );
    }

    // 3. Solicitação + galeria na MESMA transação. Se qualquer foto violar o
    //    UNIQUE global de `storage_key`, o INSERT lança e o ROLLBACK leva junto
    //    a solicitação — nunca fica uma linha parcial sem as fotos que a pessoa
    //    enviou.
    const saleRequestId = await repo.insertSaleRequest(
      {
        ownerUserId,
        cityId: normalized.cityId,
        brand: normalized.brand,
        brandSlug: normalized.brandSlug,
        model: normalized.model,
        modelSlug: normalized.modelSlug,
        fipeModelDescription: normalized.fipeModelDescription,
        fipeCode: fipe.fipeCode,
        fipeReferenceValue: fipe.fipeReferenceValue,
        fipeReferenceAt: fipe.fipeReferenceAt,
        year: normalized.year,
        mileage: normalized.mileage,
        transmission: normalized.transmission,
        fuelType: normalized.fuelType,
        declaredCondition: normalized.declaredCondition,
        knownIssues: normalized.knownIssues,

        // Ficha de avaliação, campo a campo. Um spread de `normalized` aqui
        // funcionaria hoje e passaria a mandar para o INSERT qualquer chave que
        // a validação viesse a devolver depois — `photos`, por exemplo, que já
        // está lá e não é coluna de `sale_requests`.
        tireCondition: normalized.tireCondition,
        financingStatus: normalized.financingStatus,
        financingBalance: normalized.financingBalance,
        finesStatus: normalized.finesStatus,
        finesAmount: normalized.finesAmount,
        ipvaStatus: normalized.ipvaStatus,
        ipvaAmountDue: normalized.ipvaAmountDue,
        licensingStatus: normalized.licensingStatus,
        cautionReportStatus: normalized.cautionReportStatus,
        auctionHistory: normalized.auctionHistory,
        collisionHistory: normalized.collisionHistory,
        engineCondition: normalized.engineCondition,
        engineNotes: normalized.engineNotes,
        gearboxCondition: normalized.gearboxCondition,
        gearboxNotes: normalized.gearboxNotes,
        suspensionCondition: normalized.suspensionCondition,
        suspensionNotes: normalized.suspensionNotes,
        bodyPaintStatus: normalized.bodyPaintStatus,
        bodyPaintIssues: normalized.bodyPaintIssues,
        bodyPaintNotes: normalized.bodyPaintNotes,
      },
      tx
    );

    if (!saleRequestId) {
      throw new AppError("Não foi possível publicar a solicitação.", 500, false);
    }

    await repo.insertSaleRequestImages(
      { saleRequestId, photos: normalized.photos },
      tx
    );

    return saleRequestId;
  });

  const row = await repo.getByIdForOwner(insertedId, ownerUserId);
  if (!row) {
    // Não deveria acontecer: acabamos de inserir com este mesmo dono.
    throw new AppError("Não foi possível publicar a solicitação.", 500, false);
  }

  const imagesByRequest = await repo.listImagesByRequestIds([insertedId]);

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.create",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId: insertedId,
      cityId: normalized.cityId,
      photos: normalized.photos.length,
      fipeResolved: Boolean(fipe.fipeReferenceValue),
    },
    "[sale-requests] solicitação publicada"
  );

  return {
    sale_request: serializeForOwner(row, {
      images: imagesOf(imagesByRequest.get(String(insertedId)) || []),
    }),
    city,
  };
}

/** Página de solicitações do PRÓPRIO dono, mais recentes primeiro. */
export async function listMySaleRequests(userId, { limit: rawLimit, cursor: rawCursor } = {}) {
  const ownerUserId = requireUserId(userId);
  const limit = parseLimit(rawLimit);
  const cursor = decodeCursor(rawCursor);

  const { rows, hasMore } = await repo.listByOwner({ ownerUserId, limit, cursor });

  // UMA consulta de imagens para a página inteira — sem N+1.
  const imagesByRequest = await repo.listImagesByRequestIds(rows.map((row) => row.id));

  return {
    sale_requests: rows.map((row) =>
      serializeForOwner(row, {
        images: imagesOf(imagesByRequest.get(String(row.id)) || []),
      })
    ),
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    limit,
  };
}

/**
 * UMA solicitação do próprio dono.
 *
 * 404 (e não 403) quando é de outra pessoa: responder "pertence a outro usuário"
 * confirmaria a existência da linha para quem está sondando ids.
 */
export async function getMySaleRequest(userId, rawId) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const row = await repo.getByIdForOwner(saleRequestId, ownerUserId);
  if (!row) {
    throw new AppError("Solicitação não encontrada.", 404);
  }

  const imagesByRequest = await repo.listImagesByRequestIds([saleRequestId]);

  return {
    sale_request: serializeForOwner(row, {
      images: imagesOf(imagesByRequest.get(String(saleRequestId)) || []),
    }),
  };
}

/**
 * Cancela a solicitação do próprio dono.
 *
 * IDEMPOTENTE: cancelar de novo devolve 200 com a mesma linha, sem erro. Um 409
 * aqui só serviria para quem clicou duas vezes ver uma falha para uma ação que,
 * do ponto de vista dele, deu certo.
 *
 * Soft: `status = 'cancelled'`, nunca DELETE. A linha permanece no histórico.
 */
export async function cancelMySaleRequest(userId, rawId) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const { row, changed } = await repo.cancelForOwner(saleRequestId, ownerUserId);
  if (!row) {
    throw new AppError("Solicitação não encontrada.", 404);
  }

  const imagesByRequest = await repo.listImagesByRequestIds([saleRequestId]);

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.cancel",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      changed,
    },
    "[sale-requests] solicitação cancelada"
  );

  return {
    sale_request: serializeForOwner(row, {
      images: imagesOf(imagesByRequest.get(String(saleRequestId)) || []),
    }),
    changed,
  };
}

export { SALE_REQUEST_PAGE, SALE_REQUEST_STATUS };
