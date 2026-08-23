/**
 * Contrato compartilhado do HANDOFF DIRETO (Fase 4.7).
 *
 * ESPELHO de `src/modules/sale-requests/sale-requests.handoff.constants.js`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE O PAPEL DA PLATAFORMA TERMINA
 * ════════════════════════════════════════════════════════════════════════════
 * No MATCH. O proprietário aceita uma oferta, recebe os dados COMERCIAIS da
 * loja, e a avaliação presencial — com a eventual revisão de valor e a
 * negociação inteira — acontece diretamente entre as duas partes, fora daqui.
 *
 * O Carros na Cidade não avalia veículo, não emite laudo, não agenda visita, não
 * registra proposta final e NÃO ARBITRA.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A OFERTA É COMPROMISSO REAL — E O TEXTO PRECISA SUSTENTAR ISSO
 * ════════════════════════════════════════════════════════════════════════════
 * Nenhum texto daqui pode chamar a oferta de "estimativa", "simulação",
 * "sugestão" ou "sem compromisso". O lojista envia uma oferta porque tem
 * intenção real de comprar pelo valor informado.
 *
 * O que a avaliação presencial faz é CONFIRMAR as informações — não abrir espaço
 * para renegociar por esporte. Se o veículo está como foi descrito, o valor
 * aceito é a referência da negociação; se houver divergência relevante, a loja
 * pode revisar ou desistir, e o proprietário pode aceitar ou não. Fora daqui.
 */

/** O único desfecho que o proprietário informa. Espelha `HANDOFF_OUTCOME`. */
export type HandoffOutcome = "no_agreement";

/** Uma entrada do histórico de matches. Sem ids internos. */
export type SelectionHistoryEntry = {
  store_name: string;
  /** String decimal, como todo dinheiro deste domínio. */
  amount: string;
  selected_at: string;
  round_number: number;
  /** `null` enquanto o match está vivo; `no_agreement` quando foi encerrado. */
  outcome: HandoffOutcome | null;
  outcome_at: string | null;
};

/** A rodada ABERTA. `minimum_accepted_price` é `null` no legado pré-4.3.3. */
export type SaleRequestRound = {
  number: number;
  minimum_accepted_price: string | null;
};

// ────────────────────────────────────────────────────────────────────────────
// OS AVISOS — os textos mais importantes desta fase
// ────────────────────────────────────────────────────────────────────────────
// Constantes compartilhadas, e não literais repetidos por tela: são exatamente
// o tipo de frase que alguém "melhora" num lugar só, e a cópia não melhorada
// continua dizendo outra coisa. Há teste percorrendo o texto renderizado.

/**
 * §5 — o que o proprietário precisa entender ANTES de aceitar.
 *
 * Diz as duas coisas ao mesmo tempo, e a ordem importa: a oferta é uma intenção
 * REAL (não uma estimativa), E ela está sujeita à confirmação das condições.
 * Só a primeira metade faria a pessoa achar que o valor está garantido; só a
 * segunda faria a oferta parecer um chute sem valor.
 */
export const OWNER_OFFER_COMMITMENT_NOTICE =
  "A oferta enviada pelo lojista representa uma intenção real de compra pelo valor informado, com base nas informações e fotos fornecidas por você. O valor aceito está sujeito à confirmação das condições do veículo em avaliação presencial e à conferência da documentação. Caso sejam constatadas divergências relevantes, defeitos não informados ou outras condições diferentes das apresentadas, o lojista poderá revisar o valor ou desistir da compra.";

/** §5 — a contrapartida: aceitar também é um compromisso de quem vende. */
export const OWNER_ACCEPT_CONFIRMATION_NOTICE =
  "Ao aceitar uma oferta, você confirma sua intenção de vender o veículo nas condições informadas no anúncio.";

/** §35 — a versão curta, dentro do diálogo de confirmação. */
export const ACCEPT_DIALOG_NOTICE =
  "A oferta foi feita com base nas informações fornecidas no anúncio. Caso a avaliação presencial identifique divergências relevantes, defeitos não informados ou problemas documentais, a loja poderá revisar o valor ou desistir da compra.";

/** §6 — o que o LOJISTA lê antes de enviar a oferta. */
export const DEALER_OFFER_COMMITMENT_NOTICE =
  "Envie uma oferta somente se houver intenção real de comprar o veículo pelo valor informado, considerando as condições apresentadas pelo proprietário.";

export const DEALER_OFFER_INSPECTION_NOTICE =
  "A avaliação presencial deve confirmar as informações fornecidas. Caso sejam identificadas divergências relevantes, defeitos não informados ou problemas documentais, o valor poderá ser revisto ou a compra poderá ser recusada.";

/** §7 — o que o proprietário lê antes de PUBLICAR. */
export const PUBLISH_ACCURACY_NOTICE =
  "Declare as condições do veículo com precisão. Informações incorretas, problemas relevantes não informados ou divergências identificadas durante a avaliação presencial poderão fazer com que a loja revise ou retire a oferta.";

// ────────────────────────────────────────────────────────────────────────────
// O HANDOFF
// ────────────────────────────────────────────────────────────────────────────

/** §13 — a instrução principal depois do aceite. */
export const HANDOFF_CONTACT_INSTRUCTION =
  "Entre em contato com a loja para combinar a avaliação presencial do veículo.";

/** §13 — quem faz o quê a partir daqui. */
export const HANDOFF_SCOPE_NOTICE =
  "A avaliação, eventual revisão do valor e a negociação da compra são realizadas diretamente entre você e a loja.";

/** §16 — o que a LOJA lê depois de ter a oferta aceita. */
export const DEALER_ACCEPTED_NOTICE =
  "O proprietário recebeu os dados da sua loja para combinar a avaliação presencial.";

export const DEALER_ACCEPTED_SCOPE_NOTICE =
  "A avaliação e eventual negociação passam a acontecer diretamente entre as partes.";

// ────────────────────────────────────────────────────────────────────────────
// "NÃO HOUVE ACORDO"
// ────────────────────────────────────────────────────────────────────────────

/** §17 — o texto do diálogo. Não pergunta motivo, culpa nem valor. */
export const NO_AGREEMENT_DIALOG_NOTICE =
  "Use esta opção somente se a negociação após a avaliação presencial não tiver prosseguido.";

/** §39 — o que uma rodada nova significa para as propostas anteriores. */
export const NEW_ROUND_DIALOG_NOTICE =
  "Uma nova rodada será aberta. As propostas anteriores permanecerão no histórico, mas não participarão automaticamente da nova rodada.";

/**
 * Códigos de erro estáveis. A tela discrimina por `code`, nunca por parsing de
 * mensagem.
 */
export const HANDOFF_CODE = {
  NOT_ACTIVE: "SALE_REQUEST_HANDOFF_NOT_ACTIVE",
  WHATSAPP_UNAVAILABLE: "SALE_REQUEST_STORE_WHATSAPP_UNAVAILABLE",
  ROUND_NOT_ALLOWED: "SALE_REQUEST_ROUND_NOT_ALLOWED",
  LEGACY_RETIRED: "SALE_REQUEST_LEGACY_FLOW_RETIRED",
} as const;
