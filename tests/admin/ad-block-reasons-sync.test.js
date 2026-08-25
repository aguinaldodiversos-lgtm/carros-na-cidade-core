import { describe, it, expect } from "vitest";
import * as backend from "../../src/shared/moderation/ad-block-reasons.js";
import * as frontend from "../../frontend/lib/moderation/ad-block-reasons.ts";

/**
 * Guarda de sincronia do catálogo de motivos de bloqueio (Fase 4.10A).
 *
 * O backend valida o `reason_code` recebido; o frontend monta o select do
 * modal. Se os dois divergirem, o admin escolhe um motivo que o backend
 * recusa (400 sem explicação) ou deixa de ver um motivo que existe. Pior:
 * uma divergência nos `ownerLabel` faria o anunciante ler um texto diferente
 * do que a plataforma decidiu mostrar.
 */
describe("motivos de bloqueio — sincronia backend ↔ frontend", () => {
  it("mesmo conjunto de códigos, na mesma ordem", () => {
    expect([...frontend.AD_BLOCK_REASON_CODES]).toEqual([...backend.AD_BLOCK_REASON_CODES]);
  });

  it("mesmos rótulos de admin e de anunciante para cada código", () => {
    const backendByCode = new Map(backend.AD_BLOCK_REASONS.map((r) => [r.code, r]));

    for (const f of frontend.AD_BLOCK_REASONS) {
      const b = backendByCode.get(f.code);
      expect(b, `código ausente no backend: ${f.code}`).toBeTruthy();
      expect(f.adminLabel, `adminLabel divergente em ${f.code}`).toBe(b.adminLabel);
      expect(f.ownerLabel, `ownerLabel divergente em ${f.code}`).toBe(b.ownerLabel);
    }
  });

  it("mesma regra de descrição obrigatória", () => {
    expect([...frontend.AD_BLOCK_REASON_REQUIRES_NOTE]).toEqual([
      ...backend.AD_BLOCK_REASON_REQUIRES_NOTE,
    ]);
    expect(frontend.requiresNote("other")).toBe(backend.requiresNote("other"));
    expect(frontend.requiresNote("suspected_fraud")).toBe(backend.requiresNote("suspected_fraud"));
  });

  it("mesmos limites de tamanho da observação", () => {
    expect(frontend.AD_BLOCK_NOTE_MAX_LENGTH).toBe(backend.AD_BLOCK_NOTE_MAX_LENGTH);
    expect(frontend.AD_BLOCK_NOTE_MIN_LENGTH).toBe(backend.AD_BLOCK_NOTE_MIN_LENGTH);
  });

  it("os oito motivos da especificação estão presentes", () => {
    expect([...backend.AD_BLOCK_REASON_CODES]).toEqual([
      "incorrect_information",
      "suspected_fraud",
      "vehicle_unavailable",
      "misleading_price_or_condition",
      "invalid_photos",
      "duplicate_ad",
      "terms_violation",
      "other",
    ]);
  });
});

describe("rótulo destinado ao anunciante", () => {
  it("nunca devolve o código cru", () => {
    for (const code of backend.AD_BLOCK_REASON_CODES) {
      expect(backend.ownerLabelForReasonCode(code)).not.toBe(code);
    }
  });

  it("um código desconhecido cai em texto genérico, não em erro nem em vazamento", () => {
    expect(backend.ownerLabelForReasonCode("codigo_inexistente")).toMatch(/em revisão/i);
    expect(backend.ownerLabelForReasonCode(null)).toMatch(/em revisão/i);
    expect(backend.ownerLabelForReasonCode(undefined)).toMatch(/em revisão/i);
  });

  it("suspeita de fraude NÃO é imputada ao anunciante", () => {
    // O admin registra "Possível fraude"; o dono lê que há algo a verificar.
    // Exibir a hipótese crua seria acusar antes de apurar.
    expect(backend.adminLabelForReasonCode("suspected_fraud")).toMatch(/fraude/i);
    expect(backend.ownerLabelForReasonCode("suspected_fraud")).not.toMatch(/fraude/i);
  });
});
