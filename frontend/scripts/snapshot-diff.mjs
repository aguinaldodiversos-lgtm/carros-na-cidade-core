#!/usr/bin/env node
/**
 * snapshot-diff.mjs
 *
 * PR B — Compara dois snapshots de rotas públicas e classifica diffs.
 *
 * Uso:
 *   node frontend/scripts/snapshot-diff.mjs <before.json> <after.json>
 *   node frontend/scripts/snapshot-diff.mjs --before=tests/snapshots/x.json --after=tests/snapshots/y.json
 *
 * Saída:
 *   - Console: relatório legível
 *   - Exit code: 0 se zero diffs bloqueantes; 1 se houver diff bloqueante; 2 erro fatal
 *
 * Classificação (DIAGNOSTICO_REDESIGN.md §8.2):
 *   - BLOQUEANTE: canonical mudou sem intenção, status virou ≠ 200, h1_count ≠ 1,
 *                 robots mudou, jsonld_types perdeu tipo, URL antes 200 virou 404/erro
 *   - EXIGE EXPLICAÇÃO: title/description/og_image mudaram, internal_links_count >10% variação
 *   - INFORMATIVO: html_size_bytes, server_timing_total_ms (variação esperada)
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs() {
  const args = { positional: [] };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      args[k] = rest.length ? rest.join("=") : true;
    } else {
      args.positional.push(a);
    }
  }
  return args;
}

const args = parseArgs();
const BEFORE_PATH = args.before || args.positional[0];
const AFTER_PATH = args.after || args.positional[1];

if (!BEFORE_PATH || !AFTER_PATH) {
  console.error(
    "Uso: snapshot-diff.mjs <before.json> <after.json>\n" +
      "  ou: snapshot-diff.mjs --before=... --after=..."
  );
  process.exit(2);
}

async function loadSnapshot(path) {
  const text = await readFile(resolve(path), "utf8");
  return JSON.parse(text);
}

function indexByPath(snapshot) {
  const map = new Map();
  for (const r of snapshot.results || []) {
    if (r.path) map.set(r.path, r);
  }
  return map;
}

function classifyDiff(before, after) {
  const issues = [];
  if (!before && after) {
    issues.push({ severity: "info", field: "presence", msg: "Adicionada nova URL no snapshot" });
    return issues;
  }
  if (before && !after) {
    issues.push({
      severity: "blocking",
      field: "presence",
      msg: "URL removida do snapshot — possível remoção de rota",
    });
    return issues;
  }
  if (before.skipped || after.skipped) {
    issues.push({
      severity: "info",
      field: "skip",
      msg: "URL pulada em algum snapshot",
    });
    return issues;
  }
  if (before.error || after.error) {
    issues.push({
      severity: "blocking",
      field: "fetch",
      msg: `Erro de fetch: before=${before.error || "ok"} after=${after.error || "ok"}`,
    });
    return issues;
  }

  // Status code
  if (before.status !== after.status) {
    const wasOk = before.status >= 200 && before.status < 300;
    const nowOk = after.status >= 200 && after.status < 300;
    const wasRedirect = before.status >= 300 && before.status < 400;
    const nowRedirect = after.status >= 300 && after.status < 400;
    if (wasOk && !nowOk) {
      issues.push({
        severity: "blocking",
        field: "status",
        msg: `Status mudou de ${before.status} (ok) para ${after.status}`,
      });
    } else if (!wasRedirect && nowRedirect) {
      issues.push({
        severity: "explain",
        field: "status",
        msg: `Agora redireciona ${after.status} → ${after.redirected_to}`,
      });
    } else {
      issues.push({
        severity: "explain",
        field: "status",
        msg: `Status mudou de ${before.status} para ${after.status}`,
      });
    }
  }

  // Redirect destino mudou
  if (
    before.redirected_to !== after.redirected_to &&
    (before.redirected_to || after.redirected_to)
  ) {
    issues.push({
      severity: "blocking",
      field: "redirect_target",
      msg: `Destino do redirect mudou: ${before.redirected_to} → ${after.redirected_to}`,
    });
  }

  // Metadata
  const bm = before.metadata || {};
  const am = after.metadata || {};

  // Canonical
  if (bm.canonical !== am.canonical) {
    issues.push({
      severity: "blocking",
      field: "canonical",
      msg: `Canonical mudou: ${bm.canonical} → ${am.canonical}`,
    });
  }

  // Robots
  if (bm.robots !== am.robots) {
    issues.push({
      severity: "blocking",
      field: "robots",
      msg: `Robots mudou: ${bm.robots} → ${am.robots}`,
    });
  }

  // h1_count
  if (bm.h1_count !== am.h1_count) {
    if (am.h1_count !== 1) {
      issues.push({
        severity: "blocking",
        field: "h1_count",
        msg: `h1_count mudou para ${am.h1_count} (deveria ser 1)`,
      });
    } else {
      issues.push({
        severity: "info",
        field: "h1_count",
        msg: `h1_count corrigido: ${bm.h1_count} → ${am.h1_count}`,
      });
    }
  }

  // JSON-LD types
  const beforeTypes = new Set(bm.jsonld_types || []);
  const afterTypes = new Set(am.jsonld_types || []);
  for (const t of beforeTypes) {
    if (!afterTypes.has(t)) {
      issues.push({
        severity: "blocking",
        field: "jsonld_types",
        msg: `Tipo JSON-LD removido: ${t}`,
      });
    }
  }
  for (const t of afterTypes) {
    if (!beforeTypes.has(t)) {
      issues.push({
        severity: "info",
        field: "jsonld_types",
        msg: `Tipo JSON-LD adicionado: ${t}`,
      });
    }
  }

  // Breadcrumb JSON-LD presença
  if (bm.breadcrumb_jsonld_present && !am.breadcrumb_jsonld_present) {
    issues.push({
      severity: "blocking",
      field: "breadcrumb_jsonld",
      msg: "Breadcrumb JSON-LD removido",
    });
  }

  // Title / description / og_image — exigem explicação
  if (bm.title !== am.title) {
    issues.push({
      severity: "explain",
      field: "title",
      msg: `Title mudou: "${bm.title}" → "${am.title}"`,
    });
  }
  if (bm.description !== am.description) {
    issues.push({
      severity: "explain",
      field: "description",
      msg: `Description mudou`,
    });
  }
  if (bm.og_image !== am.og_image) {
    issues.push({ severity: "explain", field: "og_image", msg: `og:image mudou` });
  }

  // Internal links count — variação >10% exige explicação
  if (typeof bm.internal_links_count === "number" && typeof am.internal_links_count === "number") {
    const before = bm.internal_links_count;
    const after = am.internal_links_count;
    if (before > 0) {
      const pct = Math.abs(after - before) / before;
      if (pct > 0.1) {
        issues.push({
          severity: "explain",
          field: "internal_links_count",
          msg: `internal_links_count variou ${(pct * 100).toFixed(1)}%: ${before} → ${after}`,
        });
      }
    }
  }

  // html_size_bytes — informativo
  if (
    typeof bm.html_size_bytes === "number" &&
    typeof am.html_size_bytes === "number" &&
    bm.html_size_bytes > 0
  ) {
    const pct = (am.html_size_bytes - bm.html_size_bytes) / bm.html_size_bytes;
    if (Math.abs(pct) > 0.05) {
      issues.push({
        severity: "info",
        field: "html_size_bytes",
        msg: `html_size variou ${(pct * 100).toFixed(1)}%: ${bm.html_size_bytes} → ${am.html_size_bytes}`,
      });
    }
  }

  return issues;
}

function emoji(severity) {
  switch (severity) {
    case "blocking":
      return "🔴";
    case "explain":
      return "🟡";
    case "info":
      return "🔵";
    default:
      return "•";
  }
}

async function main() {
  const before = await loadSnapshot(BEFORE_PATH);
  const after = await loadSnapshot(AFTER_PATH);

  const beforeMap = indexByPath(before);
  const afterMap = indexByPath(after);

  const allPaths = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const report = [];
  let blockingCount = 0;
  let explainCount = 0;
  let infoCount = 0;

  for (const path of [...allPaths].sort()) {
    const issues = classifyDiff(beforeMap.get(path), afterMap.get(path));
    if (issues.length) {
      report.push({ path, issues });
      for (const iss of issues) {
        if (iss.severity === "blocking") blockingCount++;
        else if (iss.severity === "explain") explainCount++;
        else infoCount++;
      }
    }
  }

  console.log(`📊 Snapshot diff`);
  console.log(`Before: ${BEFORE_PATH} (${before.label}, captured at ${before.finished_at})`);
  console.log(`After:  ${AFTER_PATH} (${after.label}, captured at ${after.finished_at})`);
  console.log(`Paths analisados: ${allPaths.size}`);
  console.log(`Paths com diff: ${report.length}`);
  console.log(``);
  console.log(`🔴 Bloqueantes:    ${blockingCount}`);
  console.log(`🟡 Exige explicar: ${explainCount}`);
  console.log(`🔵 Informativos:   ${infoCount}`);
  console.log(``);

  if (report.length === 0) {
    console.log("✅ Nenhuma diferença detectada. Snapshots equivalentes.");
    process.exit(0);
  }

  for (const r of report) {
    console.log(`📍 ${r.path}`);
    for (const iss of r.issues) {
      console.log(`   ${emoji(iss.severity)} [${iss.field}] ${iss.msg}`);
    }
    console.log(``);
  }

  if (blockingCount > 0) {
    console.error(
      `❌ ${blockingCount} diferença(s) bloqueante(s) — PR não pode mergear sem correção.`
    );
    process.exit(1);
  }
  if (explainCount > 0) {
    console.warn(
      `⚠️  ${explainCount} diferença(s) que exigem explicação na descrição do PR. Não bloqueia merge automaticamente.`
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(2);
});
