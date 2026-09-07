import fs from "node:fs";
import path from "node:path";

/**
 * "Este ambiente está preparado para E2E?" — a pergunta que decide SKIP vs FAIL.
 *
 * ── O problema (BUG-CI-01) ──────────────────────────────────────────────────
 * `full-flow.spec.ts` é o ÚNICO spec que o CI executa, e 6 dos seus 9 testes
 * eram `test.skip(!loginRes.ok(), "Usuário A indisponível…")`. Como o seed
 * oficial nunca criou `testa@`/`testb@`, o login falhava, os testes pulavam e o
 * job terminava verde — anunciando "E2E full-flow passed" sem ter exercitado
 * cadastro, publicação nem persistência uma única vez.
 *
 * Skip por ambiente ausente é legítimo: quem clona o repositório e roda a suíte
 * sem Postgres não deve receber 30 vermelhos ilegíveis. O que não pode existir é
 * skip num ambiente que se DECLAROU preparado — ali, login que falha é defeito.
 *
 * ── Como a declaração acontece ──────────────────────────────────────────────
 * Duas fontes, ambas explícitas:
 *
 *   1. `E2E_SEEDED=1` no ambiente — usado pelo CI, que sabe que rodou o seed.
 *   2. `frontend/e2e/.seed-state.json`, escrito por `scripts/e2e-seed.mjs` com
 *      o banco que ele semeou. O `playwright.config.ts` lê o arquivo e liga a
 *      variável quando o alvo bate. É o que faz o desenvolvedor local ganhar a
 *      proteção sem precisar lembrar de exportar nada.
 *
 * Marcador obsoleto (de outro banco) NÃO liga a flag: `databaseUrl` é comparado.
 * E na dúvida a direção é falhar alto, nunca pular calado.
 */

export const SEED_STATE_FILENAME = ".seed-state.json";

export type SeedState = {
  seededAt: string;
  databaseUrl: string;
  accounts: Array<{ email: string; role?: string; documentType?: string | null; purpose: string }>;
  activeAdsInBaseCity?: number;
};

/** Normaliza para comparar bancos sem expor a senha. */
export function fingerprintDatabaseUrl(url: string): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/**
 * O marcador corresponde ao banco que a suíte vai usar?
 *
 * Quando o processo não declara banco nenhum (`TEST_DATABASE_URL`/`DATABASE_URL`
 * ausentes), aceitamos o marcador: é o caso do desenvolvedor que rodou
 * `npm run e2e:prepare` e depois só chamou `npx playwright test`.
 */
export function seedStateMatchesEnv(
  state: SeedState | null,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): boolean {
  if (!state?.databaseUrl) return false;

  const alvo =
    String(env.E2E_DATABASE_URL ?? "").trim() ||
    String(env.TEST_DATABASE_URL ?? "").trim() ||
    String(env.DATABASE_URL ?? "").trim();

  if (!alvo) return true;
  return fingerprintDatabaseUrl(alvo) === fingerprintDatabaseUrl(state.databaseUrl);
}

/** Lê `<dir>/.seed-state.json`; devolve null se ausente ou ilegível. */
export function readSeedState(dir: string): SeedState | null {
  const alvo = path.join(dir, SEED_STATE_FILENAME);
  try {
    if (!fs.existsSync(alvo)) return null;
    return JSON.parse(fs.readFileSync(alvo, "utf8")) as SeedState;
  } catch {
    return null;
  }
}

/**
 * Liga `E2E_SEEDED=1` quando o ambiente está declarado como preparado.
 * Devolve o motivo, para o config poder registrar em log.
 */
export function applySeedStateToEnv(
  e2eDir: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): { seeded: boolean; motivo: string } {
  if (String(env.E2E_SEEDED ?? "").trim() === "1") {
    return { seeded: true, motivo: "E2E_SEEDED=1 declarado no ambiente" };
  }

  const state = readSeedState(e2eDir);
  if (!state) {
    return { seeded: false, motivo: `sem ${SEED_STATE_FILENAME} — rode npm run e2e:prepare` };
  }
  if (!seedStateMatchesEnv(state, env)) {
    return {
      seeded: false,
      motivo: `${SEED_STATE_FILENAME} aponta para outro banco (${fingerprintDatabaseUrl(state.databaseUrl)})`,
    };
  }

  env.E2E_SEEDED = "1";
  return { seeded: true, motivo: `${SEED_STATE_FILENAME} de ${state.seededAt}` };
}

/** Consultado pelos specs em runtime. */
export function isSeededEnvironment(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  return String(env.E2E_SEEDED ?? "").trim() === "1";
}
