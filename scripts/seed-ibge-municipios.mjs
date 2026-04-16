#!/usr/bin/env node
/**
 * Carrega todos os municípios brasileiros do IBGE no Postgres (tabela `cities`).
 * Script canônico para cobertura 5500+ cidades.
 *
 * Uso: node scripts/seed-ibge-municipios.mjs
 * Requer: DATABASE_URL no .env
 *
 * Slug canônico: slugify(nome)-uf (ex: "sao-paulo-sp", "atibaia-sp")
 * Idempotente: ignora slugs já existentes via ON CONFLICT.
 */
import "dotenv/config";
import { pool } from "../src/infrastructure/database/db.js";
import { slugify } from "../src/shared/utils/slugify.js";

const UF_IBGE = {
  AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41,
  PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42,
  SE: 28, SP: 35, TO: 17,
};

const UF_REGION = {
  AC: "Norte", AL: "Nordeste", AM: "Norte", AP: "Norte", BA: "Nordeste",
  CE: "Nordeste", DF: "Centro-Oeste", ES: "Sudeste", GO: "Centro-Oeste",
  MA: "Nordeste", MT: "Centro-Oeste", MS: "Centro-Oeste", MG: "Sudeste",
  PA: "Norte", PB: "Nordeste", PR: "Sul", PE: "Nordeste", PI: "Nordeste",
  RJ: "Sudeste", RN: "Nordeste", RS: "Sul", RO: "Norte", RR: "Norte",
  SC: "Sul", SE: "Nordeste", SP: "Sudeste", TO: "Norte",
};

async function fetchMunicipios(estadoId, sigla) {
  const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoId}/municipios`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IBGE ${sigla}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error(`IBGE ${sigla}: resposta inválida`);
  return data;
}

async function main() {
  console.log("Sincronizando municípios IBGE → cities …");

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [sigla, estadoId] of Object.entries(UF_IBGE)) {
      try {
        const list = await fetchMunicipios(estadoId, sigla);
        const region = UF_REGION[sigla] || null;

        for (const m of list) {
          const nome = String(m.nome || "").trim();
          if (!nome) continue;
          const slug = `${slugify(nome)}-${sigla.toLowerCase()}`;

          const r = await client.query(
            `
            INSERT INTO cities (name, state, slug, stage, region)
            VALUES ($1, $2, $3, 'seed', $4)
            ON CONFLICT (slug) DO NOTHING
            RETURNING id
            `,
            [nome, sigla, slug, region]
          );

          if (r.rowCount) inserted += 1;
          else skipped += 1;
        }

        console.log(`  ${sigla}: ${list.length} municípios (região: ${region})`);
      } catch (e) {
        console.error(`  ${sigla}: ERRO — ${e.message}`);
        errors += 1;
      }
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Falha geral:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\nConcluído: ${inserted} novos, ${skipped} existentes, ${errors} UFs com erro`);
  console.log(`Total de cidades esperado: ~5.570 municípios brasileiros`);
}

main();
