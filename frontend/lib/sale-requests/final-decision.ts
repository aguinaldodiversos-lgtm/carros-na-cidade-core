/**
 * Contrato compartilhado da DECISÃO DO PROPRIETÁRIO sobre a proposta final
 * (Fase 4.6).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESPELHO de `src/modules/sale-requests/sale-requests.final-decision.constants.js`
 * ────────────────────────────────────────────────────────────────────────────
 * Compartilhado entre as duas telas — a do proprietário e a do lojista — pelo
 * mesmo motivo dos rótulos da ficha declarada: as duas pontas precisam dizer a
 * MESMA coisa sobre a mesma linha do banco. Duas tabelas de rótulos produziriam
 * a pior classe de defeito deste produto — a loja lendo "aceita" e o
 * proprietário lendo outra coisa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE NENHUM TEXTO DAQUI PODE DIZER
 * ────────────────────────────────────────────────────────────────────────────
 * "Venda concluída", "Veículo vendido", "Negócio fechado", "Pagamento
 * realizado", "Compra concluída", "Transferência concluída".
 *
 * `final_offer_accepted` significa UMA coisa: o proprietário aceitou a proposta
 * comercial final. Pagamento, transferência, documentação e entrega não existem
 * neste produto — e uma pessoa que acredita ter vendido para de considerar
 * outras saídas para um carro que ainda tem.
 *
 * Não é só disciplina de redação: há teste percorrendo o texto renderizado à
 * procura dessas frases.
 */

/** A resposta da pessoa. Espelha `OWNER_FINAL_DECISION`. */
export type OwnerFinalDecisionType = "accepted" | "rejected";

/**
 * A decisão como o PROPRIETÁRIO a recebe.
 *
 * Três campos, e nenhum id: `advertiser_id`, `dealer_user_id`,
 * `decided_by_user_id` e o id da própria linha não são devolvidos pela API — a
 * query do repositório nem os seleciona.
 */
export type OwnerFinalDecision = {
  type: OwnerFinalDecisionType;
  /** String decimal, como todo dinheiro deste domínio. */
  final_amount: string;
  decided_at: string;
};

/**
 * A decisão como o LOJISTA a recebe.
 *
 * SEM o valor, e a ausência é deliberada: a loja já o conhece — foi ela que o
 * apresentou, e ele chega no bloco `final_decision`. Duas fontes para o mesmo
 * número na mesma tela é como uma divergência silenciosa nasce.
 */
export type DealerOwnerFinalDecision = {
  type: OwnerFinalDecisionType;
  decided_at: string;
};

/**
 * Rótulos do PROPRIETÁRIO.
 *
 * "Proposta final aceita" descreve exatamente o que aconteceu. Qualquer palavra
 * que sugerisse conclusão descreveria algo que não aconteceu.
 */
export const OWNER_FINAL_DECISION_LABEL: Record<OwnerFinalDecisionType, string> = {
  accepted: "Proposta final aceita",
  rejected: "Proposta final recusada",
};

/**
 * Rótulos do LOJISTA para o mesmo fato.
 *
 * Do lado da loja a recusa é "não aceita" e não "recusada": a segunda soa como
 * um julgamento sobre a loja, e não foi isso que aconteceu — o proprietário
 * simplesmente não seguiu adiante, e não deve nenhuma explicação (§15).
 */
export const DEALER_FINAL_DECISION_LABEL: Record<OwnerFinalDecisionType, string> = {
  accepted: "Proprietário aceitou sua proposta final",
  rejected: "Proposta final não aceita",
};

/**
 * A RESSALVA — o texto mais importante desta fase.
 *
 * Constante compartilhada, e não um literal repetido em cada tela: é
 * exatamente o tipo de frase que alguém "melhora" em um lugar só, e a versão
 * não melhorada continua prometendo o que não existe.
 */
export const OWNER_ACCEPTED_DISCLAIMER =
  "Sua decisão foi registrada. A proposta aceita ainda não representa pagamento, transferência ou venda concluída.";

/** A mesma ressalva, na forma curta que o diálogo de confirmação usa. */
export const ACCEPT_DIALOG_DISCLAIMER =
  "Esta etapa registra sua decisão comercial. Pagamento e transferência do veículo não fazem parte desta confirmação.";

/**
 * O aviso da recusa.
 *
 * Diz a consequência REAL, e nada além dela: a solicitação encerra neste fluxo.
 * Não promete reabertura automática — porque ela não existe (§3) —, e não
 * insinua que a pessoa fez algo errado.
 */
export const REJECT_DIALOG_WARNING =
  "Esta solicitação será encerrada neste fluxo e não voltará automaticamente a receber propostas.";

export const OWNER_REJECTED_TEXT = "Esta solicitação foi encerrada neste fluxo.";

/**
 * Códigos de erro estáveis do endpoint. A tela discrimina por `code`, nunca por
 * parsing de mensagem.
 */
export const OWNER_FINAL_DECISION_CODE = {
  INVALID: "OWNER_FINAL_DECISION_INVALID",
  INVALID_STATE: "OWNER_FINAL_DECISION_INVALID_STATE",
  ALREADY_DECIDED: "OWNER_FINAL_DECISION_ALREADY_DECIDED",
} as const;
