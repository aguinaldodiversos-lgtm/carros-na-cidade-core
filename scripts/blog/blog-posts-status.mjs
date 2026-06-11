#!/usr/bin/env node
/**
 * Fase 4.2.1 — Status READ-ONLY de `blog_posts` (handoff de produção).
 *
 * Só executa SELECTs. Serve para capturar o "antes/depois" da adoção sem
 * depender de um cliente `psql` no Shell do Render — usa o mesmo pool/SSL
 * do app (src/infrastructure/database/db.js), então herda a config que já
 * funciona no ambiente em que roda.
 *
 * Uso (raiz do backend, no Shell do serviço Node):
 *   node scripts/blog/blog-posts-status.mjs
 *
 * Imprime:
 *   [A] distribuição de blog_posts por (source, status) — §13.A do plano;
 *   [B] presença atual dos 13 slugs legados alvo (source/status ou ausente);
 *   [C] posts source='cms' já existentes (id, status, published_at, slug) — §13.D.
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";
import { LEGACY_BLOG_POSTS } from "../../src/modules/admin/blog/legacy-blog-seed.js";

function rule() {
  console.log("".padEnd(64, "─"));
}

async function main() {
  // [A] Distribuição source × status (visão geral da tabela compartilhada).
  const dist = await pool.query(
    `SELECT source, status, COUNT(*)::int AS total
       FROM blog_posts
      GROUP BY source, status
      ORDER BY source, status`
  );
  console.log("\n[A] blog_posts por (source, status):");
  rule();
  if (dist.rows.length === 0) {
    console.log("  (tabela vazia)");
  } else {
    for (const r of dist.rows) {
      console.log(
        `  ${String(r.source ?? "NULL").padEnd(8)} ${String(r.status ?? "NULL").padEnd(14)} ${r.total}`
      );
    }
  }

  // [B] Presença atual dos 13 slugs alvo — antecipa o plano do --dry-run.
  const slugs = LEGACY_BLOG_POSTS.map((p) => p.slug);
  const existing = await pool.query(
    `SELECT slug, source, status FROM blog_posts WHERE slug = ANY($1)`,
    [slugs]
  );
  const bySlug = new Map(existing.rows.map((r) => [r.slug, r]));
  console.log(`\n[B] Slugs legados alvo (${slugs.length}):`);
  rule();
  for (const slug of slugs) {
    const row = bySlug.get(slug);
    const state = row ? `${row.source}/${row.status}` : "— ausente —";
    console.log(`  ${slug.padEnd(42)} ${state}`);
  }

  // [C] Posts do CMS já materializados (o que o admin enxergaria).
  const cms = await pool.query(
    `SELECT id, title, slug, status, published_at
       FROM blog_posts
      WHERE source = 'cms'
      ORDER BY updated_at DESC
      LIMIT 30`
  );
  console.log(`\n[C] Posts source='cms' (${cms.rowCount}):`);
  rule();
  if (cms.rows.length === 0) {
    console.log('  (nenhum — o admin mostraria "0 posts")');
  } else {
    for (const r of cms.rows) {
      const pub = r.published_at ? new Date(r.published_at).toISOString().slice(0, 10) : "—";
      console.log(`  #${String(r.id).padEnd(5)} ${String(r.status).padEnd(12)} ${pub}  ${r.slug}`);
    }
  }
  console.log("");
}

try {
  await main();
} catch (err) {
  console.error("[blog-status] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
