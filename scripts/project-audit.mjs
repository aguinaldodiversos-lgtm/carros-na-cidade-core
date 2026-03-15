#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, "project-audit.config.json");

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json"
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs"
]);

const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".gif",
  ".ico",
  ".avif"
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "build",
  ".turbo"
]);

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {
      frontendDir: "frontend",
      backendDir: "src",
      frontendScanDirs: [
        "frontend/app",
        "frontend/components",
        "frontend/lib",
        "frontend/hooks",
        "frontend/services"
      ],
      backendScanDirs: ["src", "scripts"],
      frontendPublicDir: "frontend/public",
      allowMissingFrontendRoutes: [],
      knownFrontendSelfLinkingComponents: [],
      backendRouteFilesGlobsHint: [".routes.", "app.js", "index.js"],
      envFiles: [".env", ".env.example", "frontend/.env", "frontend/.env.example"],
      frontendApiBaseEnvNames: ["NEXT_PUBLIC_API_URL", "API_URL"],
      backendApiBaseEnvNames: ["API_URL", "PORT"]
    };
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const config = loadConfig();

function parseArgs(argv) {
  const args = {
    json: false,
    strict: false,
    scope: "all"
  };

  for (const arg of argv) {
    if (arg === "--json") args.json = true;
    else if (arg === "--strict") args.strict = true;
    else if (arg.startsWith("--scope=")) args.scope = arg.split("=")[1] || "all";
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function rel(filePath) {
  return toPosix(path.relative(ROOT, filePath));
}

function exists(p) {
  return fs.existsSync(p);
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function walk(dirPath) {
  if (!exists(dirPath)) return [];
  const out = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
      continue;
    }

    const ext = path.extname(entry.name);
    if (CODE_EXTENSIONS.has(ext)) {
      out.push(full);
    }
  }

  return out;
}

function walkSourceOnly(dirPath) {
  return walk(dirPath).filter((file) => SOURCE_EXTENSIONS.has(path.extname(file)));
}

const frontendFiles = config.frontendScanDirs
  .map((dir) => path.join(ROOT, dir))
  .flatMap((dir) => walkSourceOnly(dir));

const backendFiles = config.backendScanDirs
  .map((dir) => path.join(ROOT, dir))
  .flatMap((dir) => walkSourceOnly(dir));

const allFiles = [...new Set([...frontendFiles, ...backendFiles])];

function addFinding(findings, {
  severity,
  code,
  file,
  message,
  suggestion,
  details
}) {
  findings.push({
    severity,
    code,
    file: file ? rel(file) : "",
    message,
    suggestion: suggestion || "",
    details: details || ""
  });
}

function extractImports(content) {
  const imports = [];

  for (const match of content.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g)) {
    const clause = match[1].trim();
    const source = match[2].trim();

    let defaultImport = null;
    const namedImports = [];

    if (clause.startsWith("{")) {
      const block = clause.slice(1, -1);
      for (const part of block.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const alias = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
        if (alias) {
          namedImports.push({ imported: alias[1], local: alias[2] });
        } else {
          namedImports.push({ imported: trimmed, local: trimmed });
        }
      }
    } else if (clause.includes("{")) {
      const [left, right] = clause.split("{");
      defaultImport = left.replace(",", "").trim();
      const block = right.replace("}", "");
      for (const part of block.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const alias = trimmed.match(/^(\w+)\s+as\s+(\w+)$/);
        if (alias) {
          namedImports.push({ imported: alias[1], local: alias[2] });
        } else {
          namedImports.push({ imported: trimmed, local: trimmed });
        }
      }
    } else {
      defaultImport = clause.trim();
    }

    imports.push({ source, defaultImport, namedImports });
  }

  return imports;
}

function resolveImport(fromFile, specifier) {
  let base = null;

  if (specifier.startsWith("@/")) {
    base = path.join(ROOT, config.frontendDir, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...Array.from(SOURCE_EXTENSIONS).map((ext) => `${base}${ext}`),
    ...Array.from(SOURCE_EXTENSIONS).map((ext) => path.join(base, `index${ext}`))
  ];

  for (const candidate of candidates) {
    if (exists(candidate) && fs.statSync(candidate).isFile()) return path.normalize(candidate);
  }

  return null;
}

function extractExportedComponentNames(content, filePath) {
  const names = new Set();

  for (const match of content.matchAll(/export\s+default\s+function\s+([A-Z]\w*)\s*\(/g)) {
    names.add(match[1]);
  }

  for (const match of content.matchAll(/export\s+function\s+([A-Z]\w*)\s*\(/g)) {
    names.add(match[1]);
  }

  for (const match of content.matchAll(/function\s+([A-Z]\w*)\s*\(/g)) {
    const name = match[1];
    const hasDefault = new RegExp(`export\\s+default\\s+${name}\\b`).test(content);
    const hasNamed = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(content);
    if (hasDefault || hasNamed) names.add(name);
  }

  if (!names.size) {
    const base = path.basename(filePath, path.extname(filePath));
    if (/^[A-Z]/.test(base)) names.add(base);
  }

  return Array.from(names);
}

function collectFrontendRoutes() {
  const appDir = path.join(ROOT, config.frontendDir, "app");
  if (!exists(appDir)) return [];

  const pageFiles = walkSourceOnly(appDir).filter((file) =>
    /(^|\/)page\.(tsx|ts|jsx|js)$/.test(toPosix(file))
  );

  return pageFiles.map((file) => {
    const relativeToApp = toPosix(path.relative(appDir, file));
    const dir = toPosix(path.dirname(relativeToApp));
    const rawParts = dir === "." ? [] : dir.split("/");

    const parts = rawParts
      .filter(Boolean)
      .filter((part) => !(part.startsWith("(") && part.endsWith(")")))
      .filter((part) => !part.startsWith("@"))
      .map((part) => {
        if (/^\[\[\.\.\..+\]\]$/.test(part)) return "*";
        if (/^\[\.\.\..+\]$/.test(part)) return "*";
        if (/^\[.+\]$/.test(part)) return ":param";
        return part;
      });

    return "/" + parts.join("/");
  });
}

function routeExists(targetPath, routePatterns, allowMissingRoutes) {
  if (allowMissingRoutes.includes(targetPath)) return true;
  if (targetPath === "/") return routePatterns.includes("/");

  const targetParts = targetPath.split("/").filter(Boolean);

  return routePatterns.some((pattern) => {
    const patternParts = pattern.split("/").filter(Boolean);

    let i = 0;
    let j = 0;

    while (i < patternParts.length && j < targetParts.length) {
      const pp = patternParts[i];
      const tp = targetParts[j];

      if (pp === "*") return true;
      if (pp === ":param") {
        i += 1;
        j += 1;
        continue;
      }
      if (pp !== tp) return false;

      i += 1;
      j += 1;
    }

    if (i < patternParts.length && patternParts[i] === "*") return true;
    return i === patternParts.length && j === targetParts.length;
  });
}

function collectBackendRoutePatterns() {
  const patterns = new Set();

  const routeLikeFiles = backendFiles.filter((file) =>
    config.backendRouteFilesGlobsHint.some((hint) => rel(file).includes(hint))
  );

  for (const file of routeLikeFiles) {
    const content = readFileSafe(file);

    for (const match of content.matchAll(/router\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/g)) {
      patterns.add(match[2]);
    }

    for (const match of content.matchAll(/app\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/g)) {
      patterns.add(match[2]);
    }
  }

  return Array.from(patterns);
}

function normalizeBackendPattern(pattern) {
  return pattern
    .replace(/\/:([A-Za-z0-9_]+)/g, "/:param")
    .replace(/\*+/g, "*");
}

function backendRouteLikelyMatches(candidatePath, backendPatterns) {
  const clean = candidatePath.split("?")[0].replace(/\/$/, "") || "/";
  const candidateParts = clean.split("/").filter(Boolean);

  return backendPatterns.some((rawPattern) => {
    const pattern = normalizeBackendPattern(rawPattern.replace(/\/$/, "") || "/");
    const patternParts = pattern.split("/").filter(Boolean);

    let i = 0;
    let j = 0;

    while (i < patternParts.length && j < candidateParts.length) {
      const pp = patternParts[i];
      const cp = candidateParts[j];

      if (pp === "*" || pp === ":param") {
        i += 1;
        j += 1;
        continue;
      }

      if (pp !== cp) return false;

      i += 1;
      j += 1;
    }

    return i === patternParts.length && j === candidateParts.length;
  });
}

function extractFrontendApiCalls(file, content) {
  const calls = [];

  const fetchRegex = /fetch\(\s*([`"'"][\s\S]*?[`"'])/g;
  const axiosRegex = /\b(?:axios|api)\.(get|post|put|patch|delete)\(\s*([`"'"][\s\S]*?[`"'])/g;

  for (const match of content.matchAll(fetchRegex)) {
    calls.push({
      kind: "fetch",
      raw: match[1]
    });
  }

  for (const match of content.matchAll(axiosRegex)) {
    calls.push({
      kind: "axios",
      raw: match[2]
    });
  }

  return calls.map((call) => {
    const raw = call.raw.slice(1, -1);
    return {
      ...call,
      value: raw,
      file
    };
  });
}

function looksLikeBackendPath(value) {
  if (!value) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (value.startsWith("/api/")) return true;
  if (value.startsWith("/content/")) return true;
  if (value.startsWith("/ads/")) return true;
  if (value.startsWith("/public/")) return true;
  if (value.startsWith("/catalog/")) return true;
  return false;
}

function collectEnvKeys() {
  const envMap = new Map();

  for (const relativePath of config.envFiles || []) {
    const full = path.join(ROOT, relativePath);
    if (!exists(full)) continue;

    const content = readFileSafe(full);
    const keys = [];

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      if (match) keys.push(match[1]);
    }

    envMap.set(relativePath, keys);
  }

  return envMap;
}

function auditJsxInTs(findings) {
  for (const file of allFiles) {
    if (path.extname(file) !== ".ts") continue;
    const content = readFileSafe(file);

    const likelyJsx =
      /return\s*\(\s*</m.test(content) ||
      /<svg\b/m.test(content) ||
      /<div\b/m.test(content) ||
      /<Link\b/m.test(content);

    if (likelyJsx) {
      addFinding(findings, {
        severity: "error",
        code: "jsx-in-ts",
        file,
        message: "Arquivo .ts aparenta conter JSX.",
        suggestion: "Mover o arquivo para .tsx ou remover JSX do módulo utilitário."
      });
    }
  }
}

function auditFrontendAssets(findings) {
  const publicDir = path.join(ROOT, config.frontendPublicDir);
  const assetRegex = /["'`]((\/[^"'`]+\.(png|jpg|jpeg|webp|svg|gif|ico|avif)))["'`]/g;

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    const matches = Array.from(content.matchAll(assetRegex));

    for (const match of matches) {
      const assetPath = match[1];
      const full = path.join(publicDir, assetPath.replace(/^\//, ""));

      if (!exists(full)) {
        addFinding(findings, {
          severity: "error",
          code: "missing-frontend-asset",
          file,
          message: `Asset do frontend não encontrado: ${assetPath}`,
          suggestion: "Adicionar o arquivo em frontend/public ou trocar por um asset existente."
        });
      }
    }
  }
}

function auditFrontendRoutes(findings) {
  const routePatterns = collectFrontendRoutes();

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    const refs = [
      ...Array.from(content.matchAll(/href\s*=\s*["'`]([^"'`]+)["'`]/g)),
      ...Array.from(content.matchAll(/redirect\(\s*["'`]([^"'`]+)["'`]\s*\)/g))
    ];

    for (const ref of refs) {
      const rawTarget = ref[1];
      if (!rawTarget.startsWith("/")) continue;
      if (rawTarget.includes("${")) continue;
      if (rawTarget.startsWith("/api/")) continue;

      const targetPath = rawTarget.split("?")[0].split("#")[0];
      const ok = routeExists(
        targetPath,
        routePatterns,
        config.allowMissingFrontendRoutes || []
      );

      if (!ok) {
        addFinding(findings, {
          severity: "warn",
          code: "missing-frontend-route",
          file,
          message: `Link interno aponta para rota não encontrada no App Router: ${targetPath}`,
          suggestion: "Confirmar se a rota existe em frontend/app ou atualizar o href."
        });
      }
    }
  }
}

function auditNestedLinks(findings) {
  const registry = new Map();

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    if (!/<Link\b|<a\b/.test(content)) continue;

    registry.set(path.normalize(file), {
      names: extractExportedComponentNames(content, file),
      content
    });
  }

  const configured = new Set(config.knownFrontendSelfLinkingComponents || []);

  for (const file of frontendFiles) {
    const content = readFileSafe(file);

    if (/<Link\b[\s\S]{0,5000}<Link\b[\s\S]{0,5000}<\/Link>[\s\S]{0,5000}<\/Link>/m.test(content)) {
      addFinding(findings, {
        severity: "error",
        code: "direct-nested-link",
        file,
        message: "Há Link renderizado dentro de outro Link no mesmo arquivo.",
        suggestion: "Remover o Link externo ou tornar o componente interno não clicável."
      });
    }

    const imports = extractImports(content);
    const localSelfLinkingNames = new Set();

    for (const imp of imports) {
      const resolved = resolveImport(file, imp.source);
      const configuredSelfLink = configured.has(imp.source);

      if (resolved && registry.has(path.normalize(resolved))) {
        const exported = registry.get(path.normalize(resolved)).names;
        if (imp.defaultImport) localSelfLinkingNames.add(imp.defaultImport);
        for (const named of imp.namedImports) {
          if (exported.includes(named.imported)) {
            localSelfLinkingNames.add(named.local);
          }
        }
      }

      if (configuredSelfLink) {
        if (imp.defaultImport) localSelfLinkingNames.add(imp.defaultImport);
        for (const named of imp.namedImports) {
          localSelfLinkingNames.add(named.local);
        }
      }
    }

    for (const localName of localSelfLinkingNames) {
      const pattern = new RegExp(
        `<Link\\b[\\s\\S]{0,6000}<${localName}\\b[\\s\\S]{0,3000}\\/?>[\\s\\S]{0,6000}<\\/Link>`,
        "m"
      );

      if (pattern.test(content)) {
        addFinding(findings, {
          severity: "error",
          code: "wrapped-self-linking-component",
          file,
          message: `Componente com navegação própria (${localName}) foi embrulhado por Link.`,
          suggestion: "Padronizar o componente para controlar sua própria navegação ou expor modo sem Link interno."
        });
      }
    }
  }
}

function auditEnvUsage(findings) {
  const envFiles = collectEnvKeys();
  const allDeclaredKeys = new Set();

  for (const keys of envFiles.values()) {
    for (const key of keys) allDeclaredKeys.add(key);
  }

  for (const file of allFiles) {
    const content = readFileSafe(file);
    const matches = Array.from(content.matchAll(/process\.env\.([A-Z0-9_]+)/g));

    for (const match of matches) {
      const key = match[1];
      if (!allDeclaredKeys.has(key)) {
        addFinding(findings, {
          severity: "warn",
          code: "env-key-not-declared",
          file,
          message: `Variável de ambiente usada no código sem declaração encontrada nos envs auditados: ${key}`,
          suggestion: "Declarar a variável em .env.example e nos ambientes necessários."
        });
      }
    }
  }
}

function auditFrontendBackendConnection(findings) {
  const backendPatterns = collectBackendRoutePatterns();

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    const calls = extractFrontendApiCalls(file, content);

    for (const call of calls) {
      const value = call.value;

      const usesEnvBase = config.frontendApiBaseEnvNames.some(
        (name) => content.includes(`process.env.${name}`)
      );

      if (looksLikeBackendPath(value)) {
        let pathOnly = value;

        if (value.startsWith("http://") || value.startsWith("https://")) {
          try {
            const url = new URL(value);
            pathOnly = url.pathname;
          } catch {
            pathOnly = value;
          }
        }

        if (pathOnly.includes("${")) {
          addFinding(findings, {
            severity: "warn",
            code: "dynamic-api-path",
            file,
            message: `Chamada de API dinâmica detectada: ${value}`,
            suggestion: "Validar manualmente se o endpoint montado dinamicamente possui rota correspondente no backend."
          });
          continue;
        }

        const matchesBackend = backendPatterns.length
          ? backendRouteLikelyMatches(pathOnly, backendPatterns)
          : false;

        if (!matchesBackend) {
          addFinding(findings, {
            severity: "warn",
            code: "frontend-backend-endpoint-uncertain",
            file,
            message: `O frontend chama um endpoint sem evidência clara de rota correspondente no backend auditado: ${pathOnly}`,
            suggestion:
              "Verificar se a rota existe em src/*.routes.* ou app/index. Se existir via prefixo/base route, considere registrar esse padrão no backend."
          });
        }
      }

      if (
        content.includes("process.env.NEXT_PUBLIC_API_URL") &&
        !usesEnvBase
      ) {
        addFinding(findings, {
          severity: "warn",
          code: "api-base-env-inconsistent",
          file,
          message: "Há indício de uso inconsistente de base URL da API no frontend.",
          suggestion:
            "Padronizar chamadas para montar URLs sempre a partir de NEXT_PUBLIC_API_URL ou de um client centralizado."
        });
      }
    }
  }
}

function auditFrontendBackendContracts(findings) {
  const frontendContractSignals = [];
  const backendContractSignals = [];

  for (const file of frontendFiles) {
    const content = readFileSafe(file);

    if (/fetchPublicHomeData|fetchBlogPageContent|getAdDetails|AdsSearchResponse|AdsFacetsResponse/.test(content)) {
      frontendContractSignals.push({
        file,
        content
      });
    }
  }

  for (const file of backendFiles) {
    const content = readFileSafe(file);

    if (/res\.json|router\.get|router\.post|app\.get|app\.post|module\.exports|export\s+/.test(content)) {
      backendContractSignals.push({
        file,
        content
      });
    }
  }

  if (!backendContractSignals.length) {
    addFinding(findings, {
      severity: "warn",
      code: "backend-contract-scan-weak",
      file: null,
      message: "Poucos sinais de contrato backend detectados. A auditoria de integração pode ficar incompleta.",
      suggestion: "Concentrar rotas e respostas JSON em arquivos previsíveis e nomeados consistentemente."
    });
  }

  if (!frontendContractSignals.length) {
    addFinding(findings, {
      severity: "warn",
      code: "frontend-contract-scan-weak",
      file: null,
      message: "Poucos sinais de consumo de contrato frontend detectados.",
      suggestion: "Centralizar consumo de API em clients/serviços para melhorar auditoria futura."
    });
  }
}

function buildSuggestionsSummary(findings) {
  const summary = [];

  const hasNestedLinks = findings.some((f) => f.code === "wrapped-self-linking-component" || f.code === "direct-nested-link");
  const hasMissingAssets = findings.some((f) => f.code === "missing-frontend-asset");
  const hasMissingRoutes = findings.some((f) => f.code === "missing-frontend-route");
  const hasApiMismatch = findings.some((f) => f.code === "frontend-backend-endpoint-uncertain");

  if (hasNestedLinks) {
    summary.push("Padronize componentes de card clicáveis com uma prop de controle como linkMode='self' | 'none' para impedir Link dentro de Link.");
  }

  if (hasMissingAssets) {
    summary.push("Crie uma política única de fallback de imagens e remova referências a arquivos não versionados no repositório.");
  }

  if (hasMissingRoutes) {
    summary.push("Centralize rotas do frontend em constantes reutilizáveis para reduzir 404 por href divergente.");
  }

  if (hasApiMismatch) {
    summary.push("Centralize consumo da API em um client único no frontend e padronize prefixos no backend para facilitar auditoria de contratos.");
  }

  if (!summary.length) {
    summary.push("Nenhuma recomendação global forte foi necessária com base nos achados atuais.");
  }

  return summary;
}

function runAudit() {
  const findings = [];

  if (args.scope === "all" || args.scope === "jsx-ts") {
    auditJsxInTs(findings);
  }

  if (args.scope === "all" || args.scope === "assets") {
    auditFrontendAssets(findings);
  }

  if (args.scope === "all" || args.scope === "routes") {
    auditFrontendRoutes(findings);
  }

  if (args.scope === "all" || args.scope === "links") {
    auditNestedLinks(findings);
  }

  if (args.scope === "all" || args.scope === "env") {
    auditEnvUsage(findings);
  }

  if (args.scope === "all" || args.scope === "integration") {
    auditFrontendBackendConnection(findings);
    auditFrontendBackendContracts(findings);
  }

  return findings;
}

function printPretty(findings) {
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");
  const suggestions = buildSuggestionsSummary(findings);

  console.log("");
  console.log("AUDITORIA COMPLETA DO PROJETO");
  console.log("=============================");
  console.log(`Arquivos frontend auditados : ${frontendFiles.length}`);
  console.log(`Arquivos backend auditados  : ${backendFiles.length}`);
  console.log(`Erros                       : ${errors.length}`);
  console.log(`Avisos                      : ${warnings.length}`);
  console.log(`Total                       : ${findings.length}`);
  console.log("");

  if (!findings.length) {
    console.log("Nenhum problema encontrado.");
  } else {
    for (const finding of findings) {
      const tag = finding.severity.toUpperCase().padEnd(5, " ");
      console.log(`[${tag}] ${finding.code}`);
      if (finding.file) console.log(`  Arquivo    : ${finding.file}`);
      console.log(`  Problema   : ${finding.message}`);
      if (finding.details) console.log(`  Detalhes   : ${finding.details}`);
      if (finding.suggestion) console.log(`  Sugestão   : ${finding.suggestion}`);
      console.log("");
    }
  }

  console.log("RECOMENDAÇÕES GERAIS");
  console.log("--------------------");
  for (const item of suggestions) {
    console.log(`- ${item}`);
  }
  console.log("");
}

const findings = runAudit();

if (args.json) {
  console.log(JSON.stringify({
    meta: {
      frontendFiles: frontendFiles.length,
      backendFiles: backendFiles.length,
      totalFindings: findings.length
    },
    findings,
    summarySuggestions: buildSuggestionsSummary(findings)
  }, null, 2));
} else {
  printPretty(findings);
}

const hasErrors = findings.some((item) => item.severity === "error");
const hasWarnings = findings.some((item) => item.severity === "warn");

if (hasErrors || (args.strict && hasWarnings)) {
  process.exit(1);
}

process.exit(0);
