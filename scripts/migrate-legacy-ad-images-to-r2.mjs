#!/usr/bin/env node
/**
 * Migração idempotente: imagens legadas `/uploads/ads/...` → Cloudflare R2.
 *
 * FONTE DE VERDADE (pós-migração):
 *   1. `vehicle_images.storage_key`  → verdade binária no R2
 *   2. `vehicle_images.image_url`    → metadado/URL pública
 *   3. `ads.images`                  → lista pública canônica (frontend)
 *   4. `/uploads/ads/...`            → legado, não prioritário
 *
 * USO:
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --audit
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs                          # dry-run
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --execute
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --execute --limit=50
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --execute --ad-id=123
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --execute --report-dir=./reports/migration
 *   node scripts/migrate-legacy-ad-images-to-r2.mjs --execute --uploads-root=/mnt/backup/uploads
 *
 * VARIÁVEIS DE AMBIENTE:
 *   DATABASE_URL        (obrigatório)
 *   UPLOADS_ROOT        (opcional — diretório local com uploads/)
 *   SOURCE_BASE_URL     (opcional — GET do ficheiro legado via HTTP/backup)
 *   R2_*                (obrigatórias em --execute)
 *
 * PLANO DE ROLLOUT SEGURO:
 *
 *   Fase 1 — Auditoria:
 *     npm run migrate:legacy-ad-images -- --audit --report-dir=./reports/migration
 *     → Classifica todos os anúncios: ok, already_migrated, migratable, orphan, inconsistent
 *     → Gera relatório JSON com órfãos, razões e ações sugeridas
 *
 *   Fase 2 — Dry-run:
 *     npm run migrate:legacy-ad-images -- --report-dir=./reports/migration
 *     → Simula a migração sem gravar nada no DB/R2
 *     → Mostra quantos seriam migrados e quantos ficariam órfãos
 *
 *   Fase 3 — Execução em staging:
 *     DATABASE_URL=$STAGING_DB npm run migrate:legacy-ad-images -- --execute --report-dir=./reports/staging
 *     → Grava snapshot de rollback antes de alterar qualquer dado
 *     → Faz upload para R2 e atualiza DB dentro de transação
 *
 *   Fase 4 — Execução em produção:
 *     npm run migrate:legacy-ad-images -- --execute --report-dir=./reports/production
 *     → Mesmo processo, com snapshot de rollback automático
 *
 *   Fase 5 — Validação manual:
 *     → Verificar /comprar, detalhe de anúncios, home
 *     → Inspecionar X-Vehicle-Images-Source header nas imagens
 *     → Validar relatório JSON gerado
 *
 *   Fase 6 — Desligar legado gradualmente:
 *     → Definir PUBLIC_EMIT_LEGACY_IMAGE_PROXY=false em produção
 *     → Monitorar logs por 7 dias (fallback placeholder inesperado)
 *     → Se estável: remover referências /uploads/ads do codebase
 *
 * FLAG DE TRANSIÇÃO:
 *   PUBLIC_EMIT_LEGACY_IMAGE_PROXY=true
 *     → Quando: durante a janela de transição pós-migração
 *     → Duração recomendada: até 14 dias após migração bem-sucedida
 *     → Remover quando: 100% dos anúncios migrável estiverem no R2
 */

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { closeDatabasePool, pool, withTransaction } from "../src/infrastructure/database/db.js";
import { getR2Config, uploadVehicleImage } from "../src/infrastructure/storage/r2.service.js";
import { buildCanonicalImageUrlFromStorageKey } from "../src/modules/ads/ads.public-images.js";
import {
  classifyAdImageState,
  fileLikeFromBuffer,
  guessMimeFromFilename,
  isLegacyUploadPathString,
  normalizeLegacyUploadPath,
  parseImagesJson,
  resolveLegacyFileOnDisk,
  suggestOrphanAction,
} from "./lib/legacy-ad-image-migration.mjs";

let cachedViSchema = null;

async function getVehicleImagesSchema() {
  if (cachedViSchema !== null) return cachedViSchema;

  const { rows } = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vehicle_images'
    `
  );

  cachedViSchema =
    rows.length === 0 ? null : new Set(rows.map((r) => String(r.column_name || "").trim()));
  return cachedViSchema;
}

function parseArgs(argv) {
  const args = {
    audit: false,
    execute: false,
    limit: 500,
    adId: null,
    reportDir: "",
    uploadsRootExtra: [],
  };

  for (const raw of argv) {
    if (raw === "--audit") args.audit = true;
    else if (raw === "--execute") args.execute = true;
    else if (raw.startsWith("--limit="))
      args.limit = Math.max(1, Number.parseInt(raw.split("=")[1], 10) || 500);
    else if (raw.startsWith("--ad-id=")) args.adId = Number.parseInt(raw.split("=")[1], 10);
    else if (raw.startsWith("--report-dir="))
      args.reportDir = path.resolve(raw.split("=").slice(1).join("="));
    else if (raw.startsWith("--uploads-root="))
      args.uploadsRootExtra.push(path.resolve(raw.split("=").slice(1).join("=")));
  }

  return args;
}

async function fetchVehicleImageRowsForAd(adId) {
  const schema = await getVehicleImagesSchema();
  if (!schema?.has("ad_id")) return [];

  const imageUrlCol = schema.has("image_url") ? "image_url" : "NULL::text AS image_url";
  const storageKeyCol = schema.has("storage_key") ? "storage_key" : "NULL::text AS storage_key";
  const idCol = schema.has("id") ? "id" : "NULL::bigint AS id";

  const { rows } = await pool.query(
    `
      SELECT ${idCol} AS id, ${imageUrlCol}, ${storageKeyCol}
      FROM public.vehicle_images
      WHERE ad_id = $1
      ORDER BY id ASC NULLS LAST
    `,
    [adId]
  );

  return rows;
}

async function findExistingKeyForLegacyPath(adId, legacyPath) {
  const schema = await getVehicleImagesSchema();
  if (!schema?.has("ad_id") || !schema.has("storage_key")) return null;

  const norm = normalizeLegacyUploadPath(legacyPath);
  if (!norm) return null;

  const { rows } = await pool.query(
    `
      SELECT storage_key, image_url
      FROM public.vehicle_images
      WHERE ad_id = $1
        AND storage_key IS NOT NULL
        AND btrim(storage_key) <> ''
        AND (image_url = $2 OR image_url = $3)
      LIMIT 1
    `,
    [adId, norm, norm.replace(/^\//, "")]
  );

  if (rows[0]?.storage_key) {
    return { storageKey: String(rows[0].storage_key).trim() };
  }

  return null;
}

async function readLegacyBinary(legacyPath, extraRoots) {
  const diskPath = resolveLegacyFileOnDisk(legacyPath, extraRoots);
  if (diskPath) {
    const buf = await fs.promises.readFile(diskPath);
    return { buffer: buf, source: `disk:${diskPath}` };
  }

  const base = process.env.SOURCE_BASE_URL?.trim();
  if (base) {
    try {
      const norm = normalizeLegacyUploadPath(legacyPath);
      const u = new URL(norm, base.endsWith("/") ? base : `${base}/`);
      const res = await fetch(u, { method: "GET", redirect: "follow" });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return { buffer: Buffer.from(ab), source: `remote:${u.toString()}` };
    } catch {
      return null;
    }
  }

  return null;
}

function canonicalUrlFromUpload(upload) {
  if (upload.publicUrl) return upload.publicUrl;
  return buildCanonicalImageUrlFromStorageKey(upload.key);
}

async function upsertVehicleImageRow(
  client,
  { adId, legacyPath, storageKey, canonicalUrl, sortIndex, isCover }
) {
  const schema = await getVehicleImagesSchema();
  if (!schema?.has("ad_id")) return { attempted: false };

  const normLegacy = normalizeLegacyUploadPath(legacyPath);
  const hasSort = schema.has("sort_order");
  const hasCover = schema.has("is_cover");
  const hasCreated = schema.has("created_at");

  const { rows: matchRows } = await client.query(
    `
      SELECT id, image_url, storage_key
      FROM public.vehicle_images
      WHERE ad_id = $1
        AND (image_url = $2 OR image_url = $3)
      LIMIT 10
    `,
    [adId, normLegacy, normLegacy.replace(/^\//, "")]
  );

  const row =
    matchRows.find((r) => !r.storage_key || String(r.storage_key).trim() === "") || matchRows[0];

  if (row?.id != null) {
    await client.query(
      `
        UPDATE public.vehicle_images
        SET storage_key = $2,
            image_url = COALESCE($3, image_url)
        WHERE id = $1
      `,
      [row.id, storageKey, canonicalUrl]
    );
    return { attempted: true, action: "updated", id: row.id };
  }

  const cols = ["ad_id"];
  const vals = ["$1"];
  const params = [adId];
  let pi = 2;

  if (schema.has("image_url")) {
    cols.push("image_url");
    vals.push(`$${pi++}`);
    params.push(canonicalUrl);
  }
  if (schema.has("storage_key")) {
    cols.push("storage_key");
    vals.push(`$${pi++}`);
    params.push(storageKey);
  }
  if (hasSort) {
    cols.push("sort_order");
    vals.push(`$${pi++}`);
    params.push(sortIndex);
  }
  if (hasCover) {
    cols.push("is_cover");
    vals.push(`$${pi++}`);
    params.push(isCover);
  }
  if (hasCreated) {
    cols.push("created_at");
    vals.push(`NOW()`);
  }

  await client.query(
    `INSERT INTO public.vehicle_images (${cols.join(", ")}) VALUES (${vals.join(", ")})`,
    params
  );

  return { attempted: true, action: "inserted" };
}

function buildCandidateWhere(filterAdId) {
  const params = [];
  const where = [
    `a.status != 'deleted'`,
    `a.images IS NOT NULL`,
    `jsonb_typeof(a.images) = 'array'`,
  ];

  const legacyJson = `
    EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(a.images) img
      WHERE img ILIKE '/uploads/ads/%' OR img ILIKE 'uploads/ads/%'
    )
  `;

  if (filterAdId != null && Number.isInteger(filterAdId) && filterAdId > 0) {
    params.push(filterAdId);
    where.push(`a.id = $${params.length}`);
  }

  return { where: `${where.join(" AND ")} AND (${legacyJson})`, params };
}

async function loadCandidateAds(limit, filterAdId) {
  const { where, params } = buildCandidateWhere(filterAdId);
  params.push(limit);

  const { rows } = await pool.query(
    `
      SELECT a.id, a.slug, a.title, a.images, a.updated_at
      FROM ads a
      WHERE ${where}
      ORDER BY a.id ASC
      LIMIT $${params.length}
    `,
    params
  );

  return rows;
}

async function loadAdsWithLegacyVehicleImages(limit, filterAdId) {
  const schema = await getVehicleImagesSchema();
  if (!schema?.has("ad_id") || !schema.has("image_url")) return [];

  const params = [];
  const parts = [
    `a.status != 'deleted'`,
    `EXISTS (
       SELECT 1 FROM public.vehicle_images vi
       WHERE vi.ad_id = a.id
         AND vi.image_url IS NOT NULL
         AND (vi.image_url ILIKE '%/uploads/ads/%' OR vi.image_url ILIKE '%uploads/ads/%')
     )`,
  ];

  if (filterAdId != null && Number.isInteger(filterAdId) && filterAdId > 0) {
    params.push(filterAdId);
    parts.push(`a.id = $${params.length}`);
  }

  params.push(limit);

  const { rows } = await pool.query(
    `
      SELECT a.id, a.slug, a.title, a.images, a.updated_at
      FROM ads a
      WHERE ${parts.join(" AND ")}
      ORDER BY a.id ASC
      LIMIT $${params.length}
    `,
    params
  );

  return rows;
}

async function mergeUniqueAdsById(rowsA, rowsB) {
  const map = new Map();
  for (const r of rowsA) map.set(Number(r.id), r);
  for (const r of rowsB) {
    if (!map.has(Number(r.id))) map.set(Number(r.id), r);
  }
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

export async function runAudit({ limit = 500, adId = null, extraRoots = [] } = {}) {
  const [fromJson, fromVi] = await Promise.all([
    loadCandidateAds(limit, adId),
    loadAdsWithLegacyVehicleImages(limit, adId),
  ]);

  const ads = await mergeUniqueAdsById(fromJson, fromVi);
  const vehicleImagesByAdId = new Map();

  for (const ad of ads) {
    vehicleImagesByAdId.set(Number(ad.id), await fetchVehicleImageRowsForAd(ad.id));
  }

  const categories = {
    ok: 0,
    already_migrated: 0,
    migratable: 0,
    orphan: 0,
    inconsistent: 0,
  };

  const summary = {
    adsScanned: ads.length,
    alreadyCorrect: 0,
    legacyDependent: 0,
    binaryAvailable: 0,
    orphanCount: 0,
  };

  const details = [];
  const orphans = [];

  for (const ad of ads) {
    const rawImages = parseImagesJson(ad.images);
    const vehicleRows = vehicleImagesByAdId.get(Number(ad.id)) || [];
    const hasLegacyInAdsJson = rawImages.some((u) => isLegacyUploadPathString(u));
    const hasLegacyInVehicleImageUrl = vehicleRows.some((r) =>
      isLegacyUploadPathString(r.image_url || "")
    );
    const hasStorageKeyInVehicleImages = vehicleRows.some(
      (r) => r.storage_key && String(r.storage_key).trim() !== ""
    );

    const legacyPaths = rawImages.filter((u) => isLegacyUploadPathString(u));
    const legacyViPaths = vehicleRows
      .filter((r) => isLegacyUploadPathString(r.image_url || ""))
      .map((r) => r.image_url);
    const allLegacy = [...new Set([...legacyPaths, ...legacyViPaths])];

    let hasBinaryAvailable = undefined;
    const fileChecks = [];

    if (allLegacy.length > 0) {
      let anyAvailable = false;
      let anyMissing = false;

      for (const leg of allLegacy) {
        const localPath = resolveLegacyFileOnDisk(leg, extraRoots);
        const available = localPath !== null;
        if (available) anyAvailable = true;
        else anyMissing = true;

        fileChecks.push({
          legacyPath: leg,
          localPath,
          available,
        });

        if (!available) {
          const mime = guessMimeFromFilename(leg);
          const reason = !mime ? "unsupported_extension" : "file_not_found";
          orphans.push({
            adId: ad.id,
            slug: ad.slug,
            legacyPath: normalizeLegacyUploadPath(leg),
            reason,
            suggestedAction: suggestOrphanAction(reason),
          });
        }
      }

      hasBinaryAvailable = anyAvailable && !anyMissing ? true : anyAvailable ? true : false;
      if (anyAvailable) summary.binaryAvailable += 1;
    }

    const cat = classifyAdImageState({
      hasStorageKeyInVehicleImages,
      hasLegacyInAdsJson,
      hasLegacyInVehicleImageUrl,
      hasBinaryAvailable,
    });

    if (categories[cat] !== undefined) categories[cat] += 1;

    if (cat === "ok" || cat === "already_migrated") summary.alreadyCorrect += 1;
    if (cat === "migratable" || cat === "orphan" || cat === "inconsistent")
      summary.legacyDependent += 1;
    if (cat === "orphan") summary.orphanCount += 1;

    details.push({
      adId: ad.id,
      slug: ad.slug,
      category: cat,
      rawImages,
      vehicleRows: vehicleRows.map((r) => ({
        id: r.id,
        image_url: r.image_url,
        storage_key: r.storage_key,
      })),
      fileChecks,
    });
  }

  summary.orphanCount = orphans.length;

  return { categories, summary, details, orphans };
}

/**
 * Migra um anúncio: substitui entradas legadas em `ads.images` por URLs canônicas
 * e grava `vehicle_images` quando a tabela existir.
 */
export async function migrateAdRow(adRow, { execute, extraRoots, report }) {
  const adId = Number(adRow.id);
  const rawImages = parseImagesJson(adRow.images);
  const newImages = [...rawImages];
  const vehicleId = `ad-${adId}`;
  const vehicleRows = await fetchVehicleImageRowsForAd(adId);

  const dbOps = [];
  const pendingViUpdates = [];

  for (let i = 0; i < newImages.length; i++) {
    const u = newImages[i];
    if (!isLegacyUploadPathString(u)) continue;

    const existing = await findExistingKeyForLegacyPath(adId, u);
    if (existing?.storageKey) {
      const canon = buildCanonicalImageUrlFromStorageKey(existing.storageKey);
      if (canon && canon !== u) {
        newImages[i] = canon;
        report.items.push({
          adId,
          legacyPath: u,
          action: "rewritten_from_db_storage_key",
          canonical: canon,
        });
      } else {
        report.items.push({ adId, legacyPath: u, action: "noop_already_canonical_in_json" });
      }
      continue;
    }

    const bin = await readLegacyBinary(u, extraRoots);
    if (!bin) {
      const reason = process.env.SOURCE_BASE_URL?.trim() ? "source_unreachable" : "file_not_found";
      report.orphans.push({
        adId,
        legacyPath: normalizeLegacyUploadPath(u),
        reason,
        suggestedAction: suggestOrphanAction(reason),
      });
      report.items.push({ adId, legacyPath: u, action: "orphan", reason });
      continue;
    }

    const baseName = path.basename(normalizeLegacyUploadPath(u));
    const mime = guessMimeFromFilename(baseName);
    if (!mime) {
      const reason = "unsupported_extension";
      report.orphans.push({
        adId,
        legacyPath: normalizeLegacyUploadPath(u),
        reason,
        suggestedAction: suggestOrphanAction(reason),
      });
      report.items.push({ adId, legacyPath: u, action: "orphan", reason });
      continue;
    }

    if (!execute) {
      report.items.push({ adId, legacyPath: u, action: "would_upload", source: bin.source });
      continue;
    }

    const file = fileLikeFromBuffer(bin.buffer, mime, baseName);
    const upload = await uploadVehicleImage({
      vehicleId,
      file,
      variant: "original",
      sortOrder: i,
      isCover: i === 0,
      uploadedByUserId: null,
    });

    const canon = canonicalUrlFromUpload(upload);
    newImages[i] = canon;

    dbOps.push({
      legacyPath: u,
      storageKey: upload.key,
      canonicalUrl: canon,
      sortIndex: i,
      isCover: i === 0,
    });

    report.items.push({
      adId,
      legacyPath: u,
      action: "uploaded",
      storageKey: upload.key,
      canonical: canon,
      source: bin.source,
    });
  }

  let viSort = 0;
  for (const vr of vehicleRows) {
    const leg = vr.image_url ? String(vr.image_url).trim() : "";
    if (!isLegacyUploadPathString(leg)) continue;
    if (vr.storage_key && String(vr.storage_key).trim() !== "") continue;
    if (!vr.id) continue;

    const bin = await readLegacyBinary(leg, extraRoots);
    if (!bin) {
      const reason = "vehicle_images_row_file_not_found";
      report.orphans.push({
        adId,
        legacyPath: normalizeLegacyUploadPath(leg),
        reason,
        suggestedAction: suggestOrphanAction(reason),
        vehicleImageRowId: vr.id,
      });
      report.items.push({
        adId,
        legacyPath: leg,
        action: "orphan_vehicle_images_row",
        rowId: vr.id,
        reason,
      });
      continue;
    }

    const baseName = path.basename(normalizeLegacyUploadPath(leg));
    const mime = guessMimeFromFilename(baseName);
    if (!mime) {
      const reason = "unsupported_extension";
      report.orphans.push({
        adId,
        legacyPath: normalizeLegacyUploadPath(leg),
        reason,
        suggestedAction: suggestOrphanAction(reason),
        vehicleImageRowId: vr.id,
      });
      continue;
    }

    if (!execute) {
      report.items.push({
        adId,
        legacyPath: leg,
        action: "would_upload_vehicle_images_row",
        rowId: vr.id,
        source: bin.source,
      });
      continue;
    }

    const file = fileLikeFromBuffer(bin.buffer, mime, baseName);
    const upload = await uploadVehicleImage({
      vehicleId,
      file,
      variant: "original",
      sortOrder: viSort,
      isCover: false,
      uploadedByUserId: null,
    });
    viSort += 1;

    const canon = canonicalUrlFromUpload(upload);
    pendingViUpdates.push({ id: vr.id, storageKey: upload.key, canonicalUrl: canon });

    for (let j = 0; j < newImages.length; j++) {
      if (normalizeLegacyUploadPath(newImages[j]) === normalizeLegacyUploadPath(leg)) {
        newImages[j] = canon;
      }
    }

    report.items.push({
      adId,
      legacyPath: leg,
      action: "uploaded_vehicle_images_row",
      rowId: vr.id,
      storageKey: upload.key,
      canonical: canon,
      source: bin.source,
    });
  }

  const jsonChanged = JSON.stringify(rawImages) !== JSON.stringify(newImages);
  const needsDbWrite = jsonChanged || dbOps.length > 0 || pendingViUpdates.length > 0;

  if (execute && needsDbWrite) {
    await withTransaction(async (tx) => {
      for (const op of dbOps) {
        await upsertVehicleImageRow(tx.query.bind(tx), {
          adId,
          legacyPath: op.legacyPath,
          storageKey: op.storageKey,
          canonicalUrl: op.canonicalUrl,
          sortIndex: op.sortIndex,
          isCover: op.isCover,
        });
      }

      for (const pv of pendingViUpdates) {
        await tx.query(
          `UPDATE public.vehicle_images SET storage_key = $2, image_url = $3 WHERE id = $1`,
          [pv.id, pv.storageKey, pv.canonicalUrl]
        );
      }

      if (jsonChanged) {
        await tx.query(`UPDATE ads SET images = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
          adId,
          JSON.stringify(newImages),
        ]);
      }
    });

    report.summary.migratedAds += 1;
  } else if (!execute) {
    const wouldChange =
      jsonChanged ||
      report.items.some((it) => it.adId === adId && /^would_/.test(String(it.action)));
    if (wouldChange) report.summary.wouldMigrateAds += 1;
  }

  return { rawImages, newImages, jsonChanged };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("[migrate-legacy-ad-images] Defina DATABASE_URL.");
    process.exit(1);
  }

  if (args.execute) {
    try {
      getR2Config();
    } catch (e) {
      console.error(
        "[migrate-legacy-ad-images] R2 não configurado. --execute requer R2_* no ambiente.",
        e?.message || e
      );
      process.exit(1);
    }
  }

  const report = {
    startedAt: new Date().toISOString(),
    dryRun: !args.execute,
    summary: {
      adsScanned: 0,
      migratedAds: 0,
      wouldMigrateAds: 0,
      imagesUpdated: 0,
    },
    orphans: [],
    items: [],
  };

  if (args.audit) {
    const audit = await runAudit({
      limit: args.limit,
      adId: args.adId,
      extraRoots: args.uploadsRootExtra,
    });
    console.log("\n[migrate-legacy-ad-images] ═══ RELATÓRIO DE AUDITORIA ═══\n");
    console.log("Categorias:");
    console.table(audit.categories);
    console.log("\nResumo:");
    console.log(`  anúncios escaneados:       ${audit.summary.adsScanned}`);
    console.log(`  já corretos:               ${audit.summary.alreadyCorrect}`);
    console.log(`  dependentes de legado:     ${audit.summary.legacyDependent}`);
    console.log(`  com binário disponível:    ${audit.summary.binaryAvailable}`);
    console.log(`  órfãos (sem binário):      ${audit.summary.orphanCount}`);

    if (audit.orphans.length > 0) {
      console.log("\nÓrfãos:");
      for (const o of audit.orphans) {
        console.log(
          `  ad=${o.adId}  ${o.legacyPath}  razão=${o.reason}  ação=${o.suggestedAction}`
        );
      }
    }

    if (args.reportDir) {
      await fs.promises.mkdir(args.reportDir, { recursive: true });
      const p = path.join(args.reportDir, `audit-${Date.now()}.json`);
      await fs.promises.writeFile(p, JSON.stringify(audit, null, 2), "utf8");
      console.log(`\nrelatório JSON: ${p}`);
    }
    return 0;
  }

  const [fromJson, fromVi] = await Promise.all([
    loadCandidateAds(args.limit, args.adId),
    loadAdsWithLegacyVehicleImages(args.limit, args.adId),
  ]);
  const ads = await mergeUniqueAdsById(fromJson, fromVi);
  report.summary.adsScanned = ads.length;

  const extraRoots = args.uploadsRootExtra;

  console.log(
    `[migrate-legacy-ad-images] ${args.execute ? "EXECUÇÃO" : "dry-run"} — ${ads.length} anúncio(s) candidatos`
  );

  if (args.execute && args.reportDir) {
    await fs.promises.mkdir(args.reportDir, { recursive: true });
    const snap = Object.fromEntries(ads.map((a) => [String(a.id), { images: a.images }]));
    const snapPath = path.join(args.reportDir, `rollback-snapshot-ads-images-${Date.now()}.json`);
    await fs.promises.writeFile(snapPath, JSON.stringify(snap, null, 2), "utf8");
    console.log(`[migrate-legacy-ad-images] snapshot pré-migração (rollback lógico): ${snapPath}`);
  }

  for (const ad of ads) {
    await migrateAdRow(ad, { execute: args.execute, extraRoots, report });
  }

  report.finishedAt = new Date().toISOString();
  report.summary.orphanCount = report.orphans.length;

  console.log(
    `\n[migrate-legacy-ad-images] ═══ RELATÓRIO ${args.execute ? "EXECUÇÃO" : "DRY-RUN"} ═══\n`
  );
  console.log(`  anúncios escaneados:  ${report.summary.adsScanned}`);
  console.log(`  migrados (execute):   ${report.summary.migratedAds}`);
  console.log(`  migraria (dry-run):   ${report.summary.wouldMigrateAds}`);
  console.log(`  órfãos:               ${report.orphans.length}`);

  if (report.orphans.length > 0) {
    console.log("\n  Órfãos:");
    for (const o of report.orphans) {
      console.log(
        `    ad=${o.adId}  ${o.legacyPath}  razão=${o.reason}  ação=${o.suggestedAction || "manual_inspection"}`
      );
    }
  }

  if (args.reportDir) {
    await fs.promises.mkdir(args.reportDir, { recursive: true });
    const out = path.join(args.reportDir, `migration-${Date.now()}.json`);
    await fs.promises.writeFile(out, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n  relatório JSON: ${out}`);
  }

  if (!args.execute) {
    console.log("\n[migrate-legacy-ad-images] dry-run concluído. Use --execute para gravar.");
  } else {
    console.log("\n[migrate-legacy-ad-images] migração concluída com sucesso.");
  }

  return 0;
}

const entryArg = process.argv[1]
  ? new URL(`file://${process.argv[1].replace(/\\/g, "/")}`).href
  : "";

if (import.meta.url === entryArg) {
  try {
    const code = await main();
    process.exit(code);
  } catch (error) {
    console.error("[migrate-legacy-ad-images] erro:", error?.message || error);
    process.exit(1);
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
