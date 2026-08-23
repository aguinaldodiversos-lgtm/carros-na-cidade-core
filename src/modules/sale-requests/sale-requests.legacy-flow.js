/**
 * O guard do fluxo APOSENTADO (Fase 4.7, §32).
 *
 * Arquivo próprio, e minúsculo, de propósito: ele é importado pelo service da
 * 4.5 e pelo da 4.6, e pôr a função em qualquer um dos dois criaria uma
 * dependência entre dois módulos que não têm por que se conhecer.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import {
  SALE_REQUEST_CODE,
  SALE_REQUEST_LEGACY_FLOW_MESSAGE,
} from "./sale-requests.constants.js";

/**
 * Recusa QUALQUER escrita do fluxo de avaliação presencial.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FOI APOSENTADO, E POR QUÊ O ENDPOINT CONTINUA MONTADO
 * ════════════════════════════════════════════════════════════════════════════
 * A Fase 4.7 tirou do produto a agenda, a inspeção, a proposta final e o aceite
 * da proposta final: a avaliação acontece entre as duas partes, fora da
 * plataforma.
 *
 * As rotas continuam existindo. Um 404 de rota faria uma tela antiga ainda
 * aberta em algum navegador parecer um erro de infraestrutura — e alguém iria
 * investigar deploy, proxy e DNS antes de descobrir que a decisão foi de
 * produto. Um 409 com código próprio conta a verdade.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE BLOQUEAR OS CINCO, E NÃO SÓ A ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 * Bastaria bloquear `offerInspectionSlots` para que nenhuma solicitação NOVA
 * entrasse na máquina antiga — os outros writers só são alcançáveis a partir de
 * estados que ninguém mais consegue atingir.
 *
 * Mas a UI dos passos seguintes também foi removida. Deixar `completeInspection`
 * alcançável manteria vivo um caminho de ESCRITA que nenhuma tela chama — o tipo
 * de superfície que sobrevive por anos até alguém encontrá-la, e que ninguém
 * lembra de considerar ao mudar o schema.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AS LEITURAS CONTINUAM INTACTAS
 * ════════════════════════════════════════════════════════════════════════════
 * Os DTOs seguem serializando inspeção e proposta final para as linhas que já as
 * têm, em modo somente-leitura. Nada é apagado (§11), nenhuma FK quebra (§12), e
 * o histórico continua consultável por quem viveu aquele fluxo.
 *
 * UM guard compartilhado e não cinco cópias: cinco literais divergiriam na
 * primeira melhoria de redação, e a quinta cópia é onde alguém esqueceria de
 * bloquear.
 */
export function assertLegacyFlowRetired(action, { userId, saleRequestId } = {}) {
  logger.info(
    {
      ...buildDomainFields({
        action,
        result: "error",
        userId,
        reason: SALE_REQUEST_CODE.LEGACY_FLOW_RETIRED,
      }),
      saleRequestId,
    },
    "[sale-requests] fluxo de avaliação presencial aposentado (4.7)"
  );

  throw new AppError(SALE_REQUEST_LEGACY_FLOW_MESSAGE, 409, true, {
    code: SALE_REQUEST_CODE.LEGACY_FLOW_RETIRED,
  });
}
