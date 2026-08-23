/**
 * Vocabulário e códigos da DECISÃO DO PROPRIETÁRIO sobre a proposta final
 * (Fase 4.6).
 *
 * Espelho no frontend: `frontend/lib/sale-requests/final-decision.ts`.
 *
 * Arquivo próprio, e não mais um bloco em `sale-requests.inspection.constants`,
 * pela mesma razão que a 4.5 não virou um bloco da 4.4: os dois lados da
 * fronteira são pessoas diferentes fazendo coisas diferentes. Ali quem age é a
 * LOJA (agendar, inspecionar, propor); aqui quem age é o PROPRIETÁRIO, e o
 * único verbo é responder.
 */

/**
 * A resposta da pessoa. DUAS, e cada uma com um writer real na transação de
 * `decideFinalOffer`.
 *
 * Não existe `pending`, `expired` nem `withdrawn`. `pending` seria a ausência de
 * linha (a trilha é append-only e só nasce quando alguém decide), e os outros
 * dois exigiriam um cronômetro que esta fase não tem — criar o valor antes do
 * caminho que o grava é o erro que a migration 030 documenta em `ads.status`.
 */
export const OWNER_FINAL_DECISION = Object.freeze({
  ACCEPTED: "accepted",
  REJECTED: "rejected",
});

export const OWNER_FINAL_DECISIONS = Object.freeze(Object.values(OWNER_FINAL_DECISION));

/**
 * Códigos de erro estáveis. O frontend discrimina por `code`, nunca por parsing
 * de mensagem — mesmo contrato do resto do domínio.
 */
export const OWNER_FINAL_DECISION_CODE = Object.freeze({
  /**
   * `decision` ausente ou fora de `accepted`/`rejected`.
   *
   * É 400 e não 409: o corpo está malformado, e nenhum estado do servidor faria
   * ele passar. Um `decision: "talvez"` não vira certo com um reload.
   */
  INVALID_DECISION: "OWNER_FINAL_DECISION_INVALID",

  /**
   * A solicitação não está em `final_offer_submitted`.
   *
   * Cobre com o mesmo código quatro situações que compartilham a MESMA correção
   * pelo lado de quem clicou — recarregar a tela:
   *
   *   - ainda em disputa, ou em avaliação: não há proposta final;
   *   - `inspection_completed`: a loja avaliou e ainda não apresentou valor;
   *   - `final_offer_declined`: a loja encerrou SEM proposta, e não existe nada
   *     para aceitar ou recusar (§13);
   *   - cancelada.
   *
   * A MENSAGEM diferencia cada caso, porque a pessoa precisa entender o que
   * aconteceu. O código não precisa: a tela faz a mesma coisa nos quatro.
   */
  INVALID_STATE: "OWNER_FINAL_DECISION_INVALID_STATE",

  /**
   * Já existe decisão nesta solicitação, e é a OUTRA (§16).
   *
   * Repetir a MESMA decisão não passa por aqui — é idempotente e devolve 200
   * com `changed: false`. Este código é para quem aceitou e agora tenta recusar
   * (ou o inverso), e a resposta é 409 porque a intenção mudou: não é um retry
   * de rede, é uma segunda decisão sobre algo que só admite uma.
   *
   * Não existe "desfazer" nesta fase, e o 409 é o que diz isso em voz alta em
   * vez de deixar a tela supor.
   */
  ALREADY_DECIDED: "OWNER_FINAL_DECISION_ALREADY_DECIDED",
});

/**
 * Mensagens públicas por estado de origem.
 *
 * Ficam aqui, e não espalhadas no service, porque são o texto que a pessoa lê
 * quando algo não deu certo — e texto de erro que mora junto do `if` que o
 * dispara é o primeiro a divergir entre dois caminhos que deveriam dizer a
 * mesma coisa.
 */
export const OWNER_FINAL_DECISION_MESSAGE = Object.freeze({
  NO_FINAL_OFFER:
    "Esta solicitação ainda não tem uma proposta final para aceitar ou recusar.",
  /** `final_offer_declined`: a loja encerrou sem propor. Não há o que responder. */
  DECLINED_BY_STORE:
    "A loja encerrou a avaliação sem apresentar proposta final, então não há proposta para responder.",
  CANCELLED: "Esta solicitação foi cancelada.",
  ALREADY_DECIDED:
    "Você já respondeu a esta proposta final, e a resposta não pode ser alterada.",
  INVALID_DECISION: "Escolha aceitar ou recusar a proposta final.",
});
