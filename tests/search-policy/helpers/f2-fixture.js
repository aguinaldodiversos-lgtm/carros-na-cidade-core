// tests/search-policy/helpers/f2-fixture.js
//
// Fixture compartilhada dos testes de integração da F2 (8.1, 8.4, 8.6, 8.7, 8.8).
// Banco descartável no mesmo servidor de DATABASE_URL/TEST_DATABASE_URL, com
// migrations reais, cidades com COORDENADAS REAIS do snapshot de produção,
// region_memberships construída pelo builder da F1 e um estoque que espelha a
// produção de 2026-09-07 (33 ativos em Atibaia — os 6 Onix da §3.3 do gate
// literais —, 1 particular em Bragança) mais os anúncios que os cenários de
// ranking (8.4) exigem: um Destaque ativo, um Destaque expirado e um Pró na
// cidade-base.
import dotenv from "dotenv";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "../../integration/helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../../src/infrastructure/database/ssl-config.js";
import {
  applyMemberships,
  buildAllMemberships,
  loadCities,
} from "../../../src/modules/regions/region-memberships.builder.js";

dotenv.config({ override: false });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workspaceRoot = path.resolve(__dirname, "../../..");
export const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function adminPool() {
  const adminUrl = new URL(baseDatabaseUrl);
  adminUrl.pathname = "/postgres";
  return new Pool({
    connectionString: adminUrl.toString(),
    ssl: resolveSslConfig(adminUrl.toString(), process.env),
  });
}

export function envFor(dbUrl, extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: dbUrl,
    TEST_DATABASE_URL: dbUrl,
    NODE_ENV: "test",
    RUN_WORKERS: "false",
    DISABLE_REDIS: "true",
    LOG_LEVEL: "warn",
    JWT_SECRET: process.env.JWT_SECRET || "integration-jwt-secret-minimum-32-characters-long-f2",
    JWT_REFRESH_SECRET:
      process.env.JWT_REFRESH_SECRET || "integration-refresh-secret-minimum-32-characters-long",
    ...extra,
  };
}

export function runScript(relPath, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspaceRoot, relPath), ...args], {
      cwd: workspaceRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${relPath} saiu com ${code}\n${out}`))
    );
  });
}

/** Coordenadas REAIS (cities.latitude/longitude, snapshot 2026-09-07). */
export const CITIES = [
  ["Atibaia", "SP", "atibaia-sp", -23.1171, -46.5563],
  ["Bragança Paulista", "SP", "braganca-paulista-sp", -22.9527, -46.5419],
  ["Extrema", "MG", "extrema-mg", -22.854, -46.3178],
  ["Camanducaia", "MG", "camanducaia-mg", -22.7515, -46.1494],
  ["Vargem", "SP", "vargem-sp", -22.887, -46.4124],
  ["Campinas", "SP", "campinas-sp", -22.9053, -47.0659],
  ["Jundiaí", "SP", "jundiai-sp", -23.1852, -46.8974],
  ["Rio de Janeiro", "RJ", "rio-de-janeiro-rj", -22.9129, -43.2003],
];

/** Os 6 Onix ativos de Atibaia, literais (§3.3 do gate). */
export const ONIX = [
  { model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", transmission: "manual", price: 70900, below: true, year: 2025 },
  { model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", transmission: "manual", price: 74900, below: false, year: 2025 },
  { model: "ONIX HATCH 1.0 12V Flex 5p Mec.", transmission: "manual", price: 74900, below: false, year: 2025 },
  { model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.", transmission: "manual", price: 77900, below: true, year: 2025 },
  { model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.", transmission: "manual", price: 78900, below: false, year: 2025 },
  { model: "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.", transmission: "automatico", price: 78900, below: false, year: 2023 },
];

/** Restante do estoque de Atibaia (27) — distribuição real de commercial_model. */
export const ATIBAIA_OTHERS = [
  ...Array.from({ length: 4 }, (_, i) => ({ brand: "Hyundai", cm: "HB20", model: `HB20 Vision 1.0 Flex ${i}`, body: "hatch", price: 62000 + i * 1000 })),
  ...["T-Cross", "Pulse", "C3", "Mobi", "Polo", "Kwid", "HR-V", "Fox", "Argo"].flatMap((cm, j) =>
    [0, 1].map((k) => ({
      brand: { "T-Cross": "VW - VolksWagen", Polo: "VW - VolksWagen", Fox: "VW - VolksWagen", Pulse: "Fiat", Mobi: "Fiat", Argo: "Fiat", C3: "Citroën", Kwid: "Renault", "HR-V": "Honda" }[cm],
      cm,
      model: `${cm.toUpperCase()} 1.0 Flex ${k}`,
      body: cm === "T-Cross" || cm === "HR-V" || cm === "Pulse" ? "suv" : "hatch",
      price: 55000 + j * 5000 + k * 3000,
    }))
  ),
  ...["Compass", "Virtus", "Ecosport", "Strada", "Civic"].map((cm, j) => ({
    brand: { Compass: "Jeep", Virtus: "VW - VolksWagen", Ecosport: "Ford", Strada: "Fiat", Civic: "Honda" }[cm],
    cm,
    model: `${cm.toUpperCase()} 1.6 Flex`,
    body: cm === "Strada" ? "picape" : cm === "Compass" || cm === "Ecosport" ? "suv" : "sedan",
    price: 90000 + j * 8000,
  })),
];

async function insertAd(db, a) {
  const { rows } = await db.query(
    `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                      price, year, mileage, transmission, fuel_type, body_type,
                      below_fipe, fipe_reference_value, fipe_diff_percent,
                      plan, priority, status, slug, highlight_until, created_at, updated_at, images)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'free',1,'active',$18,$19,$20,$20,'[]'::jsonb)
     RETURNING id`,
    [
      a.advertiserId,
      a.cityId,
      a.cityName,
      a.state,
      a.title,
      a.brand,
      a.model,
      a.commercialModel,
      a.price,
      a.year ?? 2022,
      a.mileage ?? 40000,
      a.transmission ?? "manual",
      a.fuel ?? "flex",
      a.body ?? "hatch",
      a.below ?? false,
      a.below ? Math.round(a.price * 1.07) : null,
      a.below ? -7 : null,
      a.slug,
      a.highlightUntil ?? null,
      a.createdAt,
    ]
  );
  return rows[0].id;
}

/**
 * Semeia tudo e devolve ids. `db` é um Pool do banco descartável já migrado.
 */
export async function seedF2Fixture(db) {
  const ids = { cities: {}, users: {}, advertisers: {}, ads: {} };

  for (const [name, state, slug, lat, lng] of CITIES) {
    const { rows } = await db.query(
      `INSERT INTO cities (name, state, slug, latitude, longitude) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [name, state, slug, lat, lng]
    );
    ids.cities[slug] = Number(rows[0].id);
  }
  const cityName = Object.fromEntries(CITIES.map((c) => [c[2], c[0]]));
  const cityState = Object.fromEntries(CITIES.map((c) => [c[2], c[1]]));

  // region_memberships pelo builder da F1 (tabela vazia → regra antiga completa).
  const cities = await loadCities(db);
  const { rows: rmRows } = buildAllMemberships(cities);
  await applyMemberships(db, rmRows, { backupTable: "rm_backup_f2_fixture" });

  // Planos: existem pelas migrations; conferimos os pesos que o ranking assume.
  const { rows: plans } = await db.query(
    `SELECT id, weight::float AS weight FROM subscription_plans WHERE id IN ('cnpj-store-pro','cnpj-store-start','cnpj-free-store','cpf-free-essential')`
  );
  const weight = Object.fromEntries(plans.map((p) => [p.id, p.weight]));
  if (weight["cnpj-store-pro"] !== 3 || weight["cnpj-store-start"] !== 2) {
    throw new Error(`fixture: pesos inesperados dos planos: ${JSON.stringify(weight)}`);
  }

  async function user(email, planId, doc) {
    const { rows } = await db.query(
      `INSERT INTO users (email, plan_id, document_type, document_verified) VALUES ($1,$2,$3,true) RETURNING id`,
      [email, planId, doc]
    );
    return Number(rows[0].id);
  }
  async function advertiser(userId, name, citySlug, company) {
    const { rows } = await db.query(
      `INSERT INTO advertisers (user_id, city_id, name, slug, company_name) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, ids.cities[citySlug], name, `adv-${userId}-${citySlug}`, company]
    );
    return Number(rows[0].id);
  }

  ids.users.pro = await user("pro@f2.local", "cnpj-store-pro", "cnpj");
  ids.users.start = await user("start@f2.local", "cnpj-store-start", "cnpj");
  ids.users.pf = await user("pf@f2.local", "cpf-free-essential", "cpf");
  ids.users.pfBoost = await user("boost@f2.local", "cpf-free-essential", "cpf");

  ids.advertisers.ittmotors = await advertiser(ids.users.pro, "Ittmotors", "atibaia-sp", "Ittmotors");
  ids.advertisers.proBraganca = await advertiser(ids.users.pro, "Loja Bragança", "braganca-paulista-sp", "Loja Bragança");
  ids.advertisers.pfBraganca = await advertiser(ids.users.pf, "Aguinaldo", "braganca-paulista-sp", null);
  ids.advertisers.pfAtibaia = await advertiser(ids.users.pfBoost, "Particular Atibaia", "atibaia-sp", null);
  ids.advertisers.startExtrema = await advertiser(ids.users.start, "Loja Extrema", "extrema-mg", "Loja Extrema");
  ids.advertisers.startRio = await advertiser(ids.users.start, "Loja Rio", "rio-de-janeiro-rj", "Loja Rio");

  const base = new Date("2026-08-01T12:00:00Z").getTime();
  let n = 0;
  const createdAt = () => new Date(base + n++ * 3600_000).toISOString();
  const ad = (o) =>
    insertAd(db, {
      ...o,
      cityId: ids.cities[o.citySlug],
      cityName: cityName[o.citySlug],
      state: cityState[o.citySlug],
      slug: `${o.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${n}`,
      createdAt: createdAt(),
    });

  // Atibaia — Ittmotors (Pró): 6 Onix + 27 outros = 33.
  ids.ads.onix = [];
  for (const [i, o] of ONIX.entries()) {
    ids.ads.onix.push(
      await ad({
        advertiserId: ids.advertisers.ittmotors,
        citySlug: "atibaia-sp",
        title: `Onix ${i + 1}`,
        brand: "GM - Chevrolet",
        model: o.model,
        commercialModel: "Onix",
        price: o.price,
        year: o.year,
        transmission: o.transmission,
        body: o.model.includes("SEDAN") ? "sedan" : "hatch",
        below: o.below,
      })
    );
  }
  ids.ads.atibaiaOthers = [];
  for (const [i, o] of ATIBAIA_OTHERS.entries()) {
    ids.ads.atibaiaOthers.push(
      await ad({
        advertiserId: ids.advertisers.ittmotors,
        citySlug: "atibaia-sp",
        title: `${o.cm} ${i + 1}`,
        brand: o.brand,
        model: o.model,
        commercialModel: o.cm,
        price: o.price,
        year: 2014 + (i % 12),
        transmission: i % 3 === 0 ? "automatico" : "manual",
        body: o.body,
        fuel: i % 7 === 0 ? "diesel" : "flex",
      })
    );
  }

  // Bragança — 1 particular (Free CPF) + 1 Pró (cenário 8.4 "Pró 0 km").
  ids.ads.pfBraganca = await ad({
    advertiserId: ids.advertisers.pfBraganca,
    citySlug: "braganca-paulista-sp",
    title: "Renegade Particular",
    brand: "Jeep",
    model: "RENEGADE Longitude 1.8 Flex Aut.",
    commercialModel: "Renegade",
    price: 98000,
    transmission: "automatico",
    body: "suv",
  });
  ids.ads.proBraganca = await ad({
    advertiserId: ids.advertisers.proBraganca,
    citySlug: "braganca-paulista-sp",
    title: "Civic Pro Base",
    brand: "Honda",
    model: "CIVIC EXL 2.0 Flex Aut.",
    commercialModel: "Civic",
    price: 120000,
    transmission: "automatico",
    body: "sedan",
  });

  // Atibaia — Destaque ativo (Free CPF + boost) e Destaque EXPIRADO (Pró).
  ids.ads.spinDestaque = await ad({
    advertiserId: ids.advertisers.pfAtibaia,
    citySlug: "atibaia-sp",
    title: "Spin Destaque",
    brand: "GM - Chevrolet",
    model: "SPIN LTZ 1.8 Flex Aut.",
    commercialModel: "Spin",
    price: 82000,
    transmission: "automatico",
    body: "minivan",
    highlightUntil: new Date(Date.now() + 7 * 86400_000).toISOString(),
  });
  ids.ads.argoExpirado = await ad({
    advertiserId: ids.advertisers.ittmotors,
    citySlug: "atibaia-sp",
    title: "Argo Destaque Expirado",
    brand: "Fiat",
    model: "ARGO Drive 1.3 Flex",
    commercialModel: "Argo",
    price: 58000,
    highlightUntil: new Date(Date.now() - 2 * 86400_000).toISOString(),
  });

  // Extrema-MG — Start, 2 anúncios cross-UF (25 km de Bragança, 38 km de Atibaia).
  ids.ads.extrema = [
    await ad({ advertiserId: ids.advertisers.startExtrema, citySlug: "extrema-mg", title: "Gol Extrema", brand: "VW - VolksWagen", model: "GOL 1.0 Flex", commercialModel: "Gol", price: 45000 }),
    await ad({ advertiserId: ids.advertisers.startExtrema, citySlug: "extrema-mg", title: "Uno Extrema", brand: "Fiat", model: "UNO Way 1.0 Flex", commercialModel: "Uno", price: 38000 }),
  ];
  // Rio — fora de 150 km de tudo.
  ids.ads.rio = await ad({ advertiserId: ids.advertisers.startRio, citySlug: "rio-de-janeiro-rj", title: "Corolla Rio", brand: "Toyota", model: "COROLLA XEi 2.0 Flex", commercialModel: "Corolla", price: 110000 });

  return ids;
}

/**
 * Cria banco descartável + migrations + fixture, roda `fn({ db, dbUrl, ids })`,
 * e derruba o banco no fim.
 */
export async function withF2Fixture(label, fn) {
  const admin = adminPool();
  const dbName = `sp_f2_${label}_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${dbName}`;
  const dbUrl = url.toString();
  let db = null;
  try {
    await runScript("scripts/run-migrations.mjs", envFor(dbUrl));
    db = new Pool({ connectionString: dbUrl, ssl: resolveSslConfig(dbUrl, process.env), max: 4 });
    const ids = await seedF2Fixture(db);
    return await fn({ db, dbUrl, ids });
  } finally {
    if (db) await db.end().catch(() => {});
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    await admin.end();
  }
}
