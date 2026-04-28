/**
 * Cálculo de parcela (tabela Price): PV * i / (1 - (1+i)^(-n))
 * PV = valor financiado; i = taxa mensal em decimal; n = parcelas.
 */
export function computeMonthlyInstallment(
  financedAmount: number,
  monthlyRatePercent: number,
  months: number
): number {
  if (financedAmount <= 0 || months <= 0) return 0;
  const i = monthlyRatePercent / 100;
  if (i === 0) return financedAmount / months;
  return (financedAmount * i) / (1 - Math.pow(1 + i, -months));
}

export function computeTotalPaid(
  monthlyPayment: number,
  months: number,
  downPayment: number
): number {
  return monthlyPayment * months + downPayment;
}

export const FINANCING_TERM_OPTIONS = [12, 24, 36, 48, 60] as const;
export type FinancingTerm = (typeof FINANCING_TERM_OPTIONS)[number];
