/**
 * Varredura estática de integridade: anti-padrões frágeis, duplicados de nome,
 * require em módulos ESM, clones (via jscpd CLI separado).
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "build",
  ".turbo",
]);

const SOURCE_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]);

/** Nomes de export ignorados (handlers HTTP, Next.js, nomes genéricos). */
const IGNORED_EXPORT_NAMES = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "dynamic",
  "revalidate",
  "runtime",
  "preferredRegion",
  "fetchCache",
  "maxDuration",
  "metadata",
  "generateMetadata",
  "generateStaticParams",
  "config",
  "middleware",
  "loader",
  "default",
  "handler",
  "schema",
  "router",
  "app",
  "pool",
  "logger",
  "client",
  "index",
  /** CRUD / MVC comuns — duplicar controller + service é padrão. */
  "list",
  "search",
  "show",
  "create",
  "update",
  "remove",
  "login",
  "logout",
  "refresh",
  "register",
]);

function walkFiles(rootDir, skipDirs) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;

  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        walk(full);
      } else if (SOURCE_EXT.has(path.extname(ent.name))) {
        out.push(full);
      }
    }
  };
  walk(rootDir);
  return out;
}

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function rel(root, file) {
  return path.relative(root, file).replace(/\\/g, "/");
}

/** Controller ↔ repository / service ↔ repository é padrão MVC — não é duplicação acidental. */
function shouldSkipDuplicateExportPair(files) {
  const arr = [...files];
  if (arr.length !== 2) return false;
  const [a, b] = arr.sort();
  const layer = (p) => {
    if (p.endsWith("controller.js") || p.endsWith("controller.ts")) return "c";
    if (p.endsWith("repository.js") || p.endsWith("repository.ts")) return "r";
    if (p.endsWith("service.js") || p.endsWith("service.ts")) return "s";
    return "x";
  };
  const la = layer(a);
  const lb = layer(b);
  if ((la === "c" && lb === "r") || (la === "r" && lb === "c")) return true;
  if ((la === "s" && lb === "r") || (la === "r" && lb === "s")) return true;
  if ((la === "c" && lb === "s") || (la === "s" && lb === "c")) return true;
  return false;
}

/**
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string[]} [opts.scanRoots] relativo a repoRoot, ex. ['src', 'frontend']
 * @param {Set<string>} [opts.skipDirs]
 */
export function runSystemIntegrityScan(opts) {
  const repoRoot = path.resolve(opts.repoRoot || process.cwd());
  const skipDirs = opts.skipDirs || DEFAULT_SKIP_DIRS;
  const scanRoots = opts.scanRoots || ["src", "frontend"];

  const findings = [];
  /** Duplicados só dentro do mesmo ecossistema (src vs frontend), nunca entre si. */
  const exportNameToFiles = { src: new Map(), frontend: new Map() };

  const recordExport = (name, fileRel, ecosystem) => {
    if (!name || IGNORED_EXPORT_NAMES.has(name)) return;
    if (name.length < 4) return;
    if (fileRel.includes("/e2e/")) return;
    const map = exportNameToFiles[ecosystem];
    if (!map.has(name)) map.set(name, new Set());
    map.get(name).add(fileRel);
  };

  let filesScanned = 0;

  for (const rootRel of scanRoots) {
    const rootAbs = path.join(repoRoot, rootRel);
    const ecosystem = rootRel.replace(/[/\\].*$/, "") === "frontend" ? "frontend" : "src";
    for (const file of walkFiles(rootAbs, skipDirs)) {
      const content = read(file);
      if (!content) continue;
      filesScanned += 1;
      const fileRel = rel(repoRoot, file);

      if (/\beval\s*\(/.test(content) || /\bnew\s+Function\s*\(/.test(content)) {
        findings.push({
          severity: "error",
          code: "dangerous-dynamic-code",
          file: fileRel,
          message: "Uso de eval ou new Function — risco de segurança e manutenção.",
        });
      }

      const hasImport = /^\s*import\s+/m.test(content) || /\nimport\s+/.test(content);
      if (hasImport && /\brequire\s*\(/.test(content)) {
        findings.push({
          severity: "warn",
          code: "require-in-esm-module",
          file: fileRel,
          message:
            "require() num ficheiro com import ESM — mistura frágil (bundling / ordem de carregamento).",
        });
      }

      for (const match of content.matchAll(
        /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g
      )) {
        recordExport(match[1], fileRel, ecosystem);
      }
      for (const match of content.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g)) {
        recordExport(match[1], fileRel, ecosystem);
      }

      const emptyCatchPatterns = [/\}?\s*catch\s*\([^)]*\)\s*\{\s*\}/g, /\}?\s*catch\s*\{\s*\}/g];
      for (const re of emptyCatchPatterns) {
        re.lastIndex = 0;
        if (re.test(content)) {
          findings.push({
            severity: "warn",
            code: "empty-catch-block",
            file: fileRel,
            message:
              "catch vazio ou só com comentário omitido — erros silenciados (revisar ou registar).",
          });
          break;
        }
      }

      const fnDecl = [...content.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)];
      const names = fnDecl.map((m) => m[1]);
      const seen = new Map();
      for (const n of names) {
        seen.set(n, (seen.get(n) || 0) + 1);
      }
      for (const [n, count] of seen) {
        if (count > 1 && !IGNORED_EXPORT_NAMES.has(n)) {
          findings.push({
            severity: "warn",
            code: "duplicate-function-name-same-file",
            file: fileRel,
            message: `Nome de função repetido no mesmo ficheiro (${n}) — possível copy-paste ou merge incorreto.`,
          });
          break;
        }
      }
    }
  }

  for (const eco of ["src", "frontend"]) {
    for (const [name, files] of exportNameToFiles[eco]) {
      if (files.size < 2) continue;
      if (files.size === 2 && shouldSkipDuplicateExportPair(files)) continue;
      const list = [...files].sort();
      findings.push({
        severity: "warn",
        code: "duplicate-export-name-across-modules",
        message: `Nome exportado repetido (${eco}): "${name}" (${files.size} ficheiros).`,
        details: list.join("\n"),
      });
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");

  return {
    findings,
    meta: {
      filesScanned,
      errorCount: errors.length,
      warnCount: warnings.length,
    },
  };
}
