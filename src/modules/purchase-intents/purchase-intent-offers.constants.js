// Constantes do envio de veículos (Fase 3).
// Espelho no frontend: frontend/lib/purchase-intents/offers.ts — manter em sincronia.
//
// Este módulo NÃO redefine taxonomia de veículo nem status de anúncio. Câmbio e
// carroceria vêm dos normalizadores de `ads`; status de anúncio vem de
// `shared/constants/status.js`. Uma segunda lista aqui divergiria da primeira no
// dia em que alguém adicionasse um valor num lado só.

/**
 * Teto de veículos DISPONÍVEIS que um lojista pode ter numa mesma procura.
 *
 * É limite de PRODUTO (anti-spam), não de plano. Nenhum plano compra vagas
 * extras nesta fase — ver o relatório da fase. O objetivo é que a área do
 * comprador não vire a vitrine de uma loja só: com 3 por lojista, cinco lojas
 * da cidade ainda cabem na tela, e o comprador continua tendo escolha real.
 *
 * "Disponíveis" é a palavra que importa: um veículo que depois foi vendido ou
 * pausado deixa de ocupar vaga (ver `countAvailableOffersByDealer`). A relação
 * continua no histórico do comprador — o que some é a ocupação, não o registro.
 */
export const PURCHASE_INTENT_OFFER_MAX_PER_DEALER = 3;

/**
 * Teto de anúncios varridos ao montar a lista de compatíveis.
 *
 * O casamento de marca/modelo comercial acontece em JS (a descrição FIPE em
 * `ads.model` não é comparável em SQL — ver `purchase-intent-offers.matching.js`),
 * então o estoque ATIVO do lojista é lido e filtrado na aplicação. O teto existe
 * para que uma loja com estoque anormalmente grande não transforme a abertura da
 * tela numa varredura sem fim.
 *
 * Quando o corte acontece, o service LOGA — um truncamento silencioso faria a
 * lista parecer "o estoque compatível inteiro" quando não é.
 */
export const PURCHASE_INTENT_OFFER_SCAN_LIMIT = 500;

/**
 * Relação do preço do anúncio com o orçamento da procura.
 *
 * Só classifica, nunca esconde. Em `specific_model` os dois valores são
 * enviáveis: quem procura um HR-V automático até R$ 100.000 quer saber que
 * existe um por R$ 103.900 na loja da esquina. Em `open_category` o orçamento é
 * rígido no matching, então na prática só `within_budget` aparece.
 */
export const BUDGET_RELATION = Object.freeze({
  WITHIN: "within_budget",
  ABOVE: "above_budget",
});

/**
 * Códigos de domínio devolvidos ao cliente.
 *
 * Existem para que o frontend possa reagir ao caso específico (o limite tem
 * texto próprio na tela) sem depender da mensagem em pt-BR, que muda.
 */
export const PURCHASE_INTENT_OFFER_CODE = Object.freeze({
  LIMIT_REACHED: "PURCHASE_INTENT_OFFER_LIMIT_REACHED",
  AD_NOT_ELIGIBLE: "PURCHASE_INTENT_OFFER_AD_NOT_ELIGIBLE",
  AD_NOT_ACTIVE: "PURCHASE_INTENT_OFFER_AD_NOT_ACTIVE",
  INVALID_AD: "PURCHASE_INTENT_OFFER_INVALID_AD",

  // --- Fase 3.1 — contato por WhatsApp -------------------------------------

  /**
   * O veículo deixou de estar disponível entre o carregamento da tela e o
   * clique: anúncio fora de `active` OU loja não operacional.
   *
   * Os DOIS casos compartilham este código de propósito. Distinguir "o anúncio
   * foi pausado" de "a loja foi bloqueada" contaria ao comprador uma decisão de
   * moderação que não é da conta dele — e para ele o efeito é idêntico: não dá
   * para visitar este carro.
   */
  OFFER_UNAVAILABLE: "PURCHASE_INTENT_OFFER_UNAVAILABLE",

  /**
   * Tudo válido (procura, oferta, anúncio ativo, loja operacional), mas a loja
   * não tem um número de WhatsApp utilizável.
   *
   * É estado de DADO, não erro de servidor: a loja simplesmente não preencheu o
   * campo, ou preencheu algo que não é um celular brasileiro completo. Devolver
   * 500 aqui faria parecer defeito do portal e mandaria alguém procurar bug.
   */
  DEALER_WHATSAPP_UNAVAILABLE: "DEALER_WHATSAPP_UNAVAILABLE",
});

/**
 * Base do link de conversa. Domínio OFICIAL do WhatsApp.
 *
 * Mesma base que `buildVehicleWhatsappHref` usa no anúncio público — o produto
 * já fala com o WhatsApp por aqui. Nada de encurtador, nada de domínio
 * intermediário: um redirecionador no meio veria quem está conversando com quem.
 */
export const WHATSAPP_BASE_URL = "https://wa.me";

/**
 * Texto da mensagem pré-preenchida.
 *
 * Curta de propósito. O comprador vai REVISAR isso dentro do WhatsApp antes de
 * enviar, e um parágrafo longo é apagado — aí ele manda "oi" e o lojista não
 * sabe de qual carro se trata, que é justamente o que a mensagem existe para
 * resolver.
 *
 * "gostaria de agendar uma visita" e não "agendei": nada foi agendado. O botão
 * abre uma conversa; quem combina dia e hora são as duas pessoas.
 */
export function buildVisitMessage(vehicleName) {
  return `Olá! Recebi pelo Carros na Cidade a opção do ${vehicleName} e gostaria de agendar uma visita para conhecer o veículo.`;
}
