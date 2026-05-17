import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findLatestAuditReport,
  loadAuditReport,
  parseCleanupArgs,
  selectArchivalCandidates,
  writeCleanupReport,
} from "../../scripts/cleanup/lib/cleanup-shared.mjs";

describe("parseCleanupArgs — defaults seguros", () => {
  it("sem flags → execute=false, yes=false, willWrite=false", () => {
    const args = parseCleanupArgs([]);
    expect(args.execute).toBe(false);
    expect(args.yes).toBe(false);
    expect(args.willWrite).toBe(false);
    expect(args.status).toBe("archived_test");
  });

  it("--execute SEM --yes → willWrite=false (dupla confirmação)", () => {
    const args = parseCleanupArgs(["--execute"]);
    expect(args.execute).toBe(true);
    expect(args.yes).toBe(false);
    expect(args.willWrite).toBe(false);
  });

  it("--yes SEM --execute → willWrite=false", () => {
    const args = parseCleanupArgs(["--yes"]);
    expect(args.execute).toBe(false);
    expect(args.yes).toBe(true);
    expect(args.willWrite).toBe(false);
  });

  it("--execute --yes → willWrite=true (única combinação que escreve)", () => {
    const args = parseCleanupArgs(["--execute", "--yes"]);
    expect(args.willWrite).toBe(true);
  });

  it("--dry-run força execute=false mesmo se algo lê depois", () => {
    const args = parseCleanupArgs(["--dry-run"]);
    expect(args.execute).toBe(false);
  });

  it("--status=foo customiza target", () => {
    expect(parseCleanupArgs(["--status=archived"]).status).toBe("archived");
  });

  it("--audit-file=PATH resolve absoluto", () => {
    const args = parseCleanupArgs(["--audit-file=./reports/audit/foo.json"]);
    expect(args.auditFile).toMatch(/foo\.json$/);
    expect(args.auditFile.startsWith("/") || /^[A-Z]:\\/.test(args.auditFile)).toBe(true);
  });

  it("--min-remaining=5 ajusta threshold de alerta", () => {
    expect(parseCleanupArgs(["--min-remaining=5"]).minRemainingActive).toBe(5);
  });
});

describe("selectArchivalCandidates — contrato HIGH-only", () => {
  it("seleciona apenas test_ad_suspect + confidence=high", () => {
    const findings = [
      { kind: "test_ad_suspect", confidence: "high", id: 1 },
      { kind: "test_ad_suspect", confidence: "high", id: 2 },
      { kind: "test_ad_suspect", confidence: "medium", id: 3 },
      { kind: "test_ad_suspect", confidence: "low", id: 4 },
      { kind: "slug_bad", severity: "critical", id: 5 },
      { kind: "slug_duplicate", slug: "x", duplicates: 3 },
    ];
    const result = selectArchivalCandidates(findings);
    expect(result.map((f) => f.id)).toEqual([1, 2]);
  });

  it("findings null/undefined → array vazio (não joga)", () => {
    expect(selectArchivalCandidates(null)).toEqual([]);
    expect(selectArchivalCandidates(undefined)).toEqual([]);
    expect(selectArchivalCandidates([])).toEqual([]);
  });

  it("ignora findings sem id numérico", () => {
    const findings = [
      { kind: "test_ad_suspect", confidence: "high", id: 1 },
      { kind: "test_ad_suspect", confidence: "high", id: "abc" },
      { kind: "test_ad_suspect", confidence: "high", id: null },
      { kind: "test_ad_suspect", confidence: "high" },
      { kind: "test_ad_suspect", confidence: "high", id: 2 },
    ];
    expect(selectArchivalCandidates(findings).map((f) => f.id)).toEqual([1, 2]);
  });

  it("ignora medium/low MESMO quando título parece teste (decisão humana)", () => {
    const findings = [
      { kind: "test_ad_suspect", confidence: "medium", id: 1, title: "Teste real" },
      { kind: "test_ad_suspect", confidence: "low", id: 2, title: "Civic" },
    ];
    expect(selectArchivalCandidates(findings)).toEqual([]);
  });
});

describe("findLatestAuditReport — busca por timestamp", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-test-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("retorna null quando dir não existe", () => {
    expect(findLatestAuditReport("/nope/never/exists", "ads-quality")).toBeNull();
  });

  it("retorna null sem arquivos casando", () => {
    writeFileSync(join(dir, "other-report.json"), "{}");
    expect(findLatestAuditReport(dir, "ads-quality")).toBeNull();
  });

  it("escolhe o arquivo mais recente (timestamp ISO no nome ordena lexicograficamente)", () => {
    writeFileSync(join(dir, "ads-quality-2026-05-15T00-00-00-000Z.json"), "{}");
    writeFileSync(join(dir, "ads-quality-2026-05-16T03-09-50-852Z.json"), "{}");
    writeFileSync(join(dir, "ads-quality-2026-05-14T12-00-00-000Z.json"), "{}");
    const latest = findLatestAuditReport(dir, "ads-quality");
    expect(latest).toMatch(/2026-05-16T03-09-50-852Z\.json$/);
  });

  it("não confunde com outros prefixos (city-integrity, image-integrity)", () => {
    writeFileSync(join(dir, "ads-quality-2026-05-16T00-00-00-000Z.json"), "{}");
    writeFileSync(join(dir, "city-integrity-2026-05-17T00-00-00-000Z.json"), "{}");
    const latest = findLatestAuditReport(dir, "ads-quality");
    expect(latest).toMatch(/ads-quality/);
  });
});

describe("loadAuditReport — validação de shape", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-load-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("erro quando arquivo não existe", () => {
    expect(() => loadAuditReport(join(dir, "missing.json"))).toThrow(/não encontrado/);
  });

  it("erro quando findings não é array", () => {
    const file = join(dir, "bad.json");
    writeFileSync(file, JSON.stringify({ findings: "string" }));
    expect(() => loadAuditReport(file)).toThrow(/findings/);
  });

  it("retorna objeto parseado com findings", () => {
    const file = join(dir, "good.json");
    writeFileSync(file, JSON.stringify({ summary: { x: 1 }, findings: [] }));
    const out = loadAuditReport(file);
    expect(out.summary.x).toBe(1);
    expect(out.findings).toEqual([]);
  });
});

describe("writeCleanupReport", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cleanup-write-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("cria diretório quando ausente e grava JSON", () => {
    const subDir = join(dir, "deep", "subdir");
    const file = writeCleanupReport({
      cleanupDir: subDir,
      name: "archive-test-ads-snapshot",
      payload: { hello: "world" },
    });
    expect(file).toMatch(/archive-test-ads-snapshot-/);
    expect(file).toMatch(/\.json$/);
  });
});
