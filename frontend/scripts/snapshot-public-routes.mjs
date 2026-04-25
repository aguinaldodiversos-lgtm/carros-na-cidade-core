#!/usr/bin/env node
/**
 * snapshot-public-routes.mjs
 *
 * PR B — Testes de proteção (DIAGNOSTICO_REDESIGN.md §8.2).
 *
 * Captura snapshot de metadata pública de uma lista fixa de URLs.
 * Saída: JSON em tests/snapshots/public-routes-<timestamp>.json.
 *
 * Uso:
 *   node frontend/scripts/snapshot-public-routes.mjs --base=https://carrosnacidade.com
 *   node frontend/scripts/snapshot-public-routes.mjs --base=http://localhost:3000 --label=before-PR-G
 *
 * Não requer dependências externas. Usa apenas APIs do Node 20+.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// --- Configuração: lista fixa de URLs a capturar ---------------------------
//
// Esta lista representa o conjunto mínimo de páginas públicas críticas para
// SEO. Se uma URL nova é adicionada como "intocável" no diagnóstico §5,
// adicionar aqui. Tamanho-alvo: 30-50 URLs.
//
// As URLs com placeholder <cidade>, <slug>, <state> são expandidas via
// CITY_SAMPLES, VEHICLE_SLUG_SAMPLE, STATE_SAMPLES abaixo.
const URLS_TEMPLATE = [
  // Home
  { path: "/", label: "home" },

  // Listagem canônica
  { path: "/anuncios", label: "anuncios-canonical" },

  // Territorial profundidade 1
  { path: "/cidade/<cidade>", label: "cidade" },

  // Territorial profundidade 2 (com marca)
  { path: "/cidade/<cidade>/marca/honda", label: "cidade-marca" },

  // Territorial profundidade 3 (cidade + marca + modelo)
  { path: "/cidade/<cidade>/marca/honda/modelo/civic", label: "cidade-marca-modelo" },

  // Variantes territoriais
  { path: "/cidade/<cidade>/oportunidades", label: "cidade-oportunidades" },
  { path: "/cidade/<cidade>/abaixo-da-fipe", label: "cidade-abaixo-fipe" },

  // Aliases /comprar/* (verificar canonical/redirect)
  { path: "/comprar/cidade/<cidade>", label: "comprar-cidade-alias" },
  { path: "/comprar/estado/<state>", label: "comprar-estado" },

  // SEO de palavra-chave
  { path: "/carros-em/<cidade>", label: "carros-em" },
  { path: "/carros-baratos-em/<cidade>", label: "carros-baratos-em" },
  { path: "/carros-automaticos-em/<cidade>", label: "carros-automaticos-em" },

  // Detalhe (slug real exigido — se vazio, o item é pulado com warning)
  { path: "/veiculo/<slug>", label: "veiculo-detalhe" },

  // Conteúdo / iscas
  { path: "/blog", label: "blog-index" },
  { path: "/blog/<cidade>", label: "blog-cidade" },
  { path: "/tabela-fipe", label: "tabela-fipe-root" },
  { path: "/tabela-fipe/<cidade>", label: "tabela-fipe-cidade" },
  { path: "/simulador-financiamento", label: "simulador-root" },
  { path: "/simulador-financiamento/<cidade>", label: "simulador-cidade" },
  { path: "/planos", label: "planos" },

  // Institucionais
  { path: "/sobre", label: "sobre" },
  { path: "/como-funciona", label: "como-funciona" },
  { path: "/contato", label: "contato" },
  { path: "/ajuda", label: "ajuda" },
  { path: "/seguranca", label: "seguranca" },
  { path: "/politica-de-privacidade", label: "politica-privacidade" },
  { path: "/termos-de-uso", label: "termos" },
  { path: "/lgpd", label: "lgpd" },

  // Auth (tem metadata pública, é indexável)
  { path: "/login", label: "login" },
  { path: "/cadastro", label: "cadastro" },
  { path: "/recuperar-senha", label: "recuperar-senha" },

  // Sitemaps (validar que geram)
  { path: "/sitemap.xml", label: "sitemap-index", expectedContentType: "xml" },
  { path: "/sitemaps/core.xml", label: "sitemap-core", expectedContentType: "xml" },
  { path: "/sitemaps/cities.xml", label: "sitemap-cities", expectedContentType: "xml" },
  { path: "/sitemaps/brands.xml", label: "sitemap-brands", expectedContentType: "xml" },
  { path: "/sitemaps/models.xml", label: "sitemap-models", expectedContentType: "xml" },
  { path: "/sitemaps/content.xml", label: "sitemap-content", expectedContentType: "xml" },
  { path: "/sitemaps/below-fipe.xml", label: "sitemap-below-fipe", expectedContentType: "xml" },
  { path: "/sitemaps/opportunities.xml", label: "sitemap-opportunities", expectedContentType: "xml" },
  { path: "/sitemaps/local-seo.xml", label: "sitemap-local-seo", expectedContentType: "xml" },
  { path: "/robots.txt", label: "robots", expectedContentType: "text" },
];

const CITY_SAMPLES = ["atibaia-sp", "campinas-sp", "sao-paulo-sp"];
const STATE_SAMPLES = ["sp"];
// Vazio = pular itens com <slug>. Pode ser preenchido via env: VEHICLE_SLUG_SAMPLE
const VEHICLE_SLUG_SAMPLE = process.env.VEHICLE_SLUG_SAMPLE || "";

// --- Argv parsing ----------------------------------------------------------
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--")) {
      const [k, ...rest] = a.slice(2).split("=");
      args[k] = rest.length ? rest.join("=") : true;
    }
  }
  return args;
}

const args = parseArgs();
const BASE_URL = (args.base || process.env.SNAPSHOT_BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const LABEL = args.label || `snapshot-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const OUTPUT_DIR = resolve(REPO_ROOT, "tests/snapshots");
const TIMEOUT_MS = Number(args.timeout || process.env.SNAPSHOT_TIMEOUT_MS || 30_000);
const MAX_PARALLEL = Number(args.parallel || 6);

// --- Expansão de URLs ------------------------------------------------------
function expandUrls(template) {
  const expanded = [];
  for (const item of template) {
    if (item.path.includes("<cidade>")) {
      for (const city of CITY_SAMPLES) {
        expanded.push({
          ...item,
          path: item.path.replace("<cidade>", city),
          label: `${item.label}__${city}`,
          variableExpanded: { cidade: city },
        });
      }
    } else if (item.path.includes("<state>")) {
      for (const state of STATE_SAMPLES) {
        expanded.push({
          ...item,
          path: item.path.replace("<state>", state),
          label: `${item.label}__${state}`,
          variableExpanded: { state },
        });
      }
    } else if (item.path.includes("<slug>")) {
      if (VEHICLE_SLUG_SAMPLE) {
        expanded.push({
          ...item,
          path: item.path.replace("<slug>", VEHICLE_SLUG_SAMPLE),
          label: `${item.label}__${VEHICLE_SLUG_SAMPLE}`,
          variableExpanded: { slug: VEHICLE_SLUG_SAMPLE },
        });
      } else {
        expanded.push({
          ...item,
          path: null,
          label: item.label,
          skipped: true,
          skipReason: "VEHICLE_SLUG_SAMPLE não definido",
        });
      }
    } else {
      expanded.push(item);
    }
  }
  return expanded;
}

// --- HTML extraction (regex-based, dependency-free) ------------------------
function extractMetadata(html) {
  const meta = {
    title: null,
    description: null,
    canonical: null,
    robots: null,
    og_image: null,
    og_url: null,
    twitter_card: null,
    h1_count: 0,
    h1_first: null,
    breadcrumb_jsonld_present: false,
    jsonld_types: [],
    internal_links_count: 0,
    html_size_bytes: html.length,
  };

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();

  const descMatch = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (descMatch) meta.description = descMatch[1].trim();

  const canonicalMatch = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/i
  );
  if (canonicalMatch) meta.canonical = canonicalMatch[1].trim();

  const robotsMatch = html.match(
    /<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (robotsMatch) meta.robots = robotsMatch[1].trim();

  const ogImageMatch = html.match(
    /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (ogImageMatch) meta.og_image = ogImageMatch[1].trim();

  const ogUrlMatch = html.match(
    /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (ogUrlMatch) meta.og_url = ogUrlMatch[1].trim();

  const twitterCardMatch = html.match(
    /<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );
  if (twitterCardMatch) meta.twitter_card = twitterCardMatch[1].trim();

  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  meta.h1_count = h1Matches.length;
  if (h1Matches[0]) {
    meta.h1_first = h1Matches[0]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  }

  // JSON-LD: extrair todos os scripts type=application/ld+json
  const jsonldRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = jsonldRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object" && item["@type"]) {
          const t = Array.isArray(item["@type"]) ? item["@type"].join(",") : String(item["@type"]);
          meta.jsonld_types.push(t);
          if (t.toLowerCase().includes("breadcrumb")) {
            meta.breadcrumb_jsonld_present = true;
          }
        }
      }
    } catch {
      // JSON inválido — ignora silenciosamente
    }
  }

  // Internal links count (href que começa com / e não //)
  const linkMatches = html.match(/<a[^>]*href=["']\/[^/"'][^"']*["']/gi) || [];
  meta.internal_links_count = linkMatches.length;

  return meta;
}

// --- Fetch único -----------------------------------------------------------
async function captureUrl(target, baseUrl) {
  const url = baseUrl + target.path;
  const startedAt = Date.now();
  const result = {
    label: target.label,
    path: target.path,
    url,
    captured_at: new Date().toISOString(),
    skipped: false,
    error: null,
    status: null,
    redirected_to: null,
    server_timing_total_ms: null,
    content_type: null,
    metadata: null,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "carros-na-cidade-snapshot/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    result.status = res.status;
    result.server_timing_total_ms = Date.now() - startedAt;
    result.content_type = res.headers.get("content-type") || null;

    // Capturar redirect
    if (res.status >= 300 && res.status < 400) {
      result.redirected_to = res.headers.get("location") || null;
      return result;
    }

    if (target.expectedContentType === "xml" || target.expectedContentType === "text") {
      // Para sitemaps e robots, não extrair metadata HTML — apenas validar status
      const text = await res.text();
      result.metadata = {
        body_size_bytes: text.length,
        starts_with: text.slice(0, 80).replace(/\s+/g, " ").trim(),
      };
      return result;
    }

    if (!result.content_type || !result.content_type.includes("text/html")) {
      result.error = `Content-Type inesperado: ${result.content_type}`;
      return result;
    }

    const html = await res.text();
    result.metadata = extractMetadata(html);
  } catch (err) {
    result.error = err.message || String(err);
  }
  return result;
}

// --- Pool com paralelismo controlado ---------------------------------------
async function captureAll(urls, baseUrl, parallel) {
  const queue = [...urls];
  const out = [];
  const workers = Array.from({ length: parallel }, async () => {
    while (queue.length) {
      const target = queue.shift();
      if (target.skipped) {
        out.push({
          label: target.label,
          path: target.path,
          url: null,
          captured_at: new Date().toISOString(),
          skipped: true,
          skip_reason: target.skipReason,
        });
        continue;
      }
      const result = await captureUrl(target, baseUrl);
      out.push(result);
      console.log(
        `[${result.status ?? "ERR"}] ${result.path} ${
          result.error ? `— ${result.error}` : ""
        }`
      );
    }
  });
  await Promise.all(workers);
  return out;
}

// --- Main ------------------------------------------------------------------
async function main() {
  console.log(`📸 Snapshot público — base=${BASE_URL}, label=${LABEL}`);
  const expanded = expandUrls(URLS_TEMPLATE);
  console.log(`Total: ${expanded.length} URLs (${expanded.filter((u) => u.skipped).length} skipped)`);

  const startedAt = Date.now();
  const results = await captureAll(expanded, BASE_URL, MAX_PARALLEL);

  const summary = {
    label: LABEL,
    base_url: BASE_URL,
    started_at: new Date(startedAt).toISOString(),
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - startedAt,
    total: results.length,
    captured: results.filter((r) => !r.skipped && !r.error).length,
    errors: results.filter((r) => r.error).length,
    skipped: results.filter((r) => r.skipped).length,
    redirected: results.filter((r) => r.redirected_to).length,
    results,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = resolve(OUTPUT_DIR, `${LABEL}.json`);
  await writeFile(outputPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`\n✅ Salvo em ${outputPath}`);
  console.log(
    `📊 ${summary.captured} ok / ${summary.errors} erros / ${summary.skipped} skipped / ${summary.redirected} redirect`
  );

  if (summary.errors > 0 && args.fail_on_error !== "false") {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Falha fatal:", err);
  process.exit(2);
});
