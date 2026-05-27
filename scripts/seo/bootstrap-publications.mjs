#!/usr/bin/env node
/**
 * Bootstrap manual de `seo_publications` a partir de clusters já existentes
 * em `seo_cluster_plans` (Fase 3.1).
 *
 * Contexto
 * --------
 * - Fase 3 deixou o painel admin SEO funcional, tolerando schema reduzido em
 *   prod (hotfix 0701e6d2). Mas `seo_publications` ficou com 0 linhas.
 * - O pipeline normal (`runClusterExecutorEngine` → `publishClusterContent`)
 *   depende de AI orchestrator real para gerar conteúdo. **Fora de escopo
 *   da Fase 3.1** (ver brief do operador).
 * - Este script cria publicações mínimas **factuais** (sem IA) a partir de
 *   dados reais de cidades — para reduzir issues `cluster_without_publication`
 *   no painel e validar PATCH de mutation end-to-end.
 *
 * Comportamento
 * -------------
 * - PADRÃO É DRY-RUN. Para persistir é obrigatório `--apply`.
 * - `--limit=N` (default 4). Processa no máximo N clusters elegíveis.
 * - Idempotente: pula clusters que já têm publicação associada por path.
 * - INSERT defensivo via `information_schema.columns`: só grava colunas que
 *   existem no schema real, registra o que foi omitido.
 * - Aborta sem persistir se uma coluna ESSENCIAL (path, title, status)
 *   estiver ausente.
 * - Promove `scp.status` para `'published'` após cada inserção bem-sucedida
 *   (mantém alinhamento com SITEMAP_ELIGIBLE_SCP_STATUSES).
 *
 * Uso
 * ---
 *   # Dry-run (default; nenhuma escrita):
 *   node scripts/seo/bootstrap-publications.mjs --dry-run --limit=4
 *   node scripts/seo/bootstrap-publications.mjs                 # ainda dry-run
 *
 *   # Persistência (exige --apply EXPLÍCITO):
 *   node scripts/seo/bootstrap-publications.mjs --apply --limit=4
 *
 * Saída
 * -----
 * Em ambos os modos, retorna um resumo com:
 *   - colunas detectadas em seo_publications
 *   - campos omitidos por ausência de coluna
 *   - clusters elegíveis encontrados
 *   - clusters pulados (motivo)
 *   - publicações criadas
 *   - paths gerados
 */

import { loadDotenvIfAvailable } from "./bootstrap-cluster-plans.mjs";

const DEFAULT_LIMIT = 4;
const MAX_LIMIT = 50;
const ESSENTIAL_COLUMNS = ["path", "title", "status"];
const FACTUAL_CONTENT_MIN_WORDS = 60;

export function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    apply: false,
    dryRunFlagSeen: false,
  };

  for (const raw of argv.slice(2)) {
    if (raw === "--apply" || raw === "--yes") {
      args.apply = true;
    } else if (raw === "--dry-run") {
      args.dryRunFlagSeen = true;
    } else if (raw.startsWith("--limit=")) {
      const n = Number(raw.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) {
        args.limit = Math.min(MAX_LIMIT, Math.floor(n));
      }
    }
  }

  args.dryRun = !args.apply;
  return args;
}

function defaultLog(level, message, meta) {
  const prefix = "[bootstrap-publications]";
  const line =
    meta !== undefined ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Geração factual de title a partir do cluster + city snapshot.
 * NÃO usa IA. Só fatos do DB.
 */
export function buildFactualTitle(cluster) {
  const city = cluster.city_name || cluster.city_slug || "cidade";
  const state = cluster.city_state ? ` - ${cluster.city_state}` : "";
  switch (cluster.cluster_type) {
    case "city_home":
      return `Carros usados em ${city}${state} | Carros na Cidade`;
    case "city_below_fipe":
      return `Carros abaixo da tabela FIPE em ${city}${state} | Carros na Cidade`;
    case "city_opportunities":
      return `Oportunidades de carros em ${city}${state} | Carros na Cidade`;
    case "city_brand":
      return `${cluster.brand || "Marcas"} em ${city}${state} | Carros na Cidade`;
    case "city_brand_model":
      return `${cluster.brand || ""} ${cluster.model || ""} em ${city}${state} | Carros na Cidade`.replace(
        /\s+/g,
        " "
      );
    default:
      return `Veículos em ${city}${state} | Carros na Cidade`;
  }
}

/**
 * Conteúdo factual: parágrafos descritivos baseados em dados agregados reais
 * (contagem de anúncios ativos, lista de marcas dominantes, etc.).
 *
 * NÃO chama IA. NÃO inventa fatos. Se snapshot vier sem dados (ex.: cidade
 * recém-cadastrada sem anúncios), gera texto mais curto. Caller decide o
 * que fazer com base no min de palavras (controle no `runBootstrapPublications`).
 */
export function buildFactualContent({ cluster, citySnapshot }) {
  const city = cluster.city_name || cluster.city_slug || "esta cidade";
  const state = cluster.city_state ? `, ${cluster.city_state}` : "";
  const liveAds = Number(citySnapshot?.live_ads_count || 0);
  const belowFipe = Number(citySnapshot?.below_fipe_ads_count || 0);
  const advertisers = Number(citySnapshot?.advertisers_count || 0);

  const intro = describeIntro(cluster, city, state);
  const supply = describeSupply(cluster, { liveAds, belowFipe, advertisers });
  const guidance = describeGuidance(cluster, city);

  return [intro, supply, guidance].filter(Boolean).join("\n\n");
}

function describeIntro(cluster, city, state) {
  switch (cluster.cluster_type) {
    case "city_home":
      return `O portal Carros na Cidade reúne anúncios de veículos usados em ${city}${state}. Aqui você encontra ofertas de lojistas e particulares verificados, com filtros por marca, modelo, ano e preço.`;
    case "city_below_fipe":
      return `Esta página lista carros usados em ${city}${state} com preço abaixo da tabela FIPE. Cada anúncio mostra a diferença em relação ao valor de referência, permitindo comparar oportunidades reais.`;
    case "city_opportunities":
      return `Oportunidades de compra em ${city}${state}: anúncios em destaque, carros com desconto agressivo e ofertas verificadas pela equipe Carros na Cidade.`;
    default:
      return `Veículos disponíveis em ${city}${state} no portal Carros na Cidade.`;
  }
}

function describeSupply(cluster, { liveAds, belowFipe, advertisers }) {
  const parts = [];
  if (liveAds > 0) {
    parts.push(`Atualmente há ${liveAds} anúncio${liveAds === 1 ? "" : "s"} ativo${liveAds === 1 ? "" : "s"} cadastrado${liveAds === 1 ? "" : "s"} nesta cidade.`);
  } else {
    parts.push(
      "Os anúncios disponíveis são atualizados diariamente conforme novas ofertas são publicadas."
    );
  }
  if (belowFipe > 0 && cluster.cluster_type !== "city_below_fipe") {
    parts.push(
      `${belowFipe} desses anúncios está${belowFipe === 1 ? "" : "ão"} marcado${belowFipe === 1 ? "" : "s"} como abaixo da tabela FIPE.`
    );
  } else if (cluster.cluster_type === "city_below_fipe" && belowFipe > 0) {
    parts.push(
      `${belowFipe} veículo${belowFipe === 1 ? "" : "s"} estão classificados como abaixo da FIPE neste momento. A comparação considera o valor de referência atual da tabela.`
    );
  }
  if (advertisers > 0) {
    parts.push(
      `${advertisers} anunciante${advertisers === 1 ? "" : "s"} está${advertisers === 1 ? "" : "ão"} cadastrado${advertisers === 1 ? "" : "s"} nesta região, entre lojistas e particulares.`
    );
  }
  return parts.join(" ");
}

function describeGuidance(cluster, city) {
  if (cluster.cluster_type === "city_below_fipe") {
    return `Para conferir cada oferta abaixo da FIPE, abra o anúncio e verifique a documentação, histórico do veículo e o valor de mercado. Carros na Cidade não intermedia a negociação — o contato é direto entre comprador e vendedor.`;
  }
  if (cluster.cluster_type === "city_opportunities") {
    return `As oportunidades em destaque são revisadas pela equipe e priorizam anúncios com fotos, preço dentro da faixa de mercado e anunciante ativo nos últimos 30 dias.`;
  }
  return `Use os filtros de marca, modelo, faixa de preço e ano para refinar a busca em ${city}. Cada anúncio tem foto, descrição e canal direto com o anunciante.`;
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/**
 * Constrói o payload factual para INSERT (já filtrando colunas existentes).
 * Retorna `{ row, omitted }` onde row é objeto column→value e omitted é
 * lista de campos que NÃO foram emitidos por ausência de coluna no schema.
 */
export function buildPublicationRow({ cluster, citySnapshot, detectedColumns }) {
  const cols = detectedColumns instanceof Set ? detectedColumns : new Set(detectedColumns);

  const title = buildFactualTitle(cluster);
  const content = buildFactualContent({ cluster, citySnapshot });
  const wordCount = countWords(content);
  const meetsMinContent = wordCount >= FACTUAL_CONTENT_MIN_WORDS;

  // Excerpt = primeiros 157 chars do conteúdo, sem quebrar palavra.
  const excerpt = (() => {
    const clean = content.replace(/\s+/g, " ").trim();
    if (clean.length <= 157) return clean;
    return clean.slice(0, 157).replace(/\s+\S*$/, "") + "...";
  })();

  const candidate = {
    cluster_plan_id: cluster.id,
    path: cluster.path,
    title,
    content,
    excerpt,
    city_id: cluster.city_id,
    brand: cluster.brand || null,
    model: cluster.model || null,
    publication_type: cluster.cluster_type,
    content_provider: "bootstrap-factual-v1",
    content_stage: cluster.stage || "discovery",
    is_money_page: Boolean(cluster.money_page),
    is_indexable: meetsMinContent,
    health_status: meetsMinContent ? "healthy" : "needs_review",
    status: "published",
  };

  const row = {};
  const omitted = [];
  for (const [field, value] of Object.entries(candidate)) {
    if (cols.has(field)) {
      row[field] = value;
    } else {
      omitted.push(field);
    }
  }

  return { row, omitted, wordCount, meetsMinContent };
}

/**
 * Lógica core extraída para testes (injeção de deps).
 *
 * @param {object} opts
 * @param {number} opts.limit
 * @param {boolean} opts.dryRun
 * @param {() => Promise<Set<string>>} opts.detectColumns introspecciona seo_publications
 * @param {(limit: number) => Promise<Array>} opts.listEligibleClusters clusters sem publicação
 * @param {(cityId: number, citySlug?: string) => Promise<object|null>} opts.getCitySnapshot
 * @param {(row: object) => Promise<object>} opts.insertPublication
 * @param {(clusterPlanId: number) => Promise<void>} opts.markClusterPublished
 * @param {(level: string, message: string, meta?: unknown) => void} [opts.log]
 */
export async function runBootstrapPublications({
  limit,
  dryRun,
  detectColumns,
  listEligibleClusters,
  getCitySnapshot,
  insertPublication,
  markClusterPublished,
  log = defaultLog,
}) {
  log("info", "iniciando", { limit, dryRun });

  if (dryRun) {
    log("info", "DRY-RUN: nenhuma escrita ao banco. Use --apply para persistir.");
  } else {
    log("info", "MODO APPLY: vai escrever em seo_publications e promover scp.status.");
  }

  const cols = await detectColumns();
  const detectedSorted = [...cols].sort();
  log("info", "colunas detectadas em seo_publications", { count: cols.size, columns: detectedSorted });

  const missingEssentials = ESSENTIAL_COLUMNS.filter((c) => !cols.has(c));
  if (missingEssentials.length > 0) {
    log(
      "error",
      "ABORTANDO: colunas essenciais ausentes em seo_publications. Pipeline não pode persistir sem elas.",
      { missing: missingEssentials }
    );
    return {
      ok: false,
      reason: "missing_essential_columns",
      missing: missingEssentials,
      detectedColumns: detectedSorted,
    };
  }

  const clusters = await listEligibleClusters(limit);
  log("info", "clusters elegíveis (sem publicação) encontrados", { count: clusters.length });

  const skipped = [];
  const prepared = [];

  for (const cluster of clusters) {
    if (!cluster.path || !cluster.city_id) {
      skipped.push({
        cluster_id: cluster.id,
        reason: "missing_path_or_city_id",
      });
      continue;
    }
    const snapshot = cluster.city_slug ? await getCitySnapshot(cluster.city_id, cluster.city_slug) : null;
    const built = buildPublicationRow({ cluster, citySnapshot: snapshot, detectedColumns: cols });
    if (!built.meetsMinContent) {
      log("info", "cluster com conteúdo factual abaixo do mínimo — vai entrar como noindex", {
        cluster_id: cluster.id,
        path: cluster.path,
        wordCount: built.wordCount,
      });
    }
    prepared.push({ cluster, ...built });
  }

  log("info", "preparação concluída", {
    totalClusters: clusters.length,
    prepared: prepared.length,
    skipped: skipped.length,
  });

  for (const p of prepared) {
    log("info", `preview ${p.cluster.cluster_type} ${p.cluster.path}`, {
      title: p.row.title,
      omitted: p.omitted,
      is_indexable: p.row.is_indexable,
      wordCount: p.wordCount,
    });
  }

  if (dryRun) {
    log(
      "info",
      `DRY-RUN concluído. ${prepared.length} publicação(ões) seriam criada(s). Re-rodar com --apply para persistir.`
    );
    return {
      ok: true,
      dryRun: true,
      detectedColumns: detectedSorted,
      omittedSample: prepared[0]?.omitted ?? [],
      totals: {
        eligibleClusters: clusters.length,
        prepared: prepared.length,
        skipped: skipped.length,
        created: 0,
      },
      skipped,
      previews: prepared.map((p) => ({
        cluster_id: p.cluster.id,
        path: p.cluster.path,
        title: p.row.title,
        is_indexable: p.row.is_indexable,
      })),
    };
  }

  const created = [];
  const failures = [];

  for (const p of prepared) {
    try {
      const inserted = await insertPublication(p.row);
      if (inserted) {
        await markClusterPublished(p.cluster.id);
        created.push({
          publication_id: inserted.id ?? null,
          cluster_id: p.cluster.id,
          path: p.cluster.path,
          is_indexable: p.row.is_indexable,
        });
        log("info", `criado ${p.cluster.path}`, { publication_id: inserted.id });
      } else {
        skipped.push({ cluster_id: p.cluster.id, reason: "insert_no_op" });
      }
    } catch (err) {
      failures.push({
        cluster_id: p.cluster.id,
        path: p.cluster.path,
        error: err?.message || String(err),
      });
      log("error", `falha ao criar ${p.cluster.path}: ${err?.message || err}`);
      // Não aborta: continua com próximos clusters
    }
  }

  log("info", "apply concluído", {
    created: created.length,
    failures: failures.length,
    skipped: skipped.length,
  });

  return {
    ok: failures.length === 0,
    dryRun: false,
    detectedColumns: detectedSorted,
    totals: {
      eligibleClusters: clusters.length,
      prepared: prepared.length,
      skipped: skipped.length,
      created: created.length,
      failures: failures.length,
    },
    created,
    failures,
    skipped,
  };
}

/**
 * Helpers SQL — exportados para teste isolado.
 */

export async function detectSeoPublicationColumns({ query: q }) {
  const { rows } = await q(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'seo_publications'`
  );
  return new Set(rows.map((r) => r.column_name));
}

export async function listEligibleClusterPlans({ query: q }, limit) {
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || DEFAULT_LIMIT));
  const { rows } = await q(
    `SELECT
       scp.id,
       scp.cluster_type,
       scp.path,
       scp.brand,
       scp.model,
       scp.money_page,
       scp.priority,
       scp.status,
       scp.stage,
       scp.city_id,
       c.name AS city_name,
       c.state AS city_state,
       c.slug AS city_slug
     FROM seo_cluster_plans scp
     LEFT JOIN seo_publications sp ON sp.cluster_plan_id = scp.id
     JOIN cities c ON c.id = scp.city_id
     WHERE scp.status IN ('planned','generated')
       AND sp.id IS NULL
     ORDER BY scp.priority DESC NULLS LAST, scp.updated_at ASC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

export async function getCitySnapshotForBootstrap({ query: q }, cityId) {
  const { rows } = await q(
    `SELECT
       c.id,
       c.name,
       c.state,
       c.slug,
       (SELECT COUNT(*)::int FROM ads a WHERE a.city_id = c.id AND a.status = 'active') AS live_ads_count,
       (SELECT COUNT(*)::int FROM ads a WHERE a.city_id = c.id AND a.status = 'active' AND a.below_fipe = TRUE) AS below_fipe_ads_count,
       (SELECT COUNT(DISTINCT advertiser_id)::int FROM ads a WHERE a.city_id = c.id AND a.status = 'active' AND a.advertiser_id IS NOT NULL) AS advertisers_count
     FROM cities c
     WHERE c.id = $1
     LIMIT 1`,
    [cityId]
  );
  return rows[0] || null;
}

export async function insertSeoPublicationDefensive({ query: q }, row) {
  const cols = Object.keys(row);
  if (cols.length === 0) {
    throw new Error("insertSeoPublicationDefensive: row vazia");
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
  const values = cols.map((c) => row[c]);
  const updateSet = cols
    .filter((c) => c !== "path" && c !== "cluster_plan_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(", ");

  const sql = `
    INSERT INTO seo_publications (${cols.join(",")})
    VALUES (${placeholders})
    ON CONFLICT (path)
    DO UPDATE SET
      ${updateSet}${updateSet ? "," : ""}
      updated_at = NOW()
    RETURNING id, path, status${cols.includes("is_indexable") ? ", is_indexable" : ""}
  `;
  const { rows } = await q(sql, values);
  return rows[0] || null;
}

export async function promoteClusterPlanToPublished({ query: q }, clusterPlanId) {
  await q(
    `UPDATE seo_cluster_plans
     SET status = 'published',
         last_generated_at = COALESCE(last_generated_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [clusterPlanId]
  );
}

// Entry-point CLI
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  const args = parseArgs(process.argv);
  await loadDotenvIfAvailable();

  let closeDatabasePool = async () => {};
  try {
    const [{ query: q }, dbModule] = await Promise.all([
      import("../../src/infrastructure/database/db.js"),
      import("../../src/infrastructure/database/db.js"),
    ]);
    closeDatabasePool = dbModule.closeDatabasePool;

    const deps = { query: q };

    const result = await runBootstrapPublications({
      limit: args.limit,
      dryRun: args.dryRun,
      detectColumns: () => detectSeoPublicationColumns(deps),
      listEligibleClusters: (lim) => listEligibleClusterPlans(deps, lim),
      getCitySnapshot: (cityId) => getCitySnapshotForBootstrap(deps, cityId),
      insertPublication: (row) => insertSeoPublicationDefensive(deps, row),
      markClusterPublished: (id) => promoteClusterPlanToPublished(deps, id),
    });

    // eslint-disable-next-line no-console
    console.log("\n=== resumo ===");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2));

    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[bootstrap-publications] FATAL:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
