import type { SimulationResult } from "@/components/financing/FinancingSimulator";

function formatBRL0(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Taxa a.m. em pt-BR com 2 casas (ex.: 1.29 → "1,29"). */
function formatRate(rate: number): string {
  return rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Texto anexado à mensagem de WhatsApp do CTA "Enviar simulação no WhatsApp".
 *
 * Prioridade (mensagem legível, sem texto gigante): condições simuladas
 * (parcela/entrada/taxa) → preço do anúncio → URL do anúncio (o mais útil para o
 * lojista identificar o carro) → aviso de estimativa. NUNCA promete aprovação de
 * crédito. Cada bloco é opcional para não gerar frase vazia.
 */
export function buildSimulationWhatsappNote(input: {
  sim: SimulationResult | null;
  vehiclePriceNumeric?: number | null;
  shareUrl?: string | null;
}): string {
  const { sim, vehiclePriceNumeric, shareUrl } = input;
  const parts: string[] = [];

  if (sim && sim.installment > 0) {
    parts.push(
      `Simulei ${sim.term}x de ${formatBRL0(sim.installment)} com ${formatBRL0(
        sim.downPayment
      )} de entrada (taxa ${formatRate(sim.monthlyRate)}% a.m.).`
    );
  }
  if (vehiclePriceNumeric != null && vehiclePriceNumeric > 0) {
    parts.push(`Preço do anúncio: ${formatBRL0(vehiclePriceNumeric)}.`);
  }
  if (shareUrl && shareUrl.trim()) {
    parts.push(`Anúncio: ${shareUrl.trim()}`);
  }
  parts.push("Valores estimados, sujeitos a análise de crédito.");

  return parts.join(" ");
}
