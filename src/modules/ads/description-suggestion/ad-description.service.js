/**
 * Serviço da sugestão de descrição (Fase 4.5).
 *
 * Fluxo: payload → ficha estrita → orquestrador de IA → guard → texto.
 *
 * Três recusas que valem explicação:
 *
 * 1) PROVEDOR "template" É FALHA, NÃO SUCESSO.
 *    `AiOrchestrator.generate` nunca lança: quando todos os provedores caem
 *    ele devolve `ok:false` com o texto de `buildFallback`. Para esta task o
 *    fallback é `null` de propósito, mas o teste aqui é pelo PROVEDOR — se
 *    alguém repuser um template no futuro, este caminho continua recusando.
 *    Devolver template ao anunciante seria publicar texto idêntico em todo
 *    anúncio (conteúdo duplicado interno) e afirmar fato não declarado.
 *
 * 2) DEADLINE PRÓPRIO DE 15s.
 *    Os timeouts do orquestrador são POR PROVEDOR (20s local, 25s premium) e
 *    ainda multiplicam por `AI_PROVIDER_ATTEMPTS` e pela cadeia local→premium.
 *    O pior caso passa de um minuto — inaceitável para um botão. O `race`
 *    limita a ESPERA do cliente; não cancela a chamada em voo, que morre
 *    sozinha no timeout do provedor.
 *
 * 3) MENSAGEM GENÉRICA PARA O CLIENTE.
 *    Detalhe (provedor, erro, motivos do guard) só no log, correlacionável por
 *    requestId — contrato do errorHandler consertado em d463abee.
 */

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { getLogger } from "../../../shared/logger.js";
import { getSharedAiOrchestrator } from "../../../brain/index.js";
import * as adsRepository from "../ads.repository.js";
import { assertAdOwner } from "../ad-ownership.js";
import { buildDescriptionFacts } from "./ad-description.facts.js";
import { guardDescription } from "./ad-description.guard.js";

export const SUGGESTION_DEADLINE_MS = Number(
  process.env.AD_DESCRIPTION_SUGGESTION_TIMEOUT_MS || 15_000
);

/** Texto único de falha — o anunciante nunca vê motivo interno. */
const GENERIC_FAILURE =
  "Não foi possível gerar a sugestão agora. Escreva a descrição ou tente de novo em instantes.";

class SuggestionUnavailableError extends AppError {
  constructor(internalReason) {
    super(GENERIC_FAILURE, 503);
    this.internalReason = internalReason;
  }
}

function withDeadline(promise, ms) {
  let timer = null;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("SUGGESTION_DEADLINE")), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * @param {{ id: string|number, role?: string }} user  req.user (já autenticado)
 * @param {object} payload  corpo da requisição
 * @param {{ requestId?: string }} [meta]
 * @returns {Promise<{ text: string, meta: object }>}
 */
export async function generateDescriptionSuggestion(user, payload = {}, meta = {}) {
  const logger = getLogger({ requestId: meta.requestId || null });

  // Posse: só verificável quando existe anúncio de verdade. O wizard de
  // criação guarda o rascunho em localStorage (não há linha no banco), então
  // nesse caminho a autenticação é a única fronteira — por isso o rate limit
  // por usuário é o que segura o custo.
  if (payload?.adId != null && String(payload.adId).trim() !== "") {
    const ownerContext = await adsRepository.findOwnerContextById(String(payload.adId).trim());
    assertAdOwner(user, ownerContext);
  }

  const { facts, selectedKeys, declaredVocabulary, isTooThin } = buildDescriptionFacts(payload);

  if (isTooThin) {
    throw new AppError(
      "Preencha ao menos a marca e o modelo do veículo para gerar uma sugestão.",
      422
    );
  }

  const orchestrator = getSharedAiOrchestrator(logger);

  let result;
  try {
    result = await withDeadline(
      orchestrator.generate({
        task: "ad_description_suggestion",
        input: facts,
        context: {
          userId: String(user.id),
          requestId: meta.requestId || undefined,
          locale: "pt-BR",
          quality: "medium",
          // Ficha de veículo não é dado pessoal, mas o texto é gerado para um
          // usuário específico e não vai a cache (ver AiPolicy.shouldCache).
          pii: false,
        },
      }),
      SUGGESTION_DEADLINE_MS
    );
  } catch (err) {
    const reason = err?.message === "SUGGESTION_DEADLINE" ? "deadline" : "orchestrator_threw";
    logger.warn(
      {
        component: "ads.description_suggestion",
        event: "generate_failed",
        reason,
        error: err?.message || String(err),
        userId: String(user.id),
        requestId: meta.requestId || null,
      },
      "[ads.description_suggestion] falha ao gerar"
    );
    throw new SuggestionUnavailableError(reason);
  }

  const usableProvider = result?.provider && result.provider !== "template";
  const rawOutput = typeof result?.output === "string" ? result.output : "";

  if (!result?.ok || !usableProvider || !rawOutput.trim()) {
    logger.warn(
      {
        component: "ads.description_suggestion",
        event: "generate_unusable",
        provider: result?.provider || null,
        ok: result?.ok ?? null,
        error: result?.error || null,
        userId: String(user.id),
        requestId: meta.requestId || null,
      },
      "[ads.description_suggestion] provedor indisponível ou saída vazia"
    );
    throw new SuggestionUnavailableError("no_usable_provider");
  }

  const guarded = guardDescription(rawOutput, { declaredVocabulary, selectedKeys });

  if (!guarded.ok) {
    logger.warn(
      {
        component: "ads.description_suggestion",
        event: "guard_rejected",
        reason: guarded.reason,
        guardReasons: guarded.reasons || [],
        droppedSentences: guarded.droppedSentences ?? null,
        provider: result.provider,
        model: result.model || null,
        userId: String(user.id),
        requestId: meta.requestId || null,
      },
      "[ads.description_suggestion] guard reprovou a saída"
    );
    throw new SuggestionUnavailableError(`guard:${guarded.reason}`);
  }

  if (guarded.droppedSentences > 0) {
    // Não é erro — é o guard fazendo o trabalho. Vale métrica: se subir muito,
    // o prompt regrediu ou o modelo trocou.
    logger.info(
      {
        component: "ads.description_suggestion",
        event: "guard_dropped_sentences",
        droppedSentences: guarded.droppedSentences,
        guardReasons: guarded.reasons,
        provider: result.provider,
        model: result.model || null,
        requestId: meta.requestId || null,
      },
      "[ads.description_suggestion] frases removidas pelo guard"
    );
  }

  logger.info(
    {
      component: "ads.description_suggestion",
      event: "generate_ok",
      provider: result.provider,
      model: result.model || null,
      latencyMs: result.latencyMs ?? null,
      chars: guarded.text.length,
      optionsUsed: selectedKeys.length,
      userId: String(user.id),
      requestId: meta.requestId || null,
    },
    "[ads.description_suggestion] sugestão gerada"
  );

  return {
    text: guarded.text,
    meta: {
      chars: guarded.text.length,
      optionsUsed: selectedKeys.length,
    },
  };
}

export const __testing = { GENERIC_FAILURE, SuggestionUnavailableError, withDeadline };
