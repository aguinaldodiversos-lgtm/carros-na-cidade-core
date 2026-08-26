/**
 * As rotas do painel que entram em MODO FOCO (Fase 4.11A, §4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE É MODO FOCO
 * ════════════════════════════════════════════════════════════════════════════
 * A tela continua sendo do painel — mesma sessão, mesma guarda, mesma URL — mas
 * renderiza SEM a moldura de dashboard: sem menu lateral, sem barra de menu
 * mobile, sem cartão de plano. Sobra o cabeçalho global do site (que vem do
 * layout raiz e nunca esteve dentro do shell) e a largura inteira da janela.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE UM PREDICADO, E NÃO UM GRUPO DE ROTAS
 * ════════════════════════════════════════════════════════════════════════════
 * O caminho idiomático do App Router seria mover a rota para um route group com
 * layout próprio — `(painel)` com o shell, `(foco)` sem. Isso custaria mover
 * TODAS as outras rotas de `/dashboard-loja` (painel, meus anúncios, dados,
 * mensagens, plano, suporte) para dentro do grupo novo, porque um route group
 * aninhado NÃO escapa do layout do segmento que o contém: `layout.tsx` de
 * `/dashboard-loja` continuaria envolvendo os dois grupos.
 *
 * Ou seja: para tirar a barra de UMA tela, seria preciso mexer no arquivo de
 * todas as outras — exatamente o oposto do escopo desta fase.
 *
 * O predicado tem uma propriedade que o rearranjo de diretórios não tem: ele é
 * uma função pura, e o portão do §64 ("sidebar removida somente no detalhe",
 * "sidebar continua nas telas de dashboard") vira uma tabela de casos em vez de
 * uma inspeção de árvore de arquivos.
 *
 * ATENÇÃO: passar neste predicado NÃO prova que a tela renderiza sem barra —
 * prova só que a função responde certo. O que fecha a cadeia é o teste que
 * monta o shell no caminho do detalhe e procura o `<aside>` no DOM.
 */

/** Segmentos de um caminho, sem vazios — tolera barra final e barra dupla. */
function segmentsOf(pathname: string): string[] {
  return String(pathname ?? "")
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter((segment) => segment !== "");
}

/**
 * O detalhe de uma oportunidade de compra do lojista.
 *
 * `/dashboard-loja/oportunidades/veiculos/42` → true
 * `/dashboard-loja/oportunidades/veiculos`    → false  (é a LISTAGEM)
 *
 * A listagem fica de fora de propósito: ela é uma tela de navegação, e o §2
 * desta fase a mantém fora do redesenho. Tirar a barra dela sem redesenhá-la
 * deixaria o lojista sem como sair de uma página que não ganhou saída própria.
 *
 * O `basePath` vem do shell (que já o recebe como prop) em vez de ser literal
 * aqui: o mesmo painel é montado com `/dashboard-loja` hoje e o componente de
 * detalhe aceita outro basePath por parâmetro. Repetir a constante criaria dois
 * lugares onde a rota mora.
 */
export function isOpportunityDetailPath(
  pathname: string | null | undefined,
  basePath: string
): boolean {
  const base = segmentsOf(basePath);
  if (base.length === 0) return false;

  const parts = segmentsOf(pathname ?? "");

  // base + oportunidades + veiculos + <id>. Nada além disso: um segmento a mais
  // é outra tela (uma subpágina futura do detalhe), e ela precisa decidir por si
  // se quer o modo foco.
  if (parts.length !== base.length + 3) return false;

  for (let index = 0; index < base.length; index += 1) {
    if (parts[index] !== base[index]) return false;
  }

  return parts[base.length] === "oportunidades" && parts[base.length + 1] === "veiculos";
}

/**
 * A tela pede o modo foco?
 *
 * Hoje há um caso só. A função existe para que o segundo — quando existir — seja
 * acrescentado aqui, e não espalhado por dentro do shell.
 */
export function isFocusModeRoute(
  pathname: string | null | undefined,
  basePath: string
): boolean {
  return isOpportunityDetailPath(pathname, basePath);
}
