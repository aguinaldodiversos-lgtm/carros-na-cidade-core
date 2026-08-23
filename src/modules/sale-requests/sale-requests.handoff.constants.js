/**
 * O HANDOFF DIRETO (Fase 4.7).
 *
 * Espelho no frontend: `frontend/lib/sale-requests/handoff.ts`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE O PAPEL DA PLATAFORMA TERMINA
 * ════════════════════════════════════════════════════════════════════════════
 * No MATCH. O proprietário aceita uma oferta, o portal entrega os dados
 * COMERCIAIS da loja escolhida, e a avaliação presencial — com a eventual
 * revisão de valor e a negociação inteira — acontece diretamente entre as duas
 * partes, fora daqui.
 *
 * O Carros na Cidade não avalia veículo, não emite laudo, não agenda visita, não
 * registra proposta final, não intermedeia pagamento e NÃO ARBITRA. Se a
 * negociação não prosperar, a única coisa que o portal quer saber é isto: não
 * prosperou. Sem motivo, sem valor, sem culpa.
 */

/**
 * O único desfecho que o proprietário informa.
 *
 * UM valor, e o CHECK do banco também tem um só. Não é excesso de zelo: é a
 * recusa de criar vocabulário sem writer. `agreed`, `cancelled_by_dealer` e
 * `vehicle_sold_elsewhere` não existem porque o portal não tem como saber
 * nenhum deles — e o sucesso, por decisão de produto, NÃO é perguntado.
 */
export const HANDOFF_OUTCOME = Object.freeze({
  NO_AGREEMENT: "no_agreement",
});

/**
 * Base do link de conversa. Domínio OFICIAL do WhatsApp.
 *
 * O literal é o mesmo que `purchase-intent-offers.constants.js` usa no Produto
 * 1. Duplicado aqui de propósito: importar de lá acoplaria o Produto 2 ao
 * Produto 1 por uma constante de infraestrutura, e a Fase 4.7 tem instrução
 * explícita de não tocar naquele módulo.
 *
 * DÍVIDA REGISTRADA no relatório: os dois literais deveriam subir para
 * `src/shared/` numa fase que possa mexer nos dois produtos.
 *
 * Nada de encurtador, nada de domínio intermediário: um redirecionador no meio
 * veria quem está conversando com quem.
 */
export const WHATSAPP_BASE_URL = "https://wa.me";

/**
 * A mensagem que o PROPRIETÁRIO envia à loja.
 *
 * Curta de propósito: a pessoa vai revisá-la dentro do WhatsApp antes de
 * enviar, e um parágrafo longo é apagado — aí ela manda "oi" e o lojista não
 * sabe de qual carro se trata, que é justamente o que a mensagem existe para
 * resolver.
 *
 * O QUE ELA NÃO CARREGA, e não pode passar a carregar: CPF, e-mail, id interno,
 * id da oferta, id da solicitação. E nem o VALOR — a loja sabe quanto ofereceu,
 * e escrever o número numa mensagem que a pessoa assina transformaria a abertura
 * da conversa numa cobrança.
 *
 * "gostaria de combinar a avaliação presencial" e não "vamos fechar": nada foi
 * fechado. O botão abre uma conversa; o resto é entre as duas partes.
 */
export function buildHandoffMessage(vehicleName) {
  return `Olá! Vim pelo Carros na Cidade. Aceitei a oferta de vocês pelo meu ${vehicleName} e gostaria de combinar a avaliação presencial.`;
}

/**
 * Mensagens públicas.
 *
 * Ficam aqui, e não espalhadas no service, porque são o texto que a pessoa lê
 * quando algo não deu certo — e texto de erro que mora junto do `if` que o
 * dispara é o primeiro a divergir entre dois caminhos que deveriam dizer a
 * mesma coisa.
 */
export const HANDOFF_MESSAGE = Object.freeze({
  NO_SELECTION:
    "Você ainda não aceitou nenhuma oferta para esta solicitação.",
  ALREADY_REPORTED:
    "Você já informou que não houve acordo com esta loja.",
  CANCELLED: "Esta solicitação foi cancelada.",
  LEGACY:
    "Esta solicitação está em um fluxo antigo da plataforma e não aceita esta ação.",
  WHATSAPP_UNAVAILABLE:
    "Esta loja não possui WhatsApp disponível no momento. Use o endereço para procurá-la.",
  ROUND_REQUIRES_FAILED_HANDOFF:
    "Só é possível receber novas ofertas depois de informar que não houve acordo com a loja escolhida.",
});
