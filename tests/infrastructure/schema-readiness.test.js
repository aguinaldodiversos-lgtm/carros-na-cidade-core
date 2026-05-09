import { describe, it, expect, vi } from "vitest";
import {
  ANTIFRAUD_REQUIRED_COLUMNS,
  ANTIFRAUD_REQUIRED_TABLES,
  checkAntifraudSchema,
  enforceAntifraudSchemaAtBoot,
} from "../../src/infrastructure/database/schema-readiness.js";

/**
 * Cobre o readiness check da migration 025:
 *   • detecta colunas e tabelas faltantes (cenários OK/parcial/total).
 *   • em production/staging, lança erro com `code` e `details`.
 *   • em dev/test, apenas loga warning e segue.
 *   • erro de query (DB down) propaga — boot deve falhar.
 *
 * Não toca banco. Mock do `db.query` por cenário.
 */

function makeDb({ columns = [], tables = [], throwOn = null } = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (throwOn === "all") {
        throw new Error("connection refused");
      }
      if (/information_schema\.columns/i.test(sql)) {
        return { rows: columns.map((c) => ({ column_name: c })) };
      }
      if (/information_schema\.tables/i.test(sql)) {
        return { rows: tables.map((t) => ({ table_name: t })) };
      }
      return { rows: [] };
    }),
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("checkAntifraudSchema", () => {
  it("ok=true quando todas as colunas e tabelas estão presentes", async () => {
    const db = makeDb({
      columns: ANTIFRAUD_REQUIRED_COLUMNS.slice(),
      tables: ANTIFRAUD_REQUIRED_TABLES.slice(),
    });
    const result = await checkAntifraudSchema(db);
    expect(result.ok).toBe(true);
    expect(result.missingColumns).toEqual([]);
    expect(result.missingTables).toEqual([]);
    expect(typeof result.checkedAt).toBe("string");
    // Deve consultar exatamente uma vez cada catálogo (em paralelo).
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it("ok=false e lista colunas faltantes (sem migration aplicada)", async () => {
    const db = makeDb({ columns: [], tables: ANTIFRAUD_REQUIRED_TABLES.slice() });
    const result = await checkAntifraudSchema(db);
    expect(result.ok).toBe(false);
    expect(result.missingColumns).toEqual(ANTIFRAUD_REQUIRED_COLUMNS.slice());
    expect(result.missingTables).toEqual([]);
  });

  it("ok=false e lista tabelas faltantes (migration parcial)", async () => {
    const db = makeDb({
      columns: ANTIFRAUD_REQUIRED_COLUMNS.slice(),
      tables: ["ad_risk_signals"], // só uma das duas
    });
    const result = await checkAntifraudSchema(db);
    expect(result.ok).toBe(false);
    expect(result.missingColumns).toEqual([]);
    expect(result.missingTables).toEqual(["ad_moderation_events"]);
  });

  it("subset de colunas presentes — reporta exatamente as faltantes", async () => {
    const partial = ["risk_score", "risk_level", "risk_reasons"];
    const db = makeDb({
      columns: partial,
      tables: ANTIFRAUD_REQUIRED_TABLES.slice(),
    });
    const result = await checkAntifraudSchema(db);
    expect(result.ok).toBe(false);
    expect(result.missingColumns.sort()).toEqual(
      ANTIFRAUD_REQUIRED_COLUMNS.filter((c) => !partial.includes(c)).sort()
    );
  });

  it("rejeita parâmetro db sem .query", async () => {
    await expect(checkAntifraudSchema(null)).rejects.toThrow(/query/);
    await expect(checkAntifraudSchema({})).rejects.toThrow(/query/);
  });
});

describe("enforceAntifraudSchemaAtBoot", () => {
  it("retorna ok e loga info quando schema está completo", async () => {
    const log = makeLogger();
    const db = makeDb({
      columns: ANTIFRAUD_REQUIRED_COLUMNS.slice(),
      tables: ANTIFRAUD_REQUIRED_TABLES.slice(),
    });

    const result = await enforceAntifraudSchemaAtBoot(db, {
      env: "production",
      logger: log,
    });
    expect(result.ok).toBe(true);
    expect(log.info).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("LANÇA em production quando migration 025 ausente — code SCHEMA_READINESS_MISSING_MIGRATION_025", async () => {
    const log = makeLogger();
    const db = makeDb({ columns: [], tables: [] });

    let err;
    await enforceAntifraudSchemaAtBoot(db, {
      env: "production",
      logger: log,
    }).catch((e) => (err = e));

    expect(err).toBeTruthy();
    expect(err.code).toBe("SCHEMA_READINESS_MISSING_MIGRATION_025");
    expect(err.details.missingColumns).toEqual(ANTIFRAUD_REQUIRED_COLUMNS.slice());
    expect(err.details.missingTables).toEqual(ANTIFRAUD_REQUIRED_TABLES.slice());
    expect(String(err.message)).toMatch(/025/);
    expect(String(err.message)).toMatch(/db:migrate/);
    expect(log.error).toHaveBeenCalled();
  });

  it("LANÇA em staging também (não só production)", async () => {
    const log = makeLogger();
    const db = makeDb({ columns: [], tables: [] });
    let err;
    await enforceAntifraudSchemaAtBoot(db, {
      env: "staging",
      logger: log,
    }).catch((e) => (err = e));
    expect(err).toBeTruthy();
    expect(err.code).toBe("SCHEMA_READINESS_MISSING_MIGRATION_025");
  });

  it("em development apenas WARN e prossegue", async () => {
    const log = makeLogger();
    const db = makeDb({ columns: [], tables: [] });

    const result = await enforceAntifraudSchemaAtBoot(db, {
      env: "development",
      logger: log,
    });

    expect(result.ok).toBe(false);
    expect(log.warn).toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("em test apenas WARN e prossegue", async () => {
    const log = makeLogger();
    const db = makeDb({ columns: [], tables: [] });

    const result = await enforceAntifraudSchemaAtBoot(db, {
      env: "test",
      logger: log,
    });

    expect(result.ok).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });

  it("erro de query (DB down) propaga em qualquer env — boot deve falhar", async () => {
    const log = makeLogger();
    const db = makeDb({ throwOn: "all" });

    let err;
    await enforceAntifraudSchemaAtBoot(db, {
      env: "development",
      logger: log,
    }).catch((e) => (err = e));

    expect(err).toBeTruthy();
    expect(String(err.message)).toMatch(/connection/i);
    expect(log.error).toHaveBeenCalled();
  });
});
