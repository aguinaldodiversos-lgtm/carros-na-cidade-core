#!/usr/bin/env node
import { runSystemIntegrityScan } from "./lib/system-integrity-scan.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const strict = args.includes("--strict");

const { findings, meta } = runSystemIntegrityScan({ repoRoot: process.cwd() });

if (json) {
  console.log(JSON.stringify({ meta, findings }, null, 2));
} else {
  console.log("");
  console.log("SYSTEM INTEGRITY SCAN");
  console.log("=====================");
  console.log(`Ficheiros analisados : ${meta.filesScanned}`);
  console.log(`Erros                : ${meta.errorCount}`);
  console.log(`Avisos               : ${meta.warnCount}`);
  console.log("");

  for (const f of findings) {
    const tag = f.severity.toUpperCase().padEnd(5, " ");
    console.log(`[${tag}] ${f.code}`);
    if (f.file) console.log(`  Ficheiro : ${f.file}`);
    console.log(`  ${f.message}`);
    if (f.details) console.log(`  Detalhes :\n${f.details}`);
    console.log("");
  }

  if (!findings.length) {
    console.log("Nenhum achado.");
    console.log("");
  }
}

const hasErrors = meta.errorCount > 0;
const hasWarnings = meta.warnCount > 0;

if (hasErrors || (strict && hasWarnings)) {
  process.exit(1);
}
process.exit(0);
