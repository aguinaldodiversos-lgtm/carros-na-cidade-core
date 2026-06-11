#!/usr/bin/env node
/**
 * Fase 4.2.1 — Adoção das matérias legadas do blog no CMS.
 *
 * Até a 4.2 os cards do blog público vinham de um array HARDCODED no frontend
 * (frontend/lib/blog/blog-page.ts). Não havia linha em `blog_posts`, então o
 * admin mostrava "0 posts". Este script canoniza essas matérias como posts do
 * CMS (source='cms', status='published'), editáveis pelo painel.
 *
 * Idempotente — `slug` é a chave:
 *   - slug novo               → INSERT.
 *   - slug já é CMS           → SKIP (preserva edições). Use --force para re-adotar.
 *   - slug é de outra origem  → SKIP-CONFLICT (linha do motor SEO; não toca).
 *
 * Uso (raiz do backend):
 *   node scripts/blog/adopt-legacy-blog-posts.mjs --dry-run
 *   node scripts/blog/adopt-legacy-blog-posts.mjs --apply
 *   node scripts/blog/adopt-legacy-blog-posts.mjs --apply --force
 *
 * O admin de auditoria pode ser definido por ADOPT_ADMIN_USER_ID.
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";
import { insertPost, updateById } from "../../src/modules/admin/blog/admin-blog.repository.js";
import { estimateReadingMinutes } from "../../src/modules/admin/blog/admin-blog.service.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import {
  LEGACY_BLOG_POSTS,
  buildAdoptionPlan,
  validateLegacyDataset,
  ADOPTION_TAG,
} from "../../src/modules/admin/blog/legacy-blog-seed.js";

const META_TITLE_MAX = 70;
const META_DESCRIPTION_MAX = 200;

function parseArgs(argv) {
  const set = new Set(argv.slice(2));
  const apply = set.has("--apply");
  const force = set.has("--force");
  // Dry-run é o padrão seguro: só escreve com --apply explícito.
  return { apply, force, dryRun: !apply };
}

/** Campos canônicos do post adotado (sem published_at, que é tratado à parte). */
function baseFields(post, adminUserId) {
  return {
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    cover_image_url: post.coverImage,
    cover_image_alt: post.coverAlt,
    category: post.category,
    // Marca operacional para o time achar/expandir as matérias adotadas.
    tags: post.tags.includes(ADOPTION_TAG) ? post.tags : [...post.tags, ADOPTION_TAG],
    status: "published",
    is_indexable: true,
    meta_title: post.title.slice(0, META_TITLE_MAX),
    meta_description: post.excerpt.slice(0, META_DESCRIPTION_MAX),
    reading_time_minutes: estimateReadingMinutes(post.content),
    updated_by_admin_id: adminUserId,
  };
}

async function loadExistingBySlug(slugs) {
  const { rows } = await pool.query(
    `SELECT id, slug, source, version, status FROM blog_posts WHERE slug = ANY($1)`,
    [slugs]
  );
  const map = new Map();
  for (const row of rows) map.set(row.slug, row);
  return map;
}

function printPlan(plan, counts, { dryRun, force }) {
  console.log("");
  console.log("Fase 4.2.1 — Adoção de matérias legadas do blog");
  console.log(`Modo: ${dryRun ? "DRY-RUN (nenhuma escrita)" : "APPLY"}${force ? " --force" : ""}`);
  console.log("".padEnd(78, "─"));
  for (const item of plan) {
    const tag =
      item.action === "insert"
        ? "＋ INSERT     "
        : item.action === "update"
          ? "↻ UPDATE     "
          : item.action === "skip-conflict"
            ? "⚠ SKIP-CONFL "
            : "· SKIP       ";
    console.log(`${tag} ${item.slug.padEnd(42)} ${item.title}`);
  }
  console.log("".padEnd(78, "─"));
  console.log(
    `Resumo: insert=${counts.insert} update=${counts.update} ` +
      `skip-exists=${counts["skip-exists"]} skip-conflict=${counts["skip-conflict"]}`
  );
  console.log("");
}

async function main() {
  const { apply, force, dryRun } = parseArgs(process.argv);

  const datasetProblems = validateLegacyDataset();
  if (datasetProblems.length > 0) {
    console.error("[adopt] dataset inválido:");
    for (const p of datasetProblems) console.error("  - " + p);
    process.exitCode = 1;
    return;
  }

  const adminUserId = (process.env.ADOPT_ADMIN_USER_ID || "system:adopt-4.2.1").trim();

  const slugs = LEGACY_BLOG_POSTS.map((p) => p.slug);
  const existingBySlug = await loadExistingBySlug(slugs);
  const { plan, counts } = buildAdoptionPlan(LEGACY_BLOG_POSTS, existingBySlug, { force });

  printPlan(plan, counts, { dryRun, force });

  if (dryRun) {
    console.log("Dry-run concluído. Reexecute com --apply para gravar.");
    return;
  }

  const applied = [];
  for (const item of plan) {
    const post = LEGACY_BLOG_POSTS.find((p) => p.slug === item.slug);
    if (item.action === "insert") {
      const fields = {
        ...baseFields(post, adminUserId),
        author_id: adminUserId,
        published_at: new Date(),
      };
      const row = await insertPost(fields);
      applied.push({ slug: item.slug, action: "insert", id: row?.id ?? null });
      console.log(`  inserido: ${item.slug} (id=${row?.id ?? "?"})`);
    } else if (item.action === "update") {
      // Re-adoção (--force): atualiza campos canônicos; preserva published_at.
      const updated = await updateById(item.existingId, baseFields(post, adminUserId), adminUserId);
      applied.push({ slug: item.slug, action: "update", id: updated?.id ?? item.existingId });
      console.log(`  atualizado: ${item.slug} (id=${updated?.id ?? item.existingId})`);
    }
  }

  if (applied.length > 0) {
    // Uma única ação de auditoria resumindo o lote (evita poluir admin_actions).
    await recordAdminAction({
      adminUserId,
      action: "adopt_legacy_blog_posts",
      targetType: "blog_post",
      targetId: "batch",
      oldValue: null,
      newValue: {
        applied: applied.map((a) => ({ slug: a.slug, action: a.action, id: a.id })),
        inserted: counts.insert,
        updated: counts.update,
      },
      reason: "Fase 4.2.1 — adoção de matérias legadas do blog",
    });
    console.log(`\n[adopt] ${applied.length} post(s) gravado(s). Auditoria registrada.`);
  } else {
    console.log("\n[adopt] Nada a gravar (tudo já adotado). Idempotente ✓");
  }
}

try {
  await main();
} catch (err) {
  console.error("[adopt] Falha:", err?.message || err);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
