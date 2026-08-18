/**
 * Vocabulário da ÁREA DO LOJISTA do Produto 2 (Fase 4.3).
 *
 * Arquivo separado de `sale-requests.constants.js` de propósito: aquele descreve
 * o OBJETO (o que uma solicitação de venda é, que valores cada campo aceita) e é
 * consumido pelo formulário do dono. Este descreve a LEITURA COMERCIAL do objeto
 * — ordenação, paginação e códigos de erro que só existem do lado de quem
 * compra.
 *
 * A separação evita que a tela do dono passe a importar vocabulário de disputa,
 * e que uma opção de ordenação nova entre no arquivo que o formulário lê.
 *
 * O vocabulário dos CAMPOS (condição, pneus, laudo, leilão, financiamento) NÃO é
 * redeclarado aqui: os filtros do feed importam as mesmas constantes que o
 * formulário usa e que os CHECKs da migration 054 impõem. Uma segunda lista
 * aceitaria um valor que o banco recusa — ou recusaria um que ele aceita.
 */

/**
 * Ordenações suportadas pelo feed.
 *
 * Cada uma é uma ordem TOTAL: a chave de ordenação seguida de `id DESC` como
 * desempate. Sem o desempate, duas solicitações com o mesmo ano (ou a mesma
 * quilometragem) poderiam trocar de posição entre duas páginas e fazer um card
 * sumir ou aparecer duas vezes.
 *
 * NÃO existe "maior margem", "melhor oportunidade" nem "mais urgente". Todas
 * três dependeriam de um preço de compra que este produto não tem: a
 * solicitação NÃO carrega preço pedido, e a FIPE é referência de mercado, não
 * proposta do vendedor. Uma ordenação assim seria um número inventado no topo
 * da tela — e o lojista tomaria decisão comercial em cima dele.
 */
export const SALE_OPPORTUNITY_SORT = Object.freeze({
  /** Padrão: chegou agora, aparece primeiro. */
  RECENT: "recent",
  OLDEST: "oldest",
  YEAR_DESC: "year_desc",
  MILEAGE_ASC: "mileage_asc",
});

export const SALE_OPPORTUNITY_SORTS = Object.freeze(Object.values(SALE_OPPORTUNITY_SORT));

export const SALE_OPPORTUNITY_DEFAULT_SORT = SALE_OPPORTUNITY_SORT.RECENT;

/**
 * A coluna e a direção de cada ordenação, e o TIPO da chave do cursor.
 *
 * Declarado como mapa (e não montado por `if` na query) porque é o único lugar
 * onde o nome de coluna entra no SQL do feed: qualquer valor fora deste objeto
 * nunca chega a ser interpolado. É allowlist estrutural contra injeção por
 * parâmetro de ordenação, não apenas validação de entrada.
 *
 * `nulls` existe porque `year` e `mileage` são NOT NULL, mas uma ordenação
 * futura sobre coluna nullable (FIPE, por exemplo) precisaria dizer para que
 * lado o NULL vai — e descobrir isso depois, em produção, custa mais do que
 * declarar agora.
 */
export const SALE_OPPORTUNITY_SORT_SPEC = Object.freeze({
  [SALE_OPPORTUNITY_SORT.RECENT]: Object.freeze({
    column: "sr.created_at",
    direction: "DESC",
    keyType: "timestamp",
    nulls: "",
  }),
  [SALE_OPPORTUNITY_SORT.OLDEST]: Object.freeze({
    column: "sr.created_at",
    direction: "ASC",
    keyType: "timestamp",
    nulls: "",
  }),
  [SALE_OPPORTUNITY_SORT.YEAR_DESC]: Object.freeze({
    column: "sr.year",
    direction: "DESC",
    keyType: "integer",
    nulls: "",
  }),
  [SALE_OPPORTUNITY_SORT.MILEAGE_ASC]: Object.freeze({
    column: "sr.mileage",
    direction: "ASC",
    keyType: "integer",
    nulls: "",
  }),
});

/**
 * Paginação do feed. Mesmo formato de `SALE_REQUEST_PAGE`.
 *
 * `DEFAULT_LIMIT` menor que o do dono (12 contra 20) porque cada card do lojista
 * carrega uma FOTO: vinte imagens na primeira tela de um celular é tráfego que
 * ninguém pediu. O grid de desktop (4 colunas) fecha em 3 linhas exatas.
 */
export const SALE_OPPORTUNITY_PAGE = Object.freeze({
  DEFAULT_LIMIT: 12,
  MAX_LIMIT: 48,
});

/**
 * Códigos de erro estáveis desta área.
 *
 * O frontend discrimina por `code`, nunca por parsing de mensagem — mesmo
 * contrato de `SALE_REQUEST_CODE` e de `ad-ownership.js`.
 */
export const SALE_OPPORTUNITY_CODE = Object.freeze({
  INVALID_FILTER: "SALE_OPPORTUNITY_INVALID_FILTER",
  INVALID_AMOUNT: "SALE_OPPORTUNITY_INVALID_AMOUNT",
  INVALID_NOTE: "SALE_OPPORTUNITY_INVALID_NOTE",

  /**
   * A proposta não supera a maior atual.
   *
   * Merece código próprio porque é o ÚNICO erro desta área que o lojista
   * resolve sem sair da tela: basta digitar mais. A resposta carrega junto o
   * valor líder atualizado, e a tela usa os dois para dizer quanto falta —
   * discriminar isso por texto de mensagem quebraria na primeira melhoria de
   * redação.
   */
  OFFER_NOT_LEADING: "SALE_OPPORTUNITY_OFFER_NOT_LEADING",

  /** A solicitação foi cancelada pelo proprietário e não recebe mais propostas. */
  OFFER_CLOSED: "SALE_OPPORTUNITY_OFFER_CLOSED",
  /**
   * A conta é CNPJ, mas não tem loja ATIVA com uma cidade única.
   *
   * Separado de "não encontrado" porque a reação do usuário é outra: aqui não
   * há o que procurar, há uma loja para regularizar.
   */
  STORE_UNRESOLVED: "SALE_OPPORTUNITY_STORE_UNRESOLVED",
});

/**
 * Limites numéricos dos filtros.
 *
 * `MILEAGE_MAX` espelha `SALE_REQUEST_LIMITS.MILEAGE_MAX`: filtrar por um teto
 * que o formulário nunca aceitaria seria oferecer uma faixa vazia por
 * construção.
 */
export const SALE_OPPORTUNITY_FILTER_LIMITS = Object.freeze({
  SLUG_MAX: 120,
});

/**
 * Limites da proposta.
 *
 * `MAX_AMOUNT_CENTS` espelha o teto de `NUMERIC(14,2)` usado na ficha
 * (`SALE_REQUEST_EVALUATION_LIMITS.MONEY_MAX`, R$ 9.999.999,99) em CENTAVOS,
 * porque toda comparação de dinheiro deste módulo acontece em inteiro de
 * centavos — ver `toCents`. Um teto declarado em reais aqui obrigaria a
 * conversão a acontecer em dois lugares.
 *
 * `NOTE_MAX` é 500, o mesmo das notas mecânicas da ficha. O limite existe para
 * manter a observação como OBSERVAÇÃO: um campo de 5.000 caracteres viraria
 * carta, e uma carta pede resposta — que é o canal que esta fase decidiu não
 * ter.
 */
export const SALE_OPPORTUNITY_OFFER_LIMITS = Object.freeze({
  MAX_AMOUNT_CENTS: 999_999_999,
  NOTE_MAX: 500,
});
