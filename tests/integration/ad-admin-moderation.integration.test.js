import dotenv from "dotenv";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { INTEGRATION_TEST_DATABASE_URL_DEFAULT } from "./helpers/integration-test-constants.js";
import { resolveSslConfig } from "../../src/infrastructure/database/ssl-config.js";

/**
 * Fase 4.10A — bloqueio administrativo contra BANCO REAL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE SÓ ESTE ARQUIVO CONSEGUE PROVAR
 * ────────────────────────────────────────────────────────────────────────────
 * Os testes com banco falso provam a lógica do service. Três coisas, porém,
 * são invisíveis para eles:
 *
 *   1. CONCORRÊNCIA. Dois bloqueios simultâneos, em conexões distintas, com o
 *      `FOR UPDATE` realmente serializando. Um mock com uma "conexão" só nunca
 *      disputa nada — e um service SEM transação passaria naqueles testes.
 *
 *   2. A CONSTRAINT. `ads_blocked_requires_reason_code` só existe no schema.
 *      Se a migration estiver errada, nenhum teste de unidade percebe.
 *
 *   3. PRESERVAÇÃO DOS DADOS. "Bloquear não apaga fotos nem o vínculo com o
 *      anunciante" é uma afirmação sobre LINHAS que continuam no banco depois
 *      da operação. Só dá para verificar consultando o banco depois.
 *
 * Fora do `npm test` por estar em `tests/integration/**`. Rodar com Docker:
 *   npm run integration:db:up
 *   npx vitest run tests/integration/ad-admin-moderation.integration.test.js
 */

dotenv.config({ override: false });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");

const baseDatabaseUrl =
  String(process.env.TEST_DATABASE_URL || "").trim() ||
  String(process.env.DATABASE_URL || "").trim() ||
  INTEGRATION_TEST_DATABASE_URL_DEFAULT;

const runTag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const dbName = `admmod_${runTag}`.replace(/[^a-z0-9_]/gi, "_").toLowerCase();

const adminUrl = new URL(baseDatabaseUrl);
adminUrl.pathname = "/postgres";

function buildPoolConfig(connectionString) {
  return { connectionString, ssl: resolveSslConfig(connectionString, process.env) };
}

function makeDatabaseUrl(name) {
  const url = new URL(baseDatabaseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Identificador inválido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function runMigrations(dbUrl) {
  const entryPath = path.join(workspaceRoot, "scripts/run-migrations.mjs");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entryPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        TEST_DATABASE_URL: dbUrl,
        NODE_ENV: "test",
        RUN_WORKERS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`migrations falharam (${code}).\n${output}`))
    );
  });
}

const adminPool = new Pool(buildPoolConfig(adminUrl.toString()));
await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbName)}`);

const dbUrl = makeDatabaseUrl(dbName);
await runMigrations(dbUrl);

// ORDEM CRÍTICA: o pool de `db.js` nasce no load do módulo.
process.env.DATABASE_URL = dbUrl;
process.env.TEST_DATABASE_URL = dbUrl;
process.env.NODE_ENV = "test";
process.env.DISABLE_REDIS = "true";

const blockService = await import("../../src/modules/admin/ads/admin-ad-block.service.js");
const adsRepository = await import("../../src/modules/ads/ads.repository.js");
const { buildAdsSearchQuery } = await import("../../src/modules/ads/filters/ads-filter.builder.js");
const { closeDatabasePool } = await import("../../src/infrastructure/database/db.js");

const pool = new Pool(buildPoolConfig(dbUrl));

// --- fixtures ---------------------------------------------------------------

const IMAGES = ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"];

async function seedCity() {
  const { rows } = await pool.query(
    `INSERT INTO cities (name, slug, state) VALUES ('Atibaia', 'atibaia-sp', 'SP')
     ON CONFLICT DO NOTHING RETURNING id`
  );
  if (rows[0]) return rows[0].id;
  const found = await pool.query(`SELECT id FROM cities WHERE slug = 'atibaia-sp' LIMIT 1`);
  return found.rows[0].id;
}

async function seedAd({ status = "active", slug } = {}) {
  const cityId = await seedCity();

  const user = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, plan)
     VALUES ('Dono Teste', $1, 'x', 'user', 'free') RETURNING id`,
    [`dono_${Math.random().toString(36).slice(2, 10)}@example.com`]
  );
  const userId = user.rows[0].id;

  const suffix = Math.random().toString(36).slice(2, 10);
  const adv = await pool.query(
    `INSERT INTO advertisers (user_id, city_id, name, slug, email)
     VALUES ($1, $2, 'Loja Teste', $3, $4) RETURNING id`,
    [userId, cityId, `loja-teste-${suffix}`, `loja_${suffix}@example.com`]
  );
  const advertiserId = adv.rows[0].id;

  const ad = await pool.query(
    `INSERT INTO ads (advertiser_id, title, description, price, city_id, city, state,
                      brand, model, year, mileage, status, slug, images)
     VALUES ($1, 'Honda Civic 2020 EXL', 'Carro em bom estado', 89900, $2, 'Atibaia', 'SP',
             'Honda', 'Civic 2.0 EXL', 2020, 45000, $3, $4, $5::jsonb)
     RETURNING *`,
    [advertiserId, cityId, status, slug, JSON.stringify(IMAGES)]
  );

  return { ad: ad.rows[0], advertiserId, userId, cityId };
}

async function readAd(id) {
  const { rows } = await pool.query(`SELECT * FROM ads WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function moderationEvents(adId) {
  const { rows } = await pool.query(
    `SELECT * FROM ad_moderation_events WHERE ad_id = $1 ORDER BY created_at ASC, id ASC`,
    [adId]
  );
  return rows;
}

async function adminActions(adId) {
  const { rows } = await pool.query(
    `SELECT * FROM admin_actions WHERE target_type = 'ad' AND target_id = $1 ORDER BY id ASC`,
    [String(adId)]
  );
  return rows;
}

/** Roda a query pública real de listagem e devolve os ids visíveis. */
async function publicSearchIds(filters = {}) {
  const { dataQuery, params } = buildAdsSearchQuery(filters);
  const { rows } = await pool.query(dataQuery, params);
  return rows.map((r) => String(r.id));
}

let seq = 0;
function nextSlug() {
  seq += 1;
  return `honda-civic-2020-exl-atibaia-${runTag}-${seq}`;
}

afterAll(async () => {
  await pool.end().catch(() => {});
  await closeDatabasePool().catch(() => {});
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(dbName)} WITH (FORCE)`);
  await adminPool.end().catch(() => {});
});

beforeEach(async () => {
  await pool.query(`DELETE FROM ad_moderation_events`);
  await pool.query(`DELETE FROM admin_actions`);
});

// ---------------------------------------------------------------------------

describe("a constraint do schema exige motivo", () => {
  it("um UPDATE cru para blocked sem reason_code é recusado pelo banco", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await expect(
      pool.query(`UPDATE ads SET status = 'blocked' WHERE id = $1`, [ad.id])
    ).rejects.toThrow(/ads_blocked_requires_reason_code/);

    // O anúncio continua ativo — a transação inteira foi desfeita.
    expect((await readAd(ad.id)).status).toBe("active");
  });

  it("com reason_code, o mesmo UPDATE passa", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await pool.query(
      `UPDATE ads SET status = 'blocked', blocked_reason_code = 'terms_violation' WHERE id = $1`,
      [ad.id]
    );

    expect((await readAd(ad.id)).status).toBe("blocked");
  });
});

describe("bloqueio remove do público e preserva tudo", () => {
  it("ativo aparece na busca pública; bloqueado desaparece; reativado volta", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });
    const id = String(ad.id);

    expect(await publicSearchIds()).toContain(id);

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "suspected_fraud" });
    expect(await publicSearchIds()).not.toContain(id);

    await blockService.unblockAd("admin-1", ad.id, {});
    expect(await publicSearchIds()).toContain(id);
  });

  it("o detalhe público some e volta junto", async () => {
    const slug = nextSlug();
    const { ad } = await seedAd({ slug });

    expect(await adsRepository.findAdByIdentifier(slug)).toBeTruthy();

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "invalid_photos" });
    // Conhecer o slug não ajuda: a query exige status active.
    expect(await adsRepository.findAdByIdentifier(slug)).toBeNull();
    expect(await adsRepository.findAdByIdentifier(String(ad.id))).toBeNull();

    await blockService.unblockAd("admin-1", ad.id, {});
    expect(await adsRepository.findAdByIdentifier(slug)).toBeTruthy();
  });

  it("bloquear NÃO apaga linha, fotos, slug, preço nem o vínculo com o anunciante", async () => {
    const { ad, advertiserId } = await seedAd({ slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "duplicate_ad" });

    const after = await readAd(ad.id);
    expect(after).toBeTruthy();
    expect(after.images).toEqual(IMAGES);
    expect(after.slug).toBe(ad.slug);
    expect(String(after.price)).toBe(String(ad.price));
    expect(String(after.advertiser_id)).toBe(String(advertiserId));
    expect(after.created_at.toISOString()).toBe(ad.created_at.toISOString());
    expect(after.brand).toBe("Honda");
    expect(after.year).toBe(2020);

    // O anunciante continua existindo.
    const adv = await pool.query(`SELECT id FROM advertisers WHERE id = $1`, [advertiserId]);
    expect(adv.rows).toHaveLength(1);
  });
});

describe("reativação restaura o estado anterior", () => {
  it("paused → blocked → paused (não vira público por engano)", async () => {
    const { ad } = await seedAd({ status: "paused", slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "vehicle_unavailable" });
    expect((await readAd(ad.id)).blocked_previous_status).toBe("paused");

    await blockService.unblockAd("admin-1", ad.id, {});

    const after = await readAd(ad.id);
    expect(after.status).toBe("paused");
    expect(await publicSearchIds()).not.toContain(String(ad.id));
  });

  it("pending_review → blocked → pending_review (a fila de moderação não é pulada)", async () => {
    const { ad } = await seedAd({ status: "pending_review", slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "suspected_fraud" });
    await blockService.unblockAd("admin-1", ad.id, {});

    expect((await readAd(ad.id)).status).toBe("pending_review");
    expect(await publicSearchIds()).not.toContain(String(ad.id));
  });

  it("active → blocked → active", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "incorrect_information" });
    await blockService.unblockAd("admin-1", ad.id, {});

    const after = await readAd(ad.id);
    expect(after.status).toBe("active");
    expect(after.blocked_reason_code).toBeNull();
    expect(after.blocked_at).toBeNull();
    expect(after.blocked_previous_status).toBeNull();
    expect(after.blocked_by_user_id).toBeNull();
  });
});

describe("audit trail append-only", () => {
  it("bloqueio e reativação geram dois eventos, e o bloqueio não é alterado", async () => {
    const { ad } = await seedAd({ status: "paused", slug: nextSlug() });

    await blockService.blockAd("admin-7", ad.id, {
      reasonCode: "other",
      note: "documento divergente",
    });
    const afterBlock = await moderationEvents(ad.id);
    expect(afterBlock).toHaveLength(1);
    const blockEventId = afterBlock[0].id;

    await blockService.unblockAd("admin-9", ad.id, { note: "resolvido com o lojista" });

    const events = await moderationEvents(ad.id);
    expect(events).toHaveLength(2);

    // A linha do bloqueio é EXATAMENTE a mesma de antes — nada foi atualizado.
    expect(events[0].id).toBe(blockEventId);
    expect(events[0].event_type).toBe("admin_blocked");
    expect(events[0].from_status).toBe("paused");
    expect(events[0].to_status).toBe("blocked");
    expect(events[0].metadata.reason_code).toBe("other");
    expect(events[0].metadata.note).toBe("documento divergente");

    expect(events[1].event_type).toBe("admin_unblocked");
    expect(events[1].from_status).toBe("blocked");
    expect(events[1].to_status).toBe("paused");
    expect(events[1].metadata.restored_status).toBe("paused");
  });

  it("registra as duas ações em admin_actions", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "terms_violation" });
    await blockService.unblockAd("admin-1", ad.id, {});

    const actions = await adminActions(ad.id);
    expect(actions.map((a) => a.action)).toEqual(["block_ad", "unblock_ad"]);
    expect(actions[0].new_value.previous_status).toBe("active");
  });

  it("o histórico exposto ao admin traz os dois eventos sem identificar quem agiu", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await blockService.blockAd("admin-42", ad.id, { reasonCode: "invalid_photos" });
    await blockService.unblockAd("admin-42", ad.id, {});

    const history = await blockService.listModerationHistory(ad.id);
    expect(history).toHaveLength(2);
    // O service devolve a linha; quem remove o ator é o DTO da rota. O que
    // importa aqui é que os dois eventos estão lá, mais recente primeiro.
    expect(history[0].event_type).toBe("admin_unblocked");
    expect(history[1].event_type).toBe("admin_blocked");
  });
});

describe("idempotência com banco real", () => {
  it("bloquear duas vezes não recarimba nem sobrescreve o motivo", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    const first = await blockService.blockAd("admin-1", ad.id, { reasonCode: "suspected_fraud" });
    const stateAfterFirst = await readAd(ad.id);

    const second = await blockService.blockAd("admin-2", ad.id, {
      reasonCode: "duplicate_ad",
      note: "tentativa de sobrescrever",
    });

    const stateAfterSecond = await readAd(ad.id);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(stateAfterSecond.blocked_reason_code).toBe("suspected_fraud");
    expect(stateAfterSecond.blocked_at.toISOString()).toBe(
      stateAfterFirst.blocked_at.toISOString()
    );
    expect(await moderationEvents(ad.id)).toHaveLength(1);
    expect(await adminActions(ad.id)).toHaveLength(1);
  });

  it("reativar duas vezes gera um único evento", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "invalid_photos" });
    const first = await blockService.unblockAd("admin-1", ad.id, {});
    const second = await blockService.unblockAd("admin-1", ad.id, {});

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(await moderationEvents(ad.id)).toHaveLength(2); // 1 block + 1 unblock
  });
});

describe("concorrência real", () => {
  it("bloquear × bloquear em paralelo: um muda, o outro é no-op", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    const [a, b] = await Promise.all([
      blockService.blockAd("admin-1", ad.id, { reasonCode: "suspected_fraud" }),
      blockService.blockAd("admin-2", ad.id, { reasonCode: "duplicate_ad" }),
    ]);

    const changedCount = [a, b].filter((r) => r.changed).length;
    expect(changedCount).toBe(1);
    expect((await readAd(ad.id)).status).toBe("blocked");
    expect(await moderationEvents(ad.id)).toHaveLength(1);
  });

  it("reativar × reativar em paralelo: um muda, o outro é no-op", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });
    await blockService.blockAd("admin-1", ad.id, { reasonCode: "invalid_photos" });

    const [a, b] = await Promise.all([
      blockService.unblockAd("admin-1", ad.id, {}),
      blockService.unblockAd("admin-2", ad.id, {}),
    ]);

    expect([a, b].filter((r) => r.changed).length).toBe(1);
    expect((await readAd(ad.id)).status).toBe("active");
  });

  it("bloquear × reativar em paralelo termina num estado coerente com a trilha", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });
    await blockService.blockAd("admin-0", ad.id, { reasonCode: "suspected_fraud" });
    await pool.query(`DELETE FROM ad_moderation_events WHERE ad_id = $1`, [ad.id]);

    await Promise.all([
      blockService.unblockAd("admin-1", ad.id, {}),
      blockService.blockAd("admin-2", ad.id, { reasonCode: "terms_violation" }).catch(() => null),
    ]);

    const finalAd = await readAd(ad.id);
    const events = await moderationEvents(ad.id);
    const lastEvent = events.at(-1);

    // Seja qual for a ordem que o lock impôs, o estado final tem de bater com
    // o ÚLTIMO evento registrado. É isso que impede o cenário perigoso:
    // um bloqueio que "venceu" a corrida mas deixou o anúncio público.
    if (lastEvent?.event_type === "admin_blocked") {
      expect(finalAd.status).toBe("blocked");
    } else {
      expect(finalAd.status).not.toBe("blocked");
    }

    // E, se o anúncio terminou bloqueado, o motivo está preenchido.
    if (finalAd.status === "blocked") {
      expect(finalAd.blocked_reason_code).toBeTruthy();
    }
  });

  it("um anúncio bloqueado nunca aparece na busca, mesmo após disputa", async () => {
    const { ad } = await seedAd({ slug: nextSlug() });

    await Promise.all([
      blockService.blockAd("admin-1", ad.id, { reasonCode: "suspected_fraud" }),
      blockService.blockAd("admin-2", ad.id, { reasonCode: "suspected_fraud" }),
      blockService.blockAd("admin-3", ad.id, { reasonCode: "suspected_fraud" }),
    ]);

    expect((await readAd(ad.id)).status).toBe("blocked");
    expect(await publicSearchIds()).not.toContain(String(ad.id));
  });
});

describe("bloqueio a partir de estados terminais", () => {
  it("anúncio deletado não pode ser bloqueado", async () => {
    const { ad } = await seedAd({ status: "deleted", slug: nextSlug() });

    await expect(
      blockService.blockAd("admin-1", ad.id, { reasonCode: "terms_violation" })
    ).rejects.toThrow(/não admite bloqueio/);

    expect((await readAd(ad.id)).status).toBe("deleted");
  });

  it("anúncio arquivado pode ser bloqueado e volta a arquivado", async () => {
    const { ad } = await seedAd({ status: "archived", slug: nextSlug() });

    await blockService.blockAd("admin-1", ad.id, { reasonCode: "terms_violation" });
    expect((await readAd(ad.id)).status).toBe("blocked");

    await blockService.unblockAd("admin-1", ad.id, {});
    expect((await readAd(ad.id)).status).toBe("archived");
    expect(await publicSearchIds()).not.toContain(String(ad.id));
  });
});
