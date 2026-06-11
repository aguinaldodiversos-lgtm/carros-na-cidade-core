#!/usr/bin/env node
/**
 * Fase 4.3 (§14) — Auditoria SEO/IA do portal.
 *
 * Varre anúncios ativos e posts de blog publicados e reporta problemas que
 * prejudicam a leitura por busca tradicional e IA: anúncios sem preço/cidade/
 * imagem/alt, posts sem meta description, conteúdo curto, slugs duplicados.
 * Também imprime o score SEO/IA médio dos anúncios.
 *
 * Uso (raiz do backend):
 *   node scripts/seo/audit-seo-ai.mjs
 *   node scripts/seo/audit-seo-ai.mjs --json
 *   node scripts/seo/audit-seo-ai.mjs --limit 500
 *
 * Somente leitura — não escreve nada no banco.
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";
import {
  analyzeAds,
  analyzeBlogPosts,
  summarizeProblems,
} from "../../src/modules/admin/seo/seo-ai-audit.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const limIdx = args.indexOf("--limit");
  const limit = limIdx >= 0 ? Math.max(1, Number(args[limIdx + 1]) || 1000) : 1000;
  return { json, limit };
}

async function loadActiveAds(limit) {
  const { rows } = await pool.query(
    `SELECT a.*, c.name AS city_name, c.slug AS city_slug
       FROM ads a
       LEFT JOIN cities c ON c.id = a.city_id
      WHERE a.status = 'active'
      ORDER BY a.updated_at DESC NULLS LAST
      LIMIT $1`,
    [limit]
  );
  return rows;
}

async function loadCmsBlogPosts(limit) {
  // Só posts do CMS (source='cms'); ignora o conteúdo do motor de SEO.
  const { rows } = await pool.query(
    `SELECT id, slug, status, content, excerpt, meta_description, cover_image_url
       FROM blog_posts
      WHERE source = 'cms'
      ORDER BY updated_at DESC NULLS LAST
      LIMIT $1`,
    [limit]
  );
  return rows;
}

function printHuman(ads, blog, summary) {
  console.log("\n=== Auditoria SEO/IA — Carros na Cidade ===\n");
  console.log(`Anúncios ativos analisados: ${ads.total}`);
  console.log(`  Score SEO/IA médio: ${ads.avg_score}/100`);
  console.log(`  Prontos para busca/IA (80+): ${ads.ready_80_plus}`);
  console.log(`Posts de blog (CMS): ${blog.total} (publicados: ${blog.published})`);
  console.log(
    `\nProblemas: ${summary.total} (alta: ${summary.high}, média: ${summary.medium}, baixa: ${summary.low})\n`
  );

  const groups = {};
  for (const p of [...ads.problems, ...blog.problems]) {
    groups[p.kind] = (groups[p.kind] || 0) + 1;
  }
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  for (const [kind, count] of sorted) {
    console.log(`  ${String(count).padStart(5)}  ${kind}`);
  }
  console.log("");
}

async function main() {
  const { json, limit } = parseArgs(process.argv);
  const [adsRows, blogRows] = await Promise.all([loadActiveAds(limit), loadCmsBlogPosts(limit)]);

  const ads = analyzeAds(adsRows);
  const blog = analyzeBlogPosts(blogRows);
  const summary = summarizeProblems(ads.problems, blog.problems);

  if (json) {
    console.log(JSON.stringify({ ads, blog, summary }, null, 2));
  } else {
    printHuman(ads, blog, summary);
  }
}

try {
  await main();
} catch (err) {
  console.error("[audit-seo-ai] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
