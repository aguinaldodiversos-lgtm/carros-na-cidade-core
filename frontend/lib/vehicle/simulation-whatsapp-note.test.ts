import { describe, it, expect } from "vitest";
import { buildSimulationWhatsappNote } from "./simulation-whatsapp-note";
import type { SimulationResult } from "@/components/financing/FinancingSimulator";

const SIM: SimulationResult = {
  vehicleValue: 65000,
  downPayment: 20000,
  monthlyRate: 1.29,
  term: 48,
  installment: 890,
};

describe("buildSimulationWhatsappNote", () => {
  it("inclui condições simuladas, preço, URL e aviso — na ordem", () => {
    const note = buildSimulationWhatsappNote({
      sim: SIM,
      vehiclePriceNumeric: 65000,
      shareUrl: "https://carrosnacidade.com/veiculo/chevrolet-onix-lt-2020-atibaia-sp",
    });

    // Condições simuladas: prazo, parcela, entrada e TAXA.
    expect(note).toContain("48x");
    expect(note).toContain("de entrada");
    expect(note).toContain("taxa 1,29% a.m.");
    // Preço do anúncio.
    expect(note).toMatch(/Preço do anúncio: R\$\s?65\.000/);
    // URL do anúncio.
    expect(note).toContain(
      "Anúncio: https://carrosnacidade.com/veiculo/chevrolet-onix-lt-2020-atibaia-sp"
    );
    // Aviso de estimativa.
    expect(note).toContain("Valores estimados, sujeitos a análise de crédito.");

    // Ordem: condições → preço → URL → aviso.
    expect(note.indexOf("48x")).toBeLessThan(note.indexOf("Preço do anúncio"));
    expect(note.indexOf("Preço do anúncio")).toBeLessThan(note.indexOf("Anúncio:"));
    expect(note.indexOf("Anúncio:")).toBeLessThan(note.indexOf("Valores estimados"));
  });

  it("NUNCA promete aprovação de crédito", () => {
    const note = buildSimulationWhatsappNote({
      sim: SIM,
      vehiclePriceNumeric: 65000,
      shareUrl: "https://x/y",
    });
    expect(note).not.toMatch(/aprova|garant|pré-aprovad|credito aprovado|crédito aprovado/i);
  });

  it("omite a URL quando não há shareUrl (sem 'Anúncio:' vazio)", () => {
    const note = buildSimulationWhatsappNote({
      sim: SIM,
      vehiclePriceNumeric: 65000,
      shareUrl: null,
    });
    expect(note).not.toContain("Anúncio:");
    expect(note).toContain("Valores estimados");
  });

  it("sem simulação ainda envia preço + URL + aviso", () => {
    const note = buildSimulationWhatsappNote({
      sim: null,
      vehiclePriceNumeric: 65000,
      shareUrl: "https://x/y",
    });
    expect(note).not.toContain("Simulei");
    expect(note).toMatch(/Preço do anúncio/);
    expect(note).toContain("Anúncio: https://x/y");
    expect(note).toContain("Valores estimados");
  });

  it("omite preço quando ausente/zero", () => {
    const note = buildSimulationWhatsappNote({ sim: SIM, vehiclePriceNumeric: 0, shareUrl: null });
    expect(note).not.toContain("Preço do anúncio");
  });
});
