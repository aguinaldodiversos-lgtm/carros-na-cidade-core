#!/usr/bin/env node
/**
 * Saneia imagens legadas em ads.images.
 *
 * Objetivos:
 * - localizar anúncios com `/uploads/ads/...`
 * - identificar em qual ponto a imagem se perde
 * - reconciliar com `vehicle_images`
 * - opcionalmente regravar `ads.images` com URLs canônicas
 *
 * Uso:
 *   node scripts/sanitize-ad-images.mjs
 *   node scripts/sanitize-ad-images.mjs --apply
 *   node scripts/sanitize-ad-images.mjs --apply --limit=100
 *   node scripts/sanitize-ad-images.mjs --id=25
 */

import "dotenv/config";

import { closeDatabasePool, pool, withTransaction } from "../src/infrastructure/database/db.js";
import {
  buildNormalizedPublicImages,
  listVehicleImagesByAdIds,
} from "../src/modules/ads/ads.public-images.js";

const args = new Set(process.argv.slice(2));
const applyChanges = args.has("--apply");
const idArg = [...args].find((arg) => arg.startsWith("--id="));
const limitArg = [...args].find((arg) => arg.startsWith("--limit="));

const filterAdId = idArg ? Number(idArg.split("=")[1]) : null;
const limit = Math.max(1, Number.parseInt(limitArg?.split("=")[1] || "200", 10) || 200);

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Defina DATABASE_URL no ambiente ou em .env");
  process.exit(1);
}

function toForwardSlashes(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/");
}

function isLegacyUpload(value) {
  return /^\/?uploads\/ads\//i.test(toForwardSlashes(value));
}

function isCanonicalPublicImage(value) {
  const normalized = toForwardSlashes(value);
  return (
    /^https?:\/\//i.test(normalized) ||
    normalized.startsWith("/api/vehicle-images?") ||
    normalized.startsWith("/images/")
  );
}

function parseImages(rawValue) {
  if (Array.isArray(rawValue))
    return rawValue.map((item) => String(item ?? "").trim()).filter(Boolean);
  if (!rawValue) return [];

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      return parseImages(parsed);
    } catch {
      return [trimmed];
    }
  }

  return [];
}

function classifyBreakPoint(rawImages, vehicleRows, normalizedImages) {
  const hasLegacyAdsImages = rawImages.some((image) => isLegacyUpload(image));
  const hasVehicleRows = Array.isArray(vehicleRows) && vehicleRows.length > 0;
  const hasCanonicalVehicleRows = vehicleRows.some(
    (row) =>
      isCanonicalPublicImage(row.image_url) || /^vehicles\//i.test(String(row.storage_key || ""))
  );
  const hasCanonicalNormalized = normalizedImages.some((image) => isCanonicalPublicImage(image));

  if (!hasLegacyAdsImages) {
    return "ok";
  }

  if (!hasVehicleRows) {
    return "lost_before_vehicle_images";
  }

  if (!hasCanonicalVehicleRows) {
    return "vehicle_images_without_canonical_source";
  }

  if (!hasCanonicalNormalized) {
    return "normalization_failed";
  }

  return "ads_images_legacy_but_recoverable";
}

export { classifyBreakPoint, parseImages };

function summarizeCounters(rows) {
  const summary = new Map();

  for (const row of rows) {
    summary.set(row.breakPoint, (summary.get(row.breakPoint) || 0) + 1);
  }

  return Object.fromEntries([...summary.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

async function loadCandidateAds() {
  const params = [];
  const where = [
    "a.status = 'active'",
    "a.images IS NOT NULL",
    "jsonb_typeof(a.images) = 'array'",
    "EXISTS (SELECT 1 FROM jsonb_array_elements_text(a.images) img WHERE img ILIKE '/uploads/ads/%' OR img ILIKE 'uploads/ads/%')",
  ];

  if (Number.isInteger(filterAdId) && filterAdId > 0) {
    params.push(filterAdId);
    where.push(`a.id = $${params.length}`);
  }

  params.push(limit);

  const { rows } = await pool.query(
    `
      SELECT
        a.id,
        a.slug,
        a.title,
        a.images,
        a.updated_at
      FROM ads a
      WHERE ${where.join(" AND ")}
      ORDER BY a.id ASC
      LIMIT $${params.length}
    `,
    params
  );

  return rows;
}

async function inspectCandidates() {
  const ads = await loadCandidateAds();
  const vehicleImagesByAdId = await listVehicleImagesByAdIds(ads.map((row) => row.id));

  const inspections = ads.map((row) => {
    const rawImages = parseImages(row.images);
    const vehicleRows = vehicleImagesByAdId.get(Number(row.id)) || [];
    const normalizedImages = buildNormalizedPublicImages(row, vehicleRows);
    const breakPoint = classifyBreakPoint(rawImages, vehicleRows, normalizedImages);

    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      rawImages,
      vehicleRows,
      normalizedImages,
      breakPoint,
      canRewrite:
        normalizedImages.length > 0 &&
        JSON.stringify(rawImages) !== JSON.stringify(normalizedImages),
    };
  });

  return inspections;
}

async function applySanitization(inspections) {
  const rewritable = inspections.filter((item) => item.canRewrite);

  if (rewritable.length === 0) {
    return {
      updated: 0,
    };
  }

  await withTransaction(async (tx) => {
    for (const item of rewritable) {
      await tx.query(
        `
          UPDATE ads
          SET images = $2::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [item.id, JSON.stringify(item.normalizedImages)]
      );
    }
  });

  return {
    updated: rewritable.length,
  };
}

function printInspectionReport(inspections) {
  console.log("");
  console.log(`[sanitize-ad-images] anúncios analisados: ${inspections.length}`);
  console.log("[sanitize-ad-images] resumo por ponto de quebra:");
  console.table(summarizeCounters(inspections));

  const sample = inspections.slice(0, 20).map((item) => ({
    id: item.id,
    slug: item.slug,
    raw_count: item.rawImages.length,
    vehicle_rows: item.vehicleRows.length,
    normalized_count: item.normalizedImages.length,
    break_point: item.breakPoint,
    can_rewrite: item.canRewrite,
  }));

  if (sample.length > 0) {
    console.log("[sanitize-ad-images] amostra:");
    console.table(sample);
  }

  const withIssues = inspections.filter((item) => item.breakPoint !== "ok").slice(0, 10);
  for (const item of withIssues) {
    console.log("");
    console.log(`[ad ${item.id}] ${item.slug}`);
    console.log(`  break_point: ${item.breakPoint}`);
    console.log(`  raw_images: ${JSON.stringify(item.rawImages)}`);
    console.log(
      `  vehicle_images: ${JSON.stringify(
        item.vehicleRows.map((row) => ({
          image_url: row.image_url || null,
          storage_key: row.storage_key || null,
        }))
      )}`
    );
    console.log(`  normalized_images: ${JSON.stringify(item.normalizedImages)}`);
  }
}

export async function main() {
  const inspections = await inspectCandidates();
  printInspectionReport(inspections);

  if (!applyChanges) {
    console.log("");
    console.log("[sanitize-ad-images] modo dry-run. Nada foi alterado.");
    console.log("[sanitize-ad-images] use --apply para regravar ads.images com URLs canônicas.");
    return 0;
  }

  const result = await applySanitization(inspections);
  console.log("");
  console.log(`[sanitize-ad-images] atualizado com sucesso: ${result.updated} anúncio(s).`);
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
    console.error("[sanitize-ad-images] erro:", error?.message || error);
    process.exit(1);
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
