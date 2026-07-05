// scripts/verify-sitemap-brand-slug.mjs
//
// Verificação READ-ONLY (não escreve nada) da Onda 1 SEO, para rodar no SEU
// ambiente com o SEU .env/DB (NÃO usa produção automaticamente — usa o que
// estiver em DATABASE_URL). Mostra, ANTES do commit:
//
//   1. marcas ↔ slug corrigido (as que mudam + confirmação das que não mudam)
//   2. páginas marca+cidade resgatadas pelo fix de slug (noindex → index)
//   3. contagem de URLs por sitemap (cidade / marca+cidade / modelo+cidade)
//      com o filtro >= SITEMAP_MIN_ADS aplicado
//   4. recorte da região de Atibaia (cidades vizinhas com estoque)
//   5. ALERTA vermelho se qualquer contagem estourar o esperado (dezenas)
//
// Uso:  node scripts/verify-sitemap-brand-slug.mjs
//       (respeita SITEMAP_MIN_ADS do .env; default 3)

import "dotenv/config";

import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import {
  brandModelSlug,
  canonicalBrandSlug,
  canonicalBrandLabel,
} from "../src/shared/utils/slugify.js";
import { getSitemapMinAds } from "../src/read-models/seo/sitemap-min-ads.js";

// ── output helpers ──────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};
const h1 = (s) => console.log(`\n${C.bold}${C.cyan}=== ${s} ===${C.reset}`);
const ok = (s) => console.log(`${C.green}✓${C.reset} ${s}`);
const info = (s) => console.log(`  ${s}`);
const warn = (s) => console.log(`${C.yellow}⚠ ${s}${C.reset}`);
const alert = (s) => console.log(`${C.red}${C.bold}🚨 ALERTA: ${s}${C.reset}`);

// Acima disso, um sitemap "de dezenas" virou "milhares" → filtro provavelmente
// falhou. Ajuste se o catálogo real crescer muito.
const ALERT_THRESHOLD = Number.parseInt(process.env.VERIFY_ALERT_THRESHOLD ?? "", 10) || 500;

const MIN = getSitemapMinAds();

/** dedup por chave somando total (espelha a dedup do sitemap-service). */
function dedupeSum(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (Number(r.total) || 0));
  }
  return map;
}

async function main() {
  console.log(`${C.bold}Verificação Onda 1 — sitemap + slug de marca${C.reset}`);
  console.log(`${C.dim}SITEMAP_MIN_ADS = ${MIN} | alerta acima de ${ALERT_THRESHOLD} URLs/tipo${C.reset}`);

  let hadAlert = false;

  // ── 1. Marcas ↔ slug ──────────────────────────────────────────────────────
  h1("1. Marcas no catálogo (ads.brand) ↔ slug corrigido");
  const brandsRes = await pool.query(
    `SELECT brand, COUNT(*)::int AS total
       FROM ads
      WHERE status = 'active' AND brand IS NOT NULL AND btrim(brand) <> ''
      GROUP BY brand
      ORDER BY total DESC`
  );
  const changed = [];
  let unchanged = 0;
  for (const row of brandsRes.rows) {
    const oldSlug = brandModelSlug(row.brand);
    const newSlug = canonicalBrandSlug(row.brand);
    if (oldSlug !== newSlug) {
      changed.push({ brand: row.brand, oldSlug, newSlug, display: canonicalBrandLabel(row.brand), total: row.total });
    } else {
      unchanged += 1;
    }
  }
  info(`marcas distintas com estoque ativo: ${brandsRes.rows.length}`);
  if (changed.length === 0) {
    warn("nenhuma marca com prefixo de grupo FIPE encontrada no estoque atual (ok se não há GM/VW).");
  } else {
    ok(`${changed.length} marca(s) MUDAM de slug (resgatadas pelo fix):`);
    for (const c of changed) {
      console.log(
        `    "${c.brand}"  ${c.oldSlug} ${C.red}→${C.reset} ${C.green}${c.newSlug}${C.reset}  (exibição: "${c.display}", ${c.total} anúncios)`
      );
    }
  }
  ok(`${unchanged} marca(s) NÃO mudam (slug = slugify(nome)).`);

  // ── linhas por cidade+marca (base para 2 e 3) ─────────────────────────────
  const cityBrandRows = (
    await pool.query(
      `SELECT c.slug AS city_slug, c.state, a.brand, COUNT(*)::int AS total
         FROM ads a JOIN cities c ON c.id = a.city_id
        WHERE a.status = 'active' AND a.brand IS NOT NULL AND btrim(a.brand) <> ''
        GROUP BY c.slug, c.state, a.brand`
    )
  ).rows;

  // ── 2. Páginas marca+cidade resgatadas (noindex → index) ──────────────────
  h1("2. Páginas marca+cidade: efeito do fix + limiar");
  const brandPageSum = dedupeSum(cityBrandRows, (r) => `${r.city_slug}|${canonicalBrandSlug(r.brand)}`);
  const eligibleBrandPages = [...brandPageSum.entries()].filter(([, total]) => total >= MIN);

  // resgatadas pelo SLUG = grupos elegíveis cujo brand tinha prefixo FIPE
  const changedBrandKeys = new Set();
  for (const r of cityBrandRows) {
    if (brandModelSlug(r.brand) !== canonicalBrandSlug(r.brand)) {
      changedBrandKeys.add(`${r.city_slug}|${canonicalBrandSlug(r.brand)}`);
    }
  }
  const rescued = eligibleBrandPages.filter(([key]) => changedBrandKeys.has(key));
  // afetadas pelo LIMIAR: grupos com 1..MIN-1 anúncios que agora ficam noindex
  const belowThreshold = [...brandPageSum.values()].filter((t) => t >= 1 && t < MIN).length;

  ok(`marca+cidade index-elegíveis (>= ${MIN}): ${eligibleBrandPages.length}`);
  ok(`  das quais resgatadas pelo fix de slug (GM/VW etc.): ${C.green}${rescued.length}${C.reset}`);
  info(`${belowThreshold} combinação(ões) marca+cidade com 1..${MIN - 1} anúncios → ficam noindex (proteção anti-thin, intencional).`);
  if (rescued.length > 0) {
    info("exemplos resgatados:");
    rescued.slice(0, 10).forEach(([key, total]) => console.log(`    /cidade/${key.split("|")[0]}/marca/${key.split("|")[1]}  (${total} anúncios)`));
  }

  // ── 3. Contagem de URLs por sitemap (com filtro >= MIN) ───────────────────
  h1(`3. URLs por sitemap (filtro >= ${MIN} anúncios ativos)`);

  // cidade (/carros-em/[slug])
  const cityCount = (
    await pool.query(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT c.slug FROM ads a JOIN cities c ON c.id = a.city_id
          WHERE a.status='active' GROUP BY c.slug HAVING COUNT(*) >= $1
       ) t`,
      [MIN]
    )
  ).rows[0].n;

  // marca+cidade (dedup por slug canônico, soma, >= MIN)
  const brandSitemapCount = eligibleBrandPages.length;

  // modelo+cidade
  const cityBrandModelRows = (
    await pool.query(
      `SELECT c.slug AS city_slug, a.brand, a.model, COUNT(*)::int AS total
         FROM ads a JOIN cities c ON c.id = a.city_id
        WHERE a.status='active' AND a.brand IS NOT NULL AND btrim(a.brand)<>''
          AND a.model IS NOT NULL AND btrim(a.model)<>''
        GROUP BY c.slug, a.brand, a.model`
    )
  ).rows;
  const modelSum = dedupeSum(
    cityBrandModelRows,
    (r) => `${r.city_slug}|${canonicalBrandSlug(r.brand)}|${brandModelSlug(r.model)}`
  );
  const modelSitemapCount = [...modelSum.values()].filter((t) => t >= MIN).length;

  // below-fipe (/carros-baratos-em/[slug]) — só cidades com >= MIN anúncios abaixo da FIPE
  const belowFipeRows = (
    await pool.query(
      `SELECT c.slug AS city_slug, COUNT(*)::int AS total
         FROM ads a JOIN cities c ON c.id = a.city_id
        WHERE a.status='active' AND a.below_fipe = true
        GROUP BY c.slug HAVING COUNT(*) >= $1
        ORDER BY COUNT(*) DESC`,
      [MIN]
    )
  ).rows;
  const belowFipeCount = belowFipeRows.length;

  const report = [
    ["cities.xml      (/carros-em/[slug])", cityCount],
    ["below-fipe.xml  (/carros-baratos-em/[slug])", belowFipeCount],
    ["brands.xml      (/cidade/[c]/marca/[b])", brandSitemapCount],
    ["models.xml      (/cidade/[c]/marca/[b]/modelo/[m])", modelSitemapCount],
  ];
  for (const [label, n] of report) {
    if (n > ALERT_THRESHOLD) {
      hadAlert = true;
      alert(`${label}: ${n} URLs — MUITO acima do esperado (dezenas). Filtro pode ter falhado!`);
    } else {
      ok(`${label}: ${n} URL(s)`);
    }
  }
  // Confirmação explícita do Bug 1: Bragança (0 abaixo-FIPE) NÃO pode aparecer.
  const bragancaInBelowFipe = belowFipeRows.some((r) => r.city_slug === "braganca-paulista-sp");
  if (bragancaInBelowFipe) {
    hadAlert = true;
    alert("braganca-paulista-sp AINDA está no below-fipe.xml — o filtro não pegou!");
  } else {
    ok("braganca-paulista-sp FORA do below-fipe.xml (correto).");
  }
  if (belowFipeRows.length > 0) {
    info(`cidades no below-fipe.xml: ${belowFipeRows.map((r) => `${r.city_slug}(${r.total})`).join(", ")}`);
  }

  // ── 4. Recorte da região de Atibaia ───────────────────────────────────────
  h1("4. Região de Atibaia (base + cidades vizinhas)");
  const region = await pool.query(
    `SELECT base.slug AS base_slug, m.slug AS member_slug, m.name AS member_name,
            rm.layer, rm.distance_km
       FROM cities base
       JOIN region_memberships rm ON rm.base_city_id = base.id
       JOIN cities m ON m.id = rm.member_city_id
      WHERE base.slug = 'atibaia-sp'
      ORDER BY rm.layer, rm.distance_km`
  );
  if (region.rows.length === 0) {
    warn("nenhuma membership para atibaia-sp (região não populada? rode regions:build). Pulando recorte.");
  } else {
    const slugs = ["atibaia-sp", ...region.rows.map((r) => r.member_slug)];
    const counts = (
      await pool.query(
        `SELECT c.slug, COUNT(*)::int AS total
           FROM ads a JOIN cities c ON c.id = a.city_id
          WHERE a.status='active' AND c.slug = ANY($1)
          GROUP BY c.slug`,
        [slugs]
      )
    ).rows;
    const byCity = new Map(counts.map((r) => [r.slug, r.total]));
    info(`região tem ${slugs.length} cidade(s) (base + ${region.rows.length} vizinhas):`);
    let regionEligible = 0;
    for (const slug of slugs) {
      const n = byCity.get(slug) || 0;
      const flag = n >= MIN ? `${C.green}index/sitemap${C.reset}` : `${C.dim}noindex (<${MIN})${C.reset}`;
      if (n >= MIN) regionEligible += 1;
      console.log(`    ${slug.padEnd(28)} ${String(n).padStart(4)} anúncios  → ${flag}`);
    }
    ok(`cidades da região de Atibaia que entram no sitemap (>= ${MIN}): ${regionEligible}`);
  }

  // ── veredito ──────────────────────────────────────────────────────────────
  h1("Veredito");
  if (hadAlert) {
    alert("Uma ou mais contagens estouraram o esperado. NÃO commite — investigue o filtro.");
    process.exitCode = 1;
  } else {
    ok("Todas as contagens dentro do esperado (dezenas, não milhares). Seguro para revisão.");
  }

  await closeDatabasePool();
}

main().catch(async (err) => {
  console.error(`${C.red}Falha na verificação:${C.reset}`, err?.message || err);
  try {
    await closeDatabasePool();
  } catch {
    /* noop */
  }
  process.exitCode = 1;
});
