#!/usr/bin/env node
/**
 * Cria um anúncio de teste no Postgres via `createAdNormalized` (mesmo fluxo da API).
 *
 * Requisitos: `DATABASE_URL` (ou `TEST_DATABASE_URL`) apontando para um banco com migrations
 * e ao menos uma linha em `cities` (ex.: `npm run integration:db:prepare` após subir o Postgres).
 *
 * Uso:
 *   node scripts/create-test-ad.mjs
 *   node scripts/create-test-ad.mjs --cleanup   # remove usuário/anúncio criados nesta execução
 */
/* eslint-disable no-console */
import dotenv from "dotenv";

dotenv.config({ override: false });

const cleanup = process.argv.includes("--cleanup");

const url =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim();

if (!url) {
  console.error(
    "[create-test-ad] Defina DATABASE_URL ou TEST_DATABASE_URL (ex.: docker compose -f docker-compose.test.yml up -d && npm run integration:db:prepare)"
  );
  process.exit(1);
}

process.env.DATABASE_URL = url;

const { pool, closeDatabasePool } = await import("../src/infrastructure/database/db.js");
const { createAdNormalized } = await import("../src/modules/ads/ads.create.pipeline.service.js");
const { ensurePublishEligibility } = await import(
  "../src/modules/ads/ads.publish.eligibility.service.js"
);
const {
  assertIntegrationDatabaseReady,
  getFirstCity,
  createPublishableUser,
  cleanupIntegrationArtifacts,
} = await import("../tests/integration/helpers/ads-integration-fixtures.js");

const runTag = `manual_${Date.now()}`;
let user = null;
let adId = null;

try {
  await assertIntegrationDatabaseReady(pool);

  const city = await getFirstCity(pool);
  if (!city) {
    throw new Error("Nenhuma cidade em `cities`. Rode `npm run integration:db:prepare`.");
  }

  user = await createPublishableUser(pool, runTag);

  await ensurePublishEligibility(
    { id: String(user.id), plan: "free" },
    { cityId: Number(city.id), requestId: "create-test-ad-script" }
  );

  const payload = {
    title: `Anúncio de teste (${runTag})`,
    description: "Criado por scripts/create-test-ad.mjs",
    price: 42000,
    city_id: Number(city.id),
    city: city.name,
    state: String(city.state).slice(0, 2).toUpperCase(),
    brand: "Fiat",
    model: "Argo",
    year: 2021,
    mileage: 12000,
    body_type: "hatch",
    fuel_type: "flex",
    transmission: "manual",
    below_fipe: false,
  };

  const row = await createAdNormalized(
    payload,
    { id: String(user.id), plan: "free" },
    {
      requestId: "create-test-ad-script",
    }
  );

  adId = row?.id ?? null;

  const { rows: slugRows } = await pool.query(`SELECT slug, status FROM ads WHERE id = $1`, [adId]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        adId,
        slug: slugRows[0]?.slug,
        status: slugRows[0]?.status,
        userEmail: user.email,
        password: "Integration1!",
        cityId: city.id,
        hint: "Faça login com o email acima (senha fixa de integração) para ver no painel.",
      },
      null,
      2
    )
  );
} catch (err) {
  console.error("[create-test-ad] Falha:", err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exitCode = 1;
} finally {
  if (cleanup && user?.email) {
    try {
      await cleanupIntegrationArtifacts(pool, { emails: [user.email], adIds: adId ? [adId] : [] });
      console.log("[create-test-ad] Artefatos removidos (--cleanup).");
    } catch (e) {
      console.error("[create-test-ad] Cleanup falhou:", e?.message || e);
    }
  }
  await closeDatabasePool?.().catch(() => {});
}
