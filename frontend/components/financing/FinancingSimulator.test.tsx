// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import FinancingSimulator, {
  DEFAULT_MONTHLY_RATE,
  type SimulationResult,
} from "./FinancingSimulator";

/**
 * Homologação pré-lançamento — GRUPO F (FIN-07 e FIN-08).
 *
 * Motivo de existir: o cálculo da parcela é a única promessa NUMÉRICA que o
 * portal faz ao visitante, e não havia teste nenhum sobre ele. O histórico
 * pesa: a mesma fórmula já esteve triplicada com taxas padrão divergentes
 * (1,29% / 1,45% / 1,99%) — o usuário via parcelas diferentes conforme a tela.
 * A unificação num componente só resolve isso enquanto ninguém reintroduzir a
 * divergência; é isso que este arquivo trava.
 *
 * `calculateMonthlyPayment` é interna ao módulo (não exportada) e NÃO vamos
 * exportá-la só para testar — alterar código de produto está fora do escopo
 * desta homologação. O contrato é lido por onde o produto o expõe de verdade:
 * o callback `onResultChange`, que é a mesma fonte consumida pela página do
 * anúncio para compor a mensagem de WhatsApp.
 *
 * IDs cobertos:
 *   FIN-07  fórmula (Price), arredondamento e valores-limite
 *   FIN-08  entrada 0, entrada máxima permitida e extremos válidos
 */

/** Fórmula de amortização Price — referência independente da implementação. */
function priceEsperado(financiado: number, taxaPct: number, meses: number) {
  if (financiado <= 0 || meses <= 0) return 0;
  const i = taxaPct / 100;
  if (i === 0) return financiado / meses;
  return (financiado * i) / (1 - Math.pow(1 + i, -meses));
}

let ultimo: SimulationResult | null = null;
const onResultChange = vi.fn((r: SimulationResult) => {
  ultimo = r;
});

function montar(props: Parameters<typeof FinancingSimulator>[0] = {}) {
  return render(<FinancingSimulator onResultChange={onResultChange} {...props} />);
}

/** Campo de moeda: o componente formata em BRL, então digitamos só dígitos. */
function digitarEntrada(valor: number) {
  const campo = screen.getByLabelText("Entrada") as HTMLInputElement;
  fireEvent.change(campo, { target: { value: String(valor) } });
}

function escolherPrazo(meses: number) {
  const select = screen.getByLabelText("Prazo") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: String(meses) } });
}

beforeEach(() => {
  ultimo = null;
  onResultChange.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("FIN-07 — a fórmula da parcela", () => {
  it("bate com a Price para o cenário padrão (120k, 20% de entrada, 1,29%, 12x)", () => {
    montar();

    // Entrada padrão = 20% de 120.000 = 24.000 → financiado 96.000.
    const esperado = priceEsperado(96_000, DEFAULT_MONTHLY_RATE, 12);
    expect(ultimo).toMatchObject({ vehicleValue: 120_000, downPayment: 24_000, term: 12 });
    expect(ultimo!.installment).toBeCloseTo(esperado, 6);
  });

  it("a taxa padrão exposta é 1,29% a.m. — a unificação das três taxas continua valendo", () => {
    expect(DEFAULT_MONTHLY_RATE).toBe(1.29);
    montar();
    expect(ultimo!.monthlyRate).toBe(1.29);
  });

  it("os cinco prazos usam a MESMA fórmula (12/24/36/48/60)", () => {
    montar({ initialVehicleValue: 100_000 });

    for (const meses of [12, 24, 36, 48, 60]) {
      escolherPrazo(meses);
      const esperado = priceEsperado(80_000, DEFAULT_MONTHLY_RATE, meses);
      expect(ultimo!.term).toBe(meses);
      expect(ultimo!.installment).toBeCloseTo(esperado, 6);
    }
  });

  it("prazo maior sempre baixa a parcela (monotonicidade — pega sinal invertido)", () => {
    montar({ initialVehicleValue: 100_000 });

    const parcelas: number[] = [];
    for (const meses of [12, 24, 36, 48, 60]) {
      escolherPrazo(meses);
      parcelas.push(ultimo!.installment);
    }

    for (let i = 1; i < parcelas.length; i += 1) {
      expect(parcelas[i]).toBeLessThan(parcelas[i - 1]);
    }
  });

  it("a parcela SEMPRE cobre juros: 12 parcelas somam mais que o financiado", () => {
    montar({ initialVehicleValue: 100_000 });

    expect(ultimo!.installment * 12).toBeGreaterThan(80_000);
  });

  it("o valor exibido em tela é o mesmo do callback (a UI não recalcula por conta própria)", () => {
    montar({ initialVehicleValue: 100_000 });

    const emBRL = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
      .format(ultimo!.installment)
      // O Intl usa NBSP entre "R$" e o número; normalizamos para casar com o DOM.
      .replace(/ /g, " ");

    const textoDaTela = document.body.textContent!.replace(/ /g, " ");
    expect(textoDaTela).toContain(emBRL);
  });
});

describe("FIN-08 — valores-limite", () => {
  it("entrada 0 financia o veículo inteiro", () => {
    montar({ initialVehicleValue: 100_000 });
    digitarEntrada(0);

    expect(ultimo!.downPayment).toBe(0);
    expect(ultimo!.installment).toBeCloseTo(priceEsperado(100_000, DEFAULT_MONTHLY_RATE, 12), 6);
  });

  it("entrada igual ao valor do veículo zera a parcela — não vira NaN nem negativo", () => {
    montar({ initialVehicleValue: 100_000 });
    digitarEntrada(100_000);

    expect(ultimo!.installment).toBe(0);
    expect(Number.isNaN(ultimo!.installment)).toBe(false);
  });

  it("entrada ACIMA do valor do veículo é limitada ao valor (sem financiado negativo)", () => {
    montar({ initialVehicleValue: 100_000 });
    digitarEntrada(250_000);

    expect(ultimo!.downPayment).toBeLessThanOrEqual(100_000);
    expect(ultimo!.installment).toBeGreaterThanOrEqual(0);
  });

  it("valor do veículo acima do teto é limitado a R$ 500.000", () => {
    montar({ initialVehicleValue: 5_000_000 });

    expect(ultimo!.vehicleValue).toBe(500_000);
  });

  it("valor do veículo abaixo do piso é limitado a R$ 5.000", () => {
    montar({ initialVehicleValue: 100 });

    expect(ultimo!.vehicleValue).toBe(5_000);
  });

  it("preço ausente/zero cai no valor padrão de R$ 120.000 (nunca 0 nem NaN)", () => {
    montar({ initialVehicleValue: 0 });

    expect(ultimo!.vehicleValue).toBe(120_000);
    expect(Number.isFinite(ultimo!.installment)).toBe(true);
  });

  it("no modo read-only (preço do anúncio) o campo de valor não é editável", () => {
    montar({ initialVehicleValue: 89_900, valueEditable: false });

    expect(screen.queryByLabelText("Valor do veículo")).toBeNull();
    expect(ultimo!.vehicleValue).toBe(89_900);
  });
});
