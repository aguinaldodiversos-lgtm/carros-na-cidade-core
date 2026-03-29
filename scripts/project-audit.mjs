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
  ".json",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  "build",
  ".turbo",
]);

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      "project-audit.config.json não encontrado na raiz do projeto."
    );
  }

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const config = loadConfig();

function parseArgs(argv) {
  const args = {
    json: false,
    strict: false,
    scope: "all",
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
  return filePath ? toPosix(path.relative(ROOT, filePath)) : "";
}

function exists(target) {
  return fs.existsSync(target);
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
  const files = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...walk(full));
      continue;
    }

    const ext = path.extname(entry.name);
    if (CODE_EXTENSIONS.has(ext)) {
      files.push(full);
    }
  }

  return files;
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

function addFinding(findings, { severity, code, file, message, suggestion, details }) {
  findings.push({
    severity,
    code,
    file: rel(file),
    message,
    suggestion: suggestion || "",
    details: details || "",
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

function resolveImport(fromFile, specifier, targetRootMode = "frontend") {
  let base = null;

  if (specifier.startsWith("@/")) {
    if (targetRootMode === "frontend") {
      base = path.join(ROOT, config.frontendDir, specifier.slice(2));
    } else {
      base = path.join(ROOT, specifier.slice(2));
    }
  } else if (specifier.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...Array.from(SOURCE_EXTENSIONS).map((ext) => `${base}${ext}`),
    ...Array.from(SOURCE_EXTENSIONS).map((ext) => path.join(base, `index${ext}`)),
  ];

  for (const candidate of candidates) {
    if (exists(candidate) && fs.statSync(candidate).isFile()) {
      return path.normalize(candidate);
    }
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
    const baseName = path.basename(filePath, path.extname(filePath));
    if (/^[A-Z]/.test(baseName)) names.add(baseName);
  }

  return Array.from(names);
}

function normalizeEndpointPath(value) {
  if (!value) return "";

  let output = value.trim();

  output = output.replace(/https?:\/\/[^/]+/g, "");
  output = output.replace(/\$\{[^}]+\}/g, ":param");
  output = output.replace(/\/:([A-Za-z0-9_]+)/g, "/:param");
  output = output.replace(/\?.*$/, "");
  output = output.replace(/\/+/g, "/");
  output = output.replace(/\/$/, "");

  return output || "/";
}

/**
 * `fetch(\`${apiBase}/api/...\`)` normaliza para `:param/api/...` ou `/:param/api/...`
 * (normalizeEndpointPath substitui `${...}` e pode ou não preservar `/` inicial).
 * O backend Express monta `/api/...` sem o segmento de host — alinhamos para o match.
 */
function stripLeadingApiBasePlaceholder(path) {
  const p = normalizeEndpointPath(path);
  if (p.startsWith("/:param/api/")) {
    return p.replace(/^\/:param/, "");
  }
  if (p.startsWith(":param/api/")) {
    return p.slice(":param".length);
  }
  return p;
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

function collectBackendRouteRegistry() {
  const registry = new Map();

  for (const file of backendFiles) {
    registry.set(path.normalize(file), {
      file,
      content: readFileSafe(file),
      imports: [],
      routerVars: new Set(),
      exportedRouterLike: false,
      mountPrefixes: new Set([""]),
      directRoutes: [],
    });
  }

  for (const [, entry] of registry) {
    entry.imports = extractImports(entry.content);

    for (const match of entry.content.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:express\.)?Router\s*\(/g)) {
      entry.routerVars.add(match[1]);
    }

    for (const match of entry.content.matchAll(/\b([A-Za-z_$][\w$]*)\.(get|post|put|patch|delete|use)\(\s*["'`]([^"'`]+)["'`]/g)) {
      const owner = match[1];
      const method = match[2].toUpperCase();
      const routePath = match[3];

      if (owner === "app" || entry.routerVars.has(owner)) {
        entry.directRoutes.push({
          owner,
          method,
          path: routePath,
        });
      }
    }

    if (
      /export\s+default\s+[A-Za-z_$][\w$]*/.test(entry.content) ||
      /module\.exports\s*=/.test(entry.content) ||
      /export\s*\{\s*[A-Za-z_$][\w$]*\s*\}/.test(entry.content)
    ) {
      entry.exportedRouterLike = true;
    }
  }

  const prefixesByFile = new Map();

  for (const [file, entry] of registry) {
    // Não sobrescrever: app.js pode já ter registado prefixos em ficheiros de router
    // montados antes deste ficheiro ser visitado na iteração.
    if (!prefixesByFile.has(file)) {
      prefixesByFile.set(file, new Set([""]));
    }

    const localImportMap = new Map();

    for (const imp of entry.imports) {
      const resolved = resolveImport(file, imp.source, "backend");
      if (!resolved) continue;

      if (imp.defaultImport) {
        localImportMap.set(imp.defaultImport, resolved);
      }

      for (const named of imp.namedImports) {
        localImportMap.set(named.local, resolved);
      }
    }

    for (const match of entry.content.matchAll(/\bapp\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
      const prefix = match[1];
      const localName = match[2];
      const resolved = localImportMap.get(localName);

      if (resolved && registry.has(path.normalize(resolved))) {
        const key = path.normalize(resolved);
        if (!prefixesByFile.has(key)) {
          prefixesByFile.set(key, new Set([""]));
        }
        prefixesByFile.get(key).add(prefix);
      }
    }
  }

  const endpoints = [];

  for (const [file, entry] of registry) {
    const prefixes = prefixesByFile.get(file) || new Set([""]);

    for (const route of entry.directRoutes) {
      const basePrefixes = route.owner === "app" ? new Set([""]) : prefixes;

      for (const prefix of basePrefixes) {
        const merged = normalizeEndpointPath(`${prefix}/${route.path}`);
        endpoints.push({
          file: entry.file,
          method: route.method,
          path: merged,
        });
      }
    }
  }

  return endpoints;
}

function pathMatchesPattern(candidate, pattern) {
  const a = normalizeEndpointPath(candidate).split("/").filter(Boolean);
  const b = normalizeEndpointPath(pattern).split("/").filter(Boolean);

  if (!a.length && !b.length) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];

    if (left === ":param" || right === ":param" || left === "*" || right === "*") {
      continue;
    }

    if (left !== right) return false;
  }

  return true;
}

function extractFetchCalls(content) {
  const calls = [];

  for (const match of content.matchAll(/fetch\(\s*([`"'"][\s\S]*?[`"'])\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g)) {
    const rawUrl = match[1];
    const rawOptions = match[2] || "";
    const url = rawUrl.slice(1, -1);

    let method = "GET";
    const methodMatch = rawOptions.match(/method\s*:\s*["'`]([A-Za-z]+)["'`]/);
    if (methodMatch) method = methodMatch[1].toUpperCase();

    calls.push({
      kind: "fetch",
      method,
      raw: url,
      normalizedPath: normalizeEndpointPath(url),
    });
  }

  return calls;
}

function extractAxiosCalls(content) {
  const calls = [];

  for (const match of content.matchAll(/\b(?:axios|api)\.(get|post|put|patch|delete)\(\s*([`"'"][\s\S]*?[`"'])/g)) {
    const method = match[1].toUpperCase();
    const url = match[2].slice(1, -1);

    calls.push({
      kind: "axios",
      method,
      raw: url,
      normalizedPath: normalizeEndpointPath(url),
    });
  }

  return calls;
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
        suggestion: "Mover o arquivo para .tsx ou remover JSX do módulo utilitário.",
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
          suggestion: "Adicionar o arquivo em frontend/public ou trocar por um asset existente.",
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
      ...Array.from(content.matchAll(/redirect\(\s*["'`]([^"'`]+)["'`]\s*\)/g)),
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
          suggestion: "Confirmar se a rota existe em frontend/app ou atualizar o href.",
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
      content,
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
        suggestion: "Remover o Link externo ou tornar o componente interno não clicável.",
      });
    }

    const imports = extractImports(content);
    const localSelfLinkingNames = new Set();

    for (const imp of imports) {
      const resolved = resolveImport(file, imp.source, "frontend");
      const configuredSelfLink = configured.has(imp.source);

      if (resolved && registry.has(path.normalize(resolved))) {
        const exported = registry.get(path.normalize(resolved)).names;

        if (imp.defaultImport) {
          localSelfLinkingNames.add(imp.defaultImport);
        }

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
          suggestion: "Padronizar o componente para controlar sua própria navegação ou expor modo sem Link interno.",
        });
      }
    }
  }
}

function auditEnvUsage(findings) {
  const envFiles = collectEnvKeys();
  const declaredKeys = new Set();

  for (const keys of envFiles.values()) {
    for (const key of keys) declaredKeys.add(key);
  }

  for (const file of allFiles) {
    const content = readFileSafe(file);
    const matches = Array.from(content.matchAll(/process\.env\.([A-Z0-9_]+)/g));

    for (const match of matches) {
      const envKey = match[1];
      if (!declaredKeys.has(envKey)) {
        addFinding(findings, {
          severity: "warn",
          code: "env-key-not-declared",
          file,
          message: `Variável de ambiente usada no código sem declaração auditada: ${envKey}`,
          suggestion: "Declarar a variável em .env.example e nos ambientes necessários.",
        });
      }
    }
  }
}

function auditFrontendBackendIntegration(findings) {
  const backendRegistry = collectBackendRouteRegistry();
  const contractHints = (config.contractHints || []).map((item) => ({
    frontendPath: normalizeEndpointPath(item.frontendPath),
    backendPattern: normalizeEndpointPath(item.backendPattern),
    methods: Array.isArray(item.methods) ? item.methods.map((m) => String(m).toUpperCase()) : ["GET"],
  }));

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    const apiCalls = [...extractFetchCalls(content), ...extractAxiosCalls(content)];

    for (const call of apiCalls) {
      const pathCandidate = call.normalizedPath;
      if (!pathCandidate || pathCandidate === "/") continue;

      /** Serviço opcional (métricas de boost), não é a API core em `src/app.js`. */
      if (
        typeof call.raw === "string" &&
        (call.raw.includes("AI_API_BASE") ||
          call.raw.includes("NEXT_PUBLIC_AI_API_URL"))
      ) {
        continue;
      }

      const pathForBackendMatch = stripLeadingApiBasePlaceholder(pathCandidate);

      const matchingHint = contractHints.find(
        (hint) =>
          pathMatchesPattern(pathCandidate, hint.frontendPath) &&
          hint.methods.includes(call.method)
      );

      const matchingBackend = backendRegistry.find(
        (route) =>
          route.method === call.method &&
          pathMatchesPattern(pathForBackendMatch, route.path)
      );

      const backendMethodMismatch = backendRegistry.find(
        (route) =>
          route.method !== call.method &&
          pathMatchesPattern(pathForBackendMatch, route.path)
      );

      if (!matchingHint && !matchingBackend) {
        addFinding(findings, {
          severity: "warn",
          code: "frontend-backend-endpoint-uncertain",
          file,
          message: `Chamada ${call.method} sem evidência clara de endpoint correspondente no backend: ${pathCandidate}`,
          suggestion:
            "Verificar se a rota existe no backend ou adicionar uma dica em contractHints no project-audit.config.json.",
          details: `Origem: ${call.kind}("${call.raw}")`,
        });
      }

      if (!matchingBackend && matchingHint) {
        addFinding(findings, {
          severity: "warn",
          code: "contract-hint-without-backend-proof",
          file,
          message: `A integração depende de contractHint, mas o auditor não encontrou prova estática da rota no backend: ${pathCandidate}`,
          suggestion:
            "Validar montagem de prefixos/router.use no backend ou concentrar as rotas em arquivos mais previsíveis.",
          details: `Hint: ${matchingHint.backendPattern} [${matchingHint.methods.join(", ")}]`,
        });
      }

      if (!matchingBackend && backendMethodMismatch) {
        addFinding(findings, {
          severity: "warn",
          code: "frontend-backend-method-mismatch",
          file,
          message: `O caminho existe no backend, mas com método diferente: ${pathCandidate}`,
          suggestion: "Revisar o método HTTP usado no frontend ou a implementação da rota no backend.",
          details: `Frontend: ${call.method} | Backend: ${backendMethodMismatch.method}`,
        });
      }
    }
  }
}

function auditContractStability(findings) {
  const frontendSignals = [];
  const backendSignals = [];

  for (const file of frontendFiles) {
    const content = readFileSafe(file);
    if (
      /fetch\(|axios\.|api\.get|api\.post|NEXT_PUBLIC_API_URL|API_URL|AdsSearchResponse|BlogPageContent|getAdDetails|fetchBlogPageContent/.test(
        content
      )
    ) {
      frontendSignals.push(file);
    }
  }

  for (const file of backendFiles) {
    const content = readFileSafe(file);
    if (
      /router\.(get|post|put|patch|delete|use)|app\.(get|post|put|patch|delete|use)|res\.json/.test(
        content
      )
    ) {
      backendSignals.push(file);
    }
  }

  if (frontendSignals.length === 0) {
    addFinding(findings, {
      severity: "warn",
      code: "frontend-contract-scan-weak",
      file: null,
      message: "Poucos sinais de consumo de API foram encontrados no frontend.",
      suggestion: "Centralizar chamadas de API em clients/serviços melhora a auditoria futura.",
    });
  }

  if (backendSignals.length === 0) {
    addFinding(findings, {
      severity: "warn",
      code: "backend-contract-scan-weak",
      file: null,
      message: "Poucos sinais de rotas/respostas JSON foram encontrados no backend.",
      suggestion: "Concentrar rotas e respostas em arquivos previsíveis melhora a auditoria futura.",
    });
  }
}

function buildSuggestionsSummary(findings) {
  const summary = [];

  if (findings.some((f) => f.code === "wrapped-self-linking-component" || f.code === "direct-nested-link")) {
    summary.push(
      "Padronize componentes clicáveis com uma prop como linkMode='self' | 'none' para impedir Link dentro de Link."
    );
  }

  if (findings.some((f) => f.code === "missing-frontend-asset")) {
    summary.push(
      "Crie uma política única de fallback de imagem e remova referências a assets não versionados no repositório."
    );
  }

  if (findings.some((f) => f.code === "missing-frontend-route")) {
    summary.push(
      "Centralize rotas do frontend em constantes reutilizáveis para reduzir href divergente e 404 silencioso."
    );
  }

  if (findings.some((f) => f.code === "frontend-backend-endpoint-uncertain")) {
    summary.push(
      "Centralize o consumo da API em um client único no frontend e padronize prefixos/router.use no backend para fortalecer a validação de contratos."
    );
  }

  if (findings.some((f) => f.code === "env-key-not-declared")) {
    summary.push(
      "Mantenha .env.example atualizado com todas as variáveis usadas em frontend e backend."
    );
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
    auditFrontendBackendIntegration(findings);
    auditContractStability(findings);
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
  console.log(
    JSON.stringify(
      {
        meta: {
          frontendFiles: frontendFiles.length,
          backendFiles: backendFiles.length,
          totalFindings: findings.length,
        },
        findings,
        summarySuggestions: buildSuggestionsSummary(findings),
      },
      null,
      2
    )
  );
} else {
  printPretty(findings);
}

const hasErrors = findings.some((item) => item.severity === "error");
const hasWarnings = findings.some((item) => item.severity === "warn");

if (hasErrors || (args.strict && hasWarnings)) {
  process.exit(1);
}

process.exit(0);
