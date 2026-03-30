import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSystemIntegrityScan } from "../../scripts/lib/system-integrity-scan.mjs";

describe("runSystemIntegrityScan", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integrity-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deteta eval como erro", () => {
    const src = path.join(tmpDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, "bad.js"),
      'export function x(){ return eval("1"); }\n',
      "utf8"
    );
    const { findings, meta } = runSystemIntegrityScan({
      repoRoot: tmpDir,
      scanRoots: ["src"],
    });
    expect(meta.errorCount).toBeGreaterThanOrEqual(1);
    expect(findings.some((f) => f.code === "dangerous-dynamic-code")).toBe(true);
  });

  it("deteta require misturado com import ESM", () => {
    const src = path.join(tmpDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(src, "mix.js"),
      'import x from "y";\nconst z = require("z");\n',
      "utf8"
    );
    const { findings } = runSystemIntegrityScan({
      repoRoot: tmpDir,
      scanRoots: ["src"],
    });
    expect(findings.some((f) => f.code === "require-in-esm-module")).toBe(true);
  });

  it("repositório atual: zero erros de integridade (avisos são informativos)", () => {
    const { meta } = runSystemIntegrityScan({ repoRoot: process.cwd() });
    expect(meta.errorCount).toBe(0);
    expect(meta.filesScanned).toBeGreaterThan(100);
  });
});
