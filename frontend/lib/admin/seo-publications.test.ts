import { describe, expect, it } from "vitest";
import {
  sortPublicationsById,
  nextIndexableValue,
  applyIndexableUpdate,
} from "./seo-publications";
import type { SeoPublicationRow } from "./api";

function row(id: number, is_indexable: boolean, updated_at = "2026-01-01T00:00:00Z"): SeoPublicationRow {
  return {
    id,
    path: `/carros-em/cidade-${id}-sp`,
    title: `Pub ${id}`,
    is_indexable,
    status: "published",
    updated_at,
  } as unknown as SeoPublicationRow;
}

describe("nextIndexableValue — payload do toggle", () => {
  it("linha INDEX (true) → alvo false (Noindex)", () => {
    expect(nextIndexableValue(row(3, true))).toBe(false);
  });

  it("linha NOINDEX (false) → alvo true (Indexar)", () => {
    expect(nextIndexableValue(row(3, false))).toBe(true);
  });
});

describe("sortPublicationsById — ordenação estável (anti-pulo)", () => {
  it("ordena por id ascendente independente do updated_at", () => {
    // Simula o retorno do backend ordenado por updated_at DESC: a linha #3
    // recém-modificada viria primeiro. O sort estável a recoloca por id.
    const backendOrder = [
      row(3, false, "2026-05-27T10:00:00Z"), // recém-noindex → topo no backend
      row(1, true, "2026-05-01T00:00:00Z"),
      row(4, true, "2026-05-02T00:00:00Z"),
      row(2, true, "2026-05-03T00:00:00Z"),
    ];
    const sorted = sortPublicationsById(backendOrder);
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });

  it("não muta o array original", () => {
    const original = [row(2, true), row(1, true)];
    const sorted = sortPublicationsById(original);
    expect(original.map((r) => r.id)).toEqual([2, 1]);
    expect(sorted.map((r) => r.id)).toEqual([1, 2]);
  });

  it("posição da linha #3 não muda após marcar noindex (regressão do bug Fase 3.1)", () => {
    const before = sortPublicationsById([row(1, true), row(2, true), row(3, true), row(4, true)]);
    const idxBefore = before.findIndex((r) => r.id === 3);
    // Aplica noindex em #3 e reordena
    const after = sortPublicationsById(applyIndexableUpdate(before, 3, false));
    const idxAfter = after.findIndex((r) => r.id === 3);
    expect(idxAfter).toBe(idxBefore); // mesma posição → operador não erra o alvo
  });
});

describe("applyIndexableUpdate — update otimista por id", () => {
  it("altera somente a linha alvo", () => {
    const rows = [row(1, true), row(2, true), row(3, true), row(4, true)];
    const next = applyIndexableUpdate(rows, 3, false);
    expect(next.find((r) => r.id === 3)?.is_indexable).toBe(false);
    expect(next.find((r) => r.id === 1)?.is_indexable).toBe(true);
    expect(next.find((r) => r.id === 2)?.is_indexable).toBe(true);
    expect(next.find((r) => r.id === 4)?.is_indexable).toBe(true);
  });

  it("revert: #3 volta para indexável sem afetar vizinhos", () => {
    let rows = [row(1, true), row(2, true), row(3, true), row(4, true)];
    rows = applyIndexableUpdate(rows, 3, false); // noindex
    rows = applyIndexableUpdate(rows, 3, true); // revert
    expect(rows.find((r) => r.id === 3)?.is_indexable).toBe(true);
    expect(rows.filter((r) => r.is_indexable).length).toBe(4);
  });

  it("preserva ordem do array", () => {
    const rows = [row(1, true), row(2, true), row(3, true)];
    const next = applyIndexableUpdate(rows, 2, false);
    expect(next.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("no-op se id não existe", () => {
    const rows = [row(1, true), row(2, true)];
    const next = applyIndexableUpdate(rows, 99, false);
    expect(next).toEqual(rows);
  });
});

describe("fluxo end-to-end simulado (sem render)", () => {
  it("noindex #3 → payload false; revert #3 → payload true; só #3 muda", () => {
    const rows = [row(1, true), row(2, true), row(3, true), row(4, true)];

    // 1. operador clica em #3 (INDEX) → Noindex
    const r3 = rows.find((r) => r.id === 3)!;
    const target1 = nextIndexableValue(r3);
    expect(target1).toBe(false);
    const afterNoindex = applyIndexableUpdate(rows, r3.id, target1);

    // 2. revert: operador clica em #3 (agora NOINDEX) → Indexar.
    // Sort estável garante que #3 está na MESMA posição.
    const sorted = sortPublicationsById(afterNoindex);
    const r3b = sorted.find((r) => r.id === 3)!;
    expect(r3b.is_indexable).toBe(false);
    const target2 = nextIndexableValue(r3b);
    expect(target2).toBe(true);
    const afterRevert = applyIndexableUpdate(sorted, r3b.id, target2);

    // Estado final: todas indexáveis, #2 e #4 nunca foram tocadas
    expect(afterRevert.find((r) => r.id === 3)?.is_indexable).toBe(true);
    expect(afterRevert.find((r) => r.id === 2)?.is_indexable).toBe(true);
    expect(afterRevert.find((r) => r.id === 4)?.is_indexable).toBe(true);
  });
});
