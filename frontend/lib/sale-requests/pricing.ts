/**
 * A faixa recomendada para venda a lojistas (Fase 4.3.3).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É UMA RECOMENDAÇÃO, E NÃO UMA REGRA
 * ────────────────────────────────────────────────────────────────────────────
 * A loja compra para revender. Sobre o valor pago ainda entram preparação,
 * garantia, impostos e a margem que sustenta a operação — um piso colado na
 * FIPE simplesmente não recebe proposta, e o proprietário descobre isso depois
 * de uma semana de silêncio, sem entender por quê.
 *
 * Por isso o número é DITO antes da publicação, e não imposto depois. Nada aqui
 * bloqueia: publicar acima do recomendado é um caminho normal do produto, e
 * quem quer valor de mercado recebe na tela o caminho certo (o anúncio
 * convencional, visível para pessoas físicas também) em vez de uma recusa.
 *
 * O servidor NÃO valida esta faixa. Se validasse, a orientação viraria
 * proibição e a pessoa nem saberia que existe outro produto para o caso dela.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESPELHO DO BACKEND
 * ────────────────────────────────────────────────────────────────────────────
 * `SALE_REQUEST_DEALER_DISCOUNT` vive em
 * `src/modules/sale-requests/sale-requests.constants.js`. Os dois lados
 * precisam do mesmo número — a tela para orientar, o backend para documentar a
 * regra que deliberadamente NÃO aplica — e há teste de sincronia.
 */
export const DEALER_DISCOUNT = 0.15;

/** FIPE × este fator = teto da faixa recomendada. */
export const RECOMMENDED_RATIO = 1 - DEALER_DISCOUNT;

/**
 * Teto recomendado a partir da referência FIPE.
 *
 * `null` quando não há FIPE — e `null` é o único retorno honesto nesse caso.
 * Devolver 0 faria a tela mostrar "Até R$ 0,00" como se fosse orientação, e
 * devolver a própria FIPE inverteria o conselho.
 */
export function recommendedMaxPrice(fipeValue: number | null): number | null {
  if (fipeValue == null || !Number.isFinite(fipeValue) || fipeValue <= 0) return null;
  return Math.round(fipeValue * RECOMMENDED_RATIO * 100) / 100;
}

/**
 * O valor digitado está ACIMA da faixa recomendada?
 *
 * `false` quando falta qualquer um dos dois lados: sem FIPE não há faixa, e sem
 * faixa não existe "acima dela". Um `true` defensivo aqui faria a tela avisar
 * sobre um limite que ela mesma não sabe calcular.
 */
export function isAboveRecommended(
  minimumPrice: number | null,
  fipeValue: number | null
): boolean {
  const max = recommendedMaxPrice(fipeValue);
  if (max == null || minimumPrice == null || !Number.isFinite(minimumPrice)) return false;
  return minimumPrice > max;
}

/**
 * "R$ 75.000,00" (como o provedor FIPE devolve) → 75000.
 *
 * O provedor devolve o valor FORMATADO em pt-BR, não um número. A ordem das
 * substituições importa: o ponto é separador de MILHAR e some; a vírgula é o
 * separador DECIMAL e vira ponto. Fazer o contrário transformaria 75.000,00 em
 * setenta e cinco.
 *
 * `null` para qualquer coisa que não resulte num número positivo — inclusive o
 * "—" que o provedor usa quando não tem o dado. Um `NaN` escapando daqui viraria
 * "R$ NaN" na tela.
 */
export function parseFipePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const digits = String(raw)
    .replace(/[^\d.,-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Número → "R$ 63.750" (sem centavos: é faixa de orientação, não cobrança). */
export function formatRecommended(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
