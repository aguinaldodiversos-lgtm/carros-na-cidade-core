/**
 * Vocabulário da AVALIAÇÃO PRESENCIAL e da PROPOSTA FINAL (Fase 4.5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO DELIBERADAMENTE **NÃO** DECLARA
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum vocabulário de CONDIÇÃO de veículo. Nem pneus, nem mecânica, nem
 * lataria, nem estado geral.
 *
 * A ficha que a loja preenche na inspeção usa os MESMOS valores que a pessoa
 * física usou para declarar o carro (`sale-requests.constants.js`, migration
 * 054), e eles são importados de lá — não redeclarados aqui.
 *
 * Uma segunda lista seria a pior coisa que esta fase poderia produzir: o produto
 * inteiro existe para permitir a frase *"o proprietário declarou `good` nos
 * pneus, a loja encontrou `replace_now`"*, e essa frase só é legível se os dois
 * lados falarem a mesma língua. Dois vocabulários divergiriam no dia em que
 * alguém acrescentasse um valor num só lado, e a comparação passaria a mentir
 * sem erro em lugar nenhum.
 *
 * O que existe AQUI é só o que a inspeção acrescenta: o sub-processo de
 * agendamento, os motivos de ajuste de valor, e os códigos de erro.
 */

/**
 * O estado do SUB-PROCESSO de agendamento.
 *
 * Vive em `sale_request_inspections.schedule_status` e **não** é status da
 * solicitação (§5). A distinção é de produto, não de implementação: "a loja
 * ainda não mandou horários" e "mandou, e o proprietário ainda não escolheu" são
 * dois passos de uma mesma pendência — do ponto de vista de quem está vendendo o
 * carro, os dois querem dizer "a visita ainda não foi marcada".
 *
 * Enquanto o estado for `awaiting_slots` ou `awaiting_owner`, a solicitação
 * permanece em `offer_selected`.
 */
export const INSPECTION_SCHEDULE_STATUS = Object.freeze({
  /** Nenhuma rodada enviada, ou a rodada vigente foi recusada pelo proprietário. */
  AWAITING_SLOTS: "awaiting_slots",
  /** Há uma rodada de horários esperando a escolha do proprietário. */
  AWAITING_OWNER: "awaiting_owner",
  /** Um horário foi confirmado. */
  SCHEDULED: "scheduled",
  /** A avaliação aconteceu e a ficha foi registrada. */
  COMPLETED: "completed",
});

export const INSPECTION_SCHEDULE_STATUSES = Object.freeze(
  Object.values(INSPECTION_SCHEDULE_STATUS)
);

/**
 * Quantos horários uma rodada pode conter.
 *
 * O MÍNIMO é 1 porque uma loja pode ter uma única janela livre, e obrigá-la a
 * inventar duas produziria horários que ela não pretende honrar.
 *
 * O MÁXIMO é 3 porque a tela do proprietário é uma escolha, não uma agenda: com
 * oito opções a decisão vira trabalho, e no celular vira rolagem. Três cabe numa
 * tela e cobre "manhã / tarde / outro dia".
 */
export const INSPECTION_SLOTS = Object.freeze({
  MIN: 1,
  MAX: 3,
});

/**
 * Limites de texto.
 *
 * Os dois são 500, o mesmo das notas mecânicas da ficha da 054. O limite existe
 * para manter observação como OBSERVAÇÃO: um campo de 5.000 caracteres viraria
 * carta, e uma carta pede resposta — que é o canal que esta fase decidiu não ter.
 */
export const INSPECTION_LIMITS = Object.freeze({
  NOTES_MAX: 500,
  ADJUSTMENT_NOTE_MAX: 500,
  INTERNAL_NOTE_MAX: 500,
  /** Espelha `SALE_REQUEST_EVALUATION_LIMITS.MONEY_MAX`. */
  MONEY_MAX: 9_999_999.99,
});

/**
 * O tipo da decisão comercial depois de ver o carro.
 *
 * Duas saídas, e só duas. "Talvez", "pendente" e "em análise" não são decisões e
 * não teriam quem as escrevesse — seriam estados sem writer, o erro que as
 * migrations 030, 052 e 055 documentam.
 */
export const POST_INSPECTION_DECISION = Object.freeze({
  FINAL_OFFER: "final_offer",
  NO_OFFER: "no_offer",
});

export const POST_INSPECTION_DECISIONS = Object.freeze(
  Object.values(POST_INSPECTION_DECISION)
);

/**
 * Por que o valor mudou (ou por que não houve proposta).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A LISTA REUTILIZA AS DIMENSÕES DA PRÓPRIA INSPEÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * `mechanical`, `body_paint`, `tires` e `mileage_difference` são exatamente as
 * coisas que a loja acabou de avaliar e registrar na ficha. Usar o mesmo
 * vocabulário permite ligar a justificativa à linha que a sustenta: quem lê
 * "motivo: pneus" consegue olhar a ficha e ver `declarado: good` contra
 * `observado: replace_now`.
 *
 * `documentation` não é dimensão da ficha física, e está aqui porque é um motivo
 * real: a loja confere documento na visita, e a pendência que aparece ali muda o
 * preço. Ela não virou campo da inspeção porque não é algo que se "observa" no
 * pátio como se observa um pneu — é uma verificação de outra natureza.
 *
 * `other` é a escape hatch, e tem preço: exige nota (o CHECK da 058 impõe). Sem
 * texto, "outro" é uma justificativa que não justifica.
 *
 * Espelhado no frontend em `frontend/lib/sale-requests/inspection.ts`.
 */
export const ADJUSTMENT_REASON = Object.freeze({
  MECHANICAL: "mechanical",
  BODY_PAINT: "body_paint",
  TIRES: "tires",
  MILEAGE_DIFFERENCE: "mileage_difference",
  DOCUMENTATION: "documentation",
  OTHER: "other",
});

export const ADJUSTMENT_REASONS = Object.freeze(Object.values(ADJUSTMENT_REASON));

/** Rótulos pt-BR. Espelhados no frontend. */
export const ADJUSTMENT_REASON_LABEL = Object.freeze({
  [ADJUSTMENT_REASON.MECHANICAL]: "Mecânica",
  [ADJUSTMENT_REASON.BODY_PAINT]: "Lataria e pintura",
  [ADJUSTMENT_REASON.TIRES]: "Pneus",
  [ADJUSTMENT_REASON.MILEAGE_DIFFERENCE]: "Quilometragem diferente da informada",
  [ADJUSTMENT_REASON.DOCUMENTATION]: "Documentação",
  [ADJUSTMENT_REASON.OTHER]: "Outro motivo",
});

/**
 * Códigos de erro estáveis desta fase.
 *
 * O frontend discrimina por `code`, nunca por parsing de mensagem — mesmo
 * contrato de `SALE_REQUEST_CODE` e `SALE_OPPORTUNITY_CODE`.
 */
export const INSPECTION_CODE = Object.freeze({
  // ── Agendamento ───────────────────────────────────────────────────────────

  /** Quantidade de horários fora de 1–3, ou lista vazia. */
  INVALID_SLOT_COUNT: "INSPECTION_INVALID_SLOT_COUNT",

  /**
   * Timestamp malformado, sem offset explícito, ou no passado.
   *
   * UM código para os três porque a reação do usuário é a mesma — escolher outro
   * horário no seletor — e porque o campo já viaja com `field` na resposta.
   */
  INVALID_SLOT: "INSPECTION_INVALID_SLOT",

  /** Dois horários iguais na mesma rodada: seriam dois botões idênticos na tela. */
  DUPLICATE_SLOT: "INSPECTION_DUPLICATE_SLOT",

  /**
   * O horário escolhido é de uma rodada JÁ SUBSTITUÍDA (§11).
   *
   * Código próprio porque é o único erro desta tela que se resolve sem sair
   * dela: a loja mandou horários novos enquanto o proprietário olhava os
   * antigos, e recarregar mostra os que valem.
   */
  SLOT_STALE: "INSPECTION_SLOT_STALE",

  /** Já existe horário confirmado — não há reagendamento nesta fase. */
  ALREADY_SCHEDULED: "INSPECTION_ALREADY_SCHEDULED",

  /**
   * A loja não tem endereço comercial cadastrado (§14).
   *
   * Separado de qualquer erro de validação porque a ação do lojista é outra: não
   * há o que corrigir no formulário de horários — há um cadastro a completar, e
   * a mensagem precisa dizer onde.
   */
  STORE_LOCATION_REQUIRED: "INSPECTION_STORE_LOCATION_REQUIRED",

  // ── Estado ────────────────────────────────────────────────────────────────

  /**
   * A solicitação não está no estado que esta ação exige.
   *
   * Cobre "ainda não agendou", "já concluiu", "já decidiu" e "foi cancelada" com
   * o mesmo código: em todos, a tela do usuário está desatualizada e a correção
   * é a mesma — recarregar. A mensagem diferencia; o código não precisa.
   */
  INVALID_STATE: "INSPECTION_INVALID_STATE",

  // ── Inspeção ──────────────────────────────────────────────────────────────

  /** Campo obrigatório da ficha ausente ou fora do vocabulário. */
  INVALID_FIELD: "INSPECTION_INVALID_FIELD",

  // ── Decisão final ─────────────────────────────────────────────────────────

  /** Valor final ausente, não-positivo ou acima do teto de sanidade. */
  INVALID_FINAL_AMOUNT: "INSPECTION_INVALID_FINAL_AMOUNT",

  /**
   * Valor menor que a proposta preliminar sem justificativa (§25).
   *
   * É a proteção que substituiu os pisos removidos. O proprietário não pode
   * receber `R$ 65.000 → R$ 57.000` sem um motivo registrado.
   */
  ADJUSTMENT_REASON_REQUIRED: "INSPECTION_ADJUSTMENT_REASON_REQUIRED",

  /** `other` sem nota: uma justificativa que não justifica. */
  ADJUSTMENT_NOTE_REQUIRED: "INSPECTION_ADJUSTMENT_NOTE_REQUIRED",

  /**
   * Já existe decisão pós-inspeção, e é DIFERENTE da que está sendo enviada.
   *
   * Repetir a MESMA decisão não passa por aqui — é idempotente e devolve 200.
   * Este código é para a tentativa de "corrigir" um valor já apresentado, que
   * esta fase não permite (§30).
   */
  FINAL_DECISION_ALREADY_RECORDED: "INSPECTION_FINAL_DECISION_ALREADY_RECORDED",
});

/**
 * Mensagem pública quando a loja não tem endereço.
 *
 * Diz o que falta e onde resolver. A rota é a REAL (`/dashboard-loja/dados`,
 * verificada na auditoria da fase), e não um caminho inventado — mandar o
 * lojista para uma tela que não existe é pior que não orientar.
 */
export const STORE_LOCATION_REQUIRED_MESSAGE =
  "Cadastre o endereço da sua loja antes de propor horários. Você pode fazer isso em Dados da loja.";

/** Onde o lojista resolve a pendência de endereço. Rota verificada na auditoria. */
export const STORE_LOCATION_ACTION_PATH = "/dashboard-loja/dados";
