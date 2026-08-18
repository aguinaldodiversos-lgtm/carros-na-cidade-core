/**
 * "Esta loja está operacional?" — o predicado SQL, num lugar só.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ELE SAIU DE `purchase-intents.repository.js`
 * ────────────────────────────────────────────────────────────────────────────
 * A expressão nasceu ali porque o Produto 1 foi o primeiro a precisar dela. A
 * partir da Fase 4.3 o Produto 2 também precisa: a mesma pergunta ("esta conta
 * tem loja no ar?") decide quem enxerga solicitações de venda e quem pode fazer
 * proposta.
 *
 * Mantê-la num módulo de procuras obrigaria o domínio de venda a importar o
 * repositório do outro produto — ou, pior, a escrever a própria cópia. O comentário
 * original já avisava do risco: duas versões da mesma regra de moderação, e a
 * que ficasse para trás numa correção seria justamente a que decide quem fica
 * no ar.
 *
 * `purchase-intents.repository.js` REEXPORTA os dois símbolos, então os sete
 * call sites do Produto 1 e o teste de integração que importa
 * `ADVERTISER_IS_OPERATIONAL` continuam valendo sem alteração.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA (inalterada)
 * ────────────────────────────────────────────────────────────────────────────
 * `COALESCE(NULLIF(BTRIM(status), ''), 'active') = 'active'`
 *
 * NULL e string vazia contam como ATIVO: `advertisers.status` foi adicionada
 * depois da tabela, e tratar a ausência como bloqueio derrubaria lojistas
 * legítimos cuja linha é anterior à coluna — um estrago maior que o problema
 * que esta regra corrige. `suspended` e `blocked` são estados EXPLÍCITOS,
 * sempre escritos por uma ação de moderação.
 *
 * Mesmo formato de `public-dealer.service.js`, que já usa
 * `COALESCE(adv.status, 'active') = 'active'`.
 *
 * O predicado é MONTADO por função porque cada consulta tem a sua numeração de
 * parâmetro e o seu alias de tabela.
 *
 * @param {{ alias?: string, param?: number }} [options]
 * @returns {string} fragmento SQL — o parâmetro `$n` recebe `ADVERTISER_STATUS.ACTIVE`
 */
export function advertiserIsOperational({ alias = "adv", param = 2 } = {}) {
  return `COALESCE(NULLIF(BTRIM(${alias}.status), ''), 'active') = $${param}`;
}

/** Forma pré-montada com os defaults (`adv`, `$2`). */
export const ADVERTISER_IS_OPERATIONAL = advertiserIsOperational();
