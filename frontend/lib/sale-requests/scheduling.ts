/**
 * Os textos do AGENDAMENTO DA AVALIAÇÃO (Fase 4.9B).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE UM ARQUIVO NOVO, E NÃO MAIS LINHAS EM `handoff.ts`
 * ════════════════════════════════════════════════════════════════════════════
 * `handoff.ts` guarda os textos da fase que RETIROU a agenda do produto — várias
 * de suas frases dizem, com todas as letras, que a plataforma "não agenda
 * visita". Encostar os textos da agenda restaurada ao lado deles deixaria o
 * arquivo se contradizendo parágrafo a parágrafo, e a próxima pessoa a lê-lo não
 * teria como saber qual metade ainda vale.
 *
 * Aqui vale uma regra só, e ela é a da 4.9B: o portal VOLTA a agendar, e o
 * WhatsApp continua ao lado como segunda opção.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS CAMINHOS SÃO COMPLEMENTARES (§1)
 * ════════════════════════════════════════════════════════════════════════════
 * Nenhum texto daqui pode sugerir que agendar pelo portal DISPENSA a loja, nem
 * que falar pelo WhatsApp SUBSTITUI o agendamento. A pessoa escolhe por onde
 * prefere combinar, e as duas portas continuam abertas — inclusive depois de o
 * horário estar confirmado.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NENHUM TEXTO DAQUI DIZ
 * ════════════════════════════════════════════════════════════════════════════
 * "Registrar avaliação", "proposta final", "resultado da avaliação". A 4.9B
 * restaurou a AGENDA e nada além dela: o que acontece quando o carro chega na
 * loja continua fora da plataforma, e um texto que prometesse a próxima etapa
 * aqui dentro seria falso.
 */

/** §6 — a frase que apresenta as duas opções, lado a lado. */
export const HANDOFF_TWO_PATHS_NOTICE =
  "Você pode agendar a avaliação pelo portal ou, se preferir, falar diretamente com a loja pelo WhatsApp.";

// ────────────────────────────────────────────────────────────────────────────
// PROPRIETÁRIO
// ────────────────────────────────────────────────────────────────────────────

/**
 * §9 — o estado inicial, quando a loja ainda não ofereceu nada.
 *
 * Diz o que está acontecendo e de quem é a vez. Sem isto, a pessoa que acabou de
 * aceitar uma oferta veria um espaço vazio onde deveria haver uma ação e
 * concluiria que a tela quebrou.
 */
export const OWNER_AWAITING_SLOTS_NOTICE =
  "Aguardando a loja disponibilizar horários para avaliação.";

/** §12 — o mesmo estado, mas depois de o proprietário ter pedido outras opções. */
export const OWNER_AWAITING_NEW_SLOTS_NOTICE = "Aguardando novos horários da loja.";

/** §11 — o título da escolha. */
export const OWNER_CHOOSE_SLOT_TITLE = "Escolha um horário para avaliação";

/**
 * §13 — o lembrete de que o WhatsApp continua valendo DEPOIS do agendamento.
 *
 * É a frase que impede a leitura errada mais provável desta tela: "agendei, então
 * agora é só esperar". Combinar um detalhe da visita — trocar o horário, avisar
 * de um atraso — continua sendo conversa entre duas pessoas.
 */
export const OWNER_SCHEDULED_CONTACT_HINT =
  "Se precisar tratar algum detalhe da avaliação, você também pode falar diretamente com a loja.";

/** §13 — o rótulo do bloco de horário confirmado. */
export const OWNER_SCHEDULED_TITLE = "Avaliação agendada";

/**
 * §8 — a loja sem WhatsApp comercial cadastrado.
 *
 * Discreto de propósito, e nunca um erro: não há nada de errado com a
 * solicitação, e o agendamento pelo portal continua funcionando inteiro. Tratar
 * isto como falha faria a pessoa achar que precisa resolver alguma coisa antes
 * de seguir.
 */
export const WHATSAPP_UNAVAILABLE_NOTICE = "WhatsApp não disponível para esta loja.";

// ────────────────────────────────────────────────────────────────────────────
// LOJISTA
// ────────────────────────────────────────────────────────────────────────────

/** §10 — o convite para propor horários. */
export const DEALER_OFFER_SLOTS_TITLE = "Propor horários para a avaliação";

export const DEALER_OFFER_SLOTS_NOTICE =
  "Envie de 1 a 3 opções de horário. O proprietário escolhe uma delas para levar o veículo até sua loja.";

/** §10 — depois de enviar, enquanto a bola está com o proprietário. */
export const DEALER_AWAITING_OWNER_NOTICE =
  "Horários enviados. Aguardando a escolha do proprietário.";

/** §12 — o proprietário devolveu a bola. */
export const DEALER_SLOTS_REQUESTED_NOTICE =
  "O proprietário não conseguiu nos horários enviados e pediu novas opções.";

/**
 * §14 — o que a loja lê quando o horário está confirmado.
 *
 * Read-only, e termina aqui: nenhuma frase promete "próxima etapa no portal",
 * porque não existe nenhuma. O que vem depois é a avaliação presencial, que
 * acontece na loja e não nesta tela.
 */
export const DEALER_SCHEDULED_NOTICE =
  "O proprietário confirmou este horário para levar o veículo até sua loja.";

export const DEALER_SCHEDULED_TITLE = "Avaliação agendada";
