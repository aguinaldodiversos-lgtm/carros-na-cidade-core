#!/usr/bin/env node
/**
 * Diagnóstico: quantas cidades existem no dicionário oficial e amostras de busca (UF + trecho).
 * Uso: node scripts/diagnostic-cities-panel.mjs
 * Requer: DATABASE_URL no .env (para contagem via loadCityDictionary / service).
 * Opcional: BASE_URL=http://localhost:4000 para testar HTTP /api/public/cities/search
 */
/* eslint-disable no-console */
import "dotenv/config";

const BASE = (process.env.BASE_URL || "http://localhost:4000").replace(/\/+$/, "");

async function httpSearch(q, uf) {
  const url = `${BASE}/api/public/cities/search?${new URLSearchParams({ q, uf })}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const json = await res.json().catch(() => ({}));
  const data = Array.isArray(json?.data) ? json.data : [];
  return { ok: res.ok, status: res.status, count: data.length, names: data.slice(0, 8).map((r) => r.name) };
}

async function main() {
  console.log("=== Cidades (dicionário oficial + cities.service) ===\n");

  try {
    const { loadCityDictionary } = await import(
      "../src/modules/ads/autocomplete/ads-autocomplete.repository.js"
    );
    const { searchCitiesByUfAndPartialName } = await import("../src/modules/cities/cities.service.js");

    const all = await loadCityDictionary(10000);
    console.log(`Registros retornados por loadCityDictionary(10000): ${all.length}`);

    const samples = [
      ["SP", "camp"],
      ["SP", "atib"],
      ["SP", "sao"],
    ];

    for (const [uf, q] of samples) {
      const found = await searchCitiesByUfAndPartialName(uf, q, 20);
      console.log(`\nUF=${uf} q="${q}" → ${found.length} cidade(s)`);
      console.log("  Primeiras:", found.slice(0, 6).map((c) => `${c.name} (id=${c.id})`).join(" | ") || "(nenhuma)");
    }
  } catch (e) {
    console.error("Erro ao consultar o banco via módulos Node:", e?.message || e);
    console.error("(Confira DATABASE_URL e se o Postgres está acessível.)\n");
  }

  console.log("\n=== HTTP (API pública de busca) ===\n");
  console.log(`BASE_URL=${BASE}`);
  try {
    for (const [uf, q] of [
      ["SP", "camp"],
      ["SP", "atib"],
    ]) {
      const r = await httpSearch(q, uf);
      console.log(`GET /api/public/cities/search q=${q} uf=${uf} → HTTP ${r.status}, ${r.count} resultado(s)`);
      if (r.names.length) console.log("  Amostra:", r.names.join(", "));
      if (!r.ok && r.status !== 200) console.log("  (backend pode estar parado ou URL incorreta)");
    }
  } catch (e) {
    console.error("HTTP falhou:", e?.message || e);
    console.error("(Inicie o backend: npm run dev na raiz do projeto.)\n");
  }

  console.log("\n=== Publicação de anúncio ===");
  console.log(
    "O POST /api/ads exige JWT (login). Valide no fluxo real: painel → novo anúncio → UF + cidade da lista → Publicar."
  );
  console.log("Smoke geral: npm run smoke (com BASE_URL apontando para sua API).\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
