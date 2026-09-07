import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  applySeedStateToEnv,
  fingerprintDatabaseUrl,
  isSeededEnvironment,
  readSeedState,
  seedStateMatchesEnv,
  SEED_STATE_FILENAME,
  type SeedState,
} from "./seed-state";

/**
 * O marcador de ambiente preparado é o que converte SKIP em FAIL no caminho
 * crítico. Se ele ligar quando não devia, a suíte fica vermelha sem motivo; se
 * não ligar quando devia, volta o BUG-CI-01 (job verde sem ter testado nada).
 * Os dois erros são cobertos aqui.
 */

const temporarios: string[] = [];

function dirTemporario(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-state-"));
  temporarios.push(dir);
  return dir;
}

function escreverMarcador(dir: string, state: Partial<SeedState>) {
  const completo: SeedState = {
    seededAt: "2026-09-06T20:00:00.000Z",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test",
    accounts: [],
    ...state,
  };
  fs.writeFileSync(path.join(dir, SEED_STATE_FILENAME), JSON.stringify(completo), "utf8");
}

afterEach(() => {
  for (const dir of temporarios.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("fingerprintDatabaseUrl", () => {
  it("compara host/porta/banco e ignora a senha", () => {
    expect(fingerprintDatabaseUrl("postgresql://postgres:senha1@127.0.0.1:5433/db")).toBe(
      fingerprintDatabaseUrl("postgresql://outro:senha2@127.0.0.1:5433/db")
    );
  });

  it("bancos diferentes no mesmo host NÃO colidem", () => {
    expect(fingerprintDatabaseUrl("postgresql://u:p@127.0.0.1:5433/a")).not.toBe(
      fingerprintDatabaseUrl("postgresql://u:p@127.0.0.1:5433/b")
    );
  });

  it("porta omitida assume 5432", () => {
    expect(fingerprintDatabaseUrl("postgresql://u:p@localhost/db")).toContain(":5432");
  });
});

describe("seedStateMatchesEnv", () => {
  const state: SeedState = {
    seededAt: "2026-09-06T20:00:00.000Z",
    databaseUrl: "postgresql://postgres:postgres@127.0.0.1:5433/carros_na_cidade_test",
    accounts: [],
  };

  it("sem banco declarado no ambiente, o marcador vale", () => {
    expect(seedStateMatchesEnv(state, {})).toBe(true);
  });

  it("mesmo banco → vale", () => {
    expect(
      seedStateMatchesEnv(state, {
        TEST_DATABASE_URL: "postgresql://x:y@127.0.0.1:5433/carros_na_cidade_test",
      })
    ).toBe(true);
  });

  it("banco DIFERENTE → não vale (marcador obsoleto não declara preparo)", () => {
    expect(
      seedStateMatchesEnv(state, {
        TEST_DATABASE_URL: "postgresql://x:y@127.0.0.1:5433/outro_banco",
      })
    ).toBe(false);
  });

  it("marcador sem databaseUrl é inútil", () => {
    expect(seedStateMatchesEnv({ ...state, databaseUrl: "" }, {})).toBe(false);
    expect(seedStateMatchesEnv(null, {})).toBe(false);
  });
});

describe("readSeedState", () => {
  it("devolve null quando o arquivo não existe", () => {
    expect(readSeedState(dirTemporario())).toBeNull();
  });

  it("devolve null para JSON corrompido, sem lançar", () => {
    const dir = dirTemporario();
    fs.writeFileSync(path.join(dir, SEED_STATE_FILENAME), "{isso não é json", "utf8");
    expect(readSeedState(dir)).toBeNull();
  });

  it("lê o marcador válido", () => {
    const dir = dirTemporario();
    escreverMarcador(dir, { accounts: [{ email: "testa@x", purpose: "USERS.A" }] });
    expect(readSeedState(dir)?.accounts[0].email).toBe("testa@x");
  });
});

describe("applySeedStateToEnv", () => {
  it("E2E_SEEDED=1 explícito vence tudo (caminho do CI)", () => {
    const env: Record<string, string | undefined> = { E2E_SEEDED: "1" };
    const r = applySeedStateToEnv(dirTemporario(), env);
    expect(r.seeded).toBe(true);
    expect(isSeededEnvironment(env)).toBe(true);
  });

  it("sem marcador e sem variável → NÃO preparado (skip continua legítimo)", () => {
    const env: Record<string, string | undefined> = {};
    const r = applySeedStateToEnv(dirTemporario(), env);
    expect(r.seeded).toBe(false);
    expect(r.motivo).toContain("e2e:prepare");
    expect(isSeededEnvironment(env)).toBe(false);
  });

  it("marcador do MESMO banco liga a flag", () => {
    const dir = dirTemporario();
    escreverMarcador(dir, {});
    const env: Record<string, string | undefined> = {
      TEST_DATABASE_URL: "postgresql://a:b@127.0.0.1:5433/carros_na_cidade_test",
    };

    expect(applySeedStateToEnv(dir, env).seeded).toBe(true);
    expect(env.E2E_SEEDED).toBe("1");
  });

  it("marcador de OUTRO banco não liga a flag e explica por quê", () => {
    const dir = dirTemporario();
    escreverMarcador(dir, {
      databaseUrl: "postgresql://a:b@127.0.0.1:5433/banco_antigo",
    });
    const env: Record<string, string | undefined> = {
      TEST_DATABASE_URL: "postgresql://a:b@127.0.0.1:5433/carros_na_cidade_test",
    };

    const r = applySeedStateToEnv(dir, env);
    expect(r.seeded).toBe(false);
    expect(r.motivo).toContain("banco_antigo");
    expect(env.E2E_SEEDED).toBeUndefined();
  });

  it("E2E_SEEDED com valor diferente de '1' não conta como declaração", () => {
    for (const valor of ["0", "true", "yes", ""]) {
      expect(isSeededEnvironment({ E2E_SEEDED: valor }), `E2E_SEEDED="${valor}"`).toBe(false);
    }
  });
});
