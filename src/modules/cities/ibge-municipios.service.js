import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { slugify } from "../../shared/utils/slugify.js";

/** Código IBGE da unidade federativa (API /localidades/estados/{id}/municipios) */
const UF_IBGE = {
  AC: 12,
  AL: 27,
  AM: 13,
  AP: 16,
  BA: 29,
  CE: 23,
  DF: 53,
  ES: 32,
  GO: 52,
  MA: 21,
  MT: 51,
  MS: 50,
  MG: 31,
  PA: 15,
  PB: 25,
  PR: 41,
  PE: 26,
  PI: 22,
  RJ: 33,
  RN: 24,
  RS: 43,
  RO: 11,
  RR: 14,
  SC: 42,
  SE: 28,
  SP: 35,
  TO: 17,
};

const ufFetchCache = new Map();

/**
 * Lista municípios de uma UF direto do IBGE (apenas essa UF — rápido).
 */
export async function fetchIbgeMunicipiosForUf(ufNorm) {
  const code = String(ufNorm ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (code.length !== 2) return [];

  const estadoId = UF_IBGE[code];
  if (!estadoId) {
    logger.warn({ uf: code }, "[ibge] UF sem código IBGE mapeado");
    return [];
  }

  if (ufFetchCache.has(code)) {
    return ufFetchCache.get(code);
  }

  const base =
    process.env.IBGE_ESTADO_MUNICIPIOS_URL?.trim() ||
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoId}/municipios`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(base, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`IBGE HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error("IBGE: resposta não é array");
    }

    const out = data.map((m) => {
      const nome = typeof m.nome === "string" ? m.nome.trim() : "";
      const slug = `${slugify(nome)}-${code.toLowerCase()}`;
      return {
        name: nome,
        state: code,
        slug,
        ibgeId: typeof m.id === "number" ? m.id : Number(m.id) || null,
      };
    });

    ufFetchCache.set(code, out);
    return out;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Insere no banco municípios da UF que ainda não existem (slug como chave lógica).
 */
export async function upsertMunicipiosForUfFromIbge(ufNorm) {
  const code = String(ufNorm ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (code.length !== 2) return { inserted: 0, skipped: 0 };

  const list = await fetchIbgeMunicipiosForUf(code);
  if (!list.length) {
    logger.warn({ uf: code }, "[ibge] Nenhum município retornado do IBGE para a UF");
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of list) {
      const r = await client.query(
        `
        INSERT INTO cities (name, state, slug)
        SELECT $1::text, $2::text, $3::text
        WHERE NOT EXISTS (SELECT 1 FROM cities WHERE slug = $3)
        RETURNING id
        `,
        [row.name, row.state, row.slug]
      );
      if (r.rowCount) inserted += 1;
      else skipped += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(
      { err: err?.message || String(err), uf: code },
      "[ibge] Falha ao inserir municípios"
    );
    throw err;
  } finally {
    client.release();
  }

  logger.info({ uf: code, inserted, skipped }, "[ibge] Sincronização de municípios concluída");
  return { inserted, skipped };
}

/**
 * default: true — desative com CITIES_IBGE_AUTO_SEED=false se preferir só o script npm run seed:cities
 */
export function isIbgeAutoSeedEnabled() {
  const raw = process.env.CITIES_IBGE_AUTO_SEED;
  if (raw === undefined || raw === "") return true;
  return !["0", "false", "no", "off"].includes(String(raw).trim().toLowerCase());
}
