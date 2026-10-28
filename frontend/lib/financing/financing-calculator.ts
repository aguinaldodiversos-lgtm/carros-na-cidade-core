/**
 * Simulação comercial do financiamento — Tabela Price.
 *
 * 3,373% NÃO é uma alíquota fixa obrigatória de IOF: é uma provisão
 * conservadora (teto teórico de PF: 0,38% + 365 × 0,0082%).
 * O IOF contratual depende dos valores e prazos de amortização.
 * Não inclui tarifas, seguros ou outros componentes do CET.
 */
export const DEFAULT_MONTHLY_RATE = 1.8;
export const FINANCING_PROVISION_PCT = 3.373;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateFinancingAmounts(vehicleValue: number, downPayment: number) {
  const financedBase = Math.max(vehicleValue - downPayment, 0);
  const additionalProvision = roundMoney((financedBase * FINANCING_PROVISION_PCT) / 100);
  return {
    financedBase,
    additionalProvision,
    financedWithProvision: roundMoney(financedBase + additionalProvision),
  };
}

/** Parcela mensal Price, com arredondamento monetário para valores exibidos. */
export function calculateMonthlyPayment(
  financedAmount: number,
  monthlyRatePct: number,
  months: number
): number {
  if (!Number.isFinite(financedAmount) || !Number.isFinite(monthlyRatePct)) return 0;
  if (!Number.isFinite(months) || financedAmount <= 0 || months <= 0 || monthlyRatePct < 0)
    return 0;

  const monthlyRate = monthlyRatePct / 100;
  if (monthlyRate === 0) return roundMoney(financedAmount / months);
  return roundMoney((financedAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));
}
