// scripts/explore-region-radius.mjs
//
// READ-ONLY. Mostra a cobertura de vizinhança de uma cidade-base por raio
// (Haversine, region_memberships) + estoque ativo de cada cidade, para você
// CRAVAR o RAIO_PADRAO_KM olhando o resultado real.
//
// Uso:  node scripts/explore-region-radius.mjs [citySlug]
//       (default: atibaia-sp)

import "dotenv/config";

import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import {
  getRadiusMembers,
  getOwnActiveCount,
} from "../src/read-models/cities/regional-radius.repository.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
};

const slug = (process.argv[2] || "atibaia-sp").trim();
const BUCKETS = [25, 40, 50, 100];

async function stockFor(citySlug) {
  return getOwnActiveCount(citySlug);
}

async function main() {
  console.log(`${C.bold}Cobertura por raio — ${slug}${C.reset} ${C.dim}(Haversine, region_memberships)${C.reset}`);

  const ownStock = await getOwnActiveCount(slug);
  console.log(`\n${C.cyan}Cidade-base:${C.reset} ${slug} — ${C.green}${ownStock}${C.reset} anúncios ativos`);

  // Membros até o maior bucket; depois filtramos por bucket em JS.
  const members = await getRadiusMembers(slug, Math.max(...BUCKETS));
  if (members.length === 0) {
    console.log(`${C.dim}Sem membros no region_memberships (região não populada? rode regions:build).${C.reset}`);
    await closeDatabasePool();
    return;
  }

  // Estoque de cada membro (sequencial simples; poucas cidades).
  const stock = new Map();
  for (const m of members) stock.set(m.slug, await stockFor(m.slug));

  for (const radius of BUCKETS) {
    const inRadius = members.filter((m) => Number(m.distance_km) <= radius);
    const withStock = inRadius.filter((m) => (stock.get(m.slug) || 0) > 0);
    const totalNearbyAds = inRadius.reduce((s, m) => s + (stock.get(m.slug) || 0), 0);
    console.log(
      `\n${C.bold}Raio ${radius} km${C.reset}: ${inRadius.length} cidade(s), ${withStock.length} com estoque, ${totalNearbyAds} anúncios de vizinhas`
    );
    for (const m of inRadius) {
      const n = stock.get(m.slug) || 0;
      const flag = n > 0 ? `${C.green}${n}${C.reset}` : `${C.dim}0${C.reset}`;
      console.log(`    ${String(Math.round(Number(m.distance_km))).padStart(3)} km  ${m.slug.padEnd(30)} ${flag} anúncios`);
    }
  }

  console.log(
    `\n${C.dim}Lembrete: expansão por raio é EXPERIÊNCIA — nenhuma vizinha vira URL indexável.${C.reset}`
  );
  await closeDatabasePool();
}

main().catch(async (err) => {
  console.error("Falha:", err?.message || err);
  try {
    await closeDatabasePool();
  } catch {
    /* noop */
  }
  process.exitCode = 1;
});
