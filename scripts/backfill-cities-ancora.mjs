#!/usr/bin/env node
/**
 * Backfill `cities.is_ancora = true` para cidades que JÁ têm anúncios ativos
 * (>= `regional.min_anuncios_ancora`) no momento da execução.
 *
 * Por que existe?
 *   O hook `markCityAsAncoraIfEligible` (em `ads.create.pipeline.service.js`)
 *   só dispara em INSERT de anúncios novos. Para o estoque já existente
 *   (criado ANTES do hook ser adicionado), `is_ancora` continua `false`
 *   mesmo em cidades que claramente são âncoras pela regra.
 *
 *   Sem este backfill, a Nova Página Regional (`/:uf/regiao/:ancora`)
 *   retornaria 404 para cidades reais como `sao-paulo-sp` até alguém
 *   postar um anúncio novo lá — quebra a experiência de migração suave
 *   da rota legada para a nova.
 *
 * Idempotente:
 *   - Só atualiza onde `is_ancora = false` (não mexe em quem já é âncora).
 *   - `COALESCE(ancora_ativada_em, NOW())` preserva o timestamp original
 *     caso a coluna esteja populada de outro caminho.
 *   - Pode rodar quantas vezes quiser; converge ao estado correto.
 *
 * Uso:
 *   node scripts/backfill-cities-ancora.mjs
 *   DATABASE_URL=... node scripts/backfill-cities-ancora.mjs
 *
 * Não roda automaticamente em CI nem em deploy. Operação manual única
 * após aplicar a Fase 2 do regional (que adicionou `is_ancora`).
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";
import { getSetting } from "../src/modules/platform/settings.service.js";

const MIN_ANUNCIOS_DEFAULT = 1;

export async function backfillCitiesAncora() {
  const start = Date.now();

  // Lê o threshold de `platform_settings`. Se não tiver, usa default.
  let minAnuncios = MIN_ANUNCIOS_DEFAULT;
  try {
    const raw = await getSetting("regional.min_anuncios_ancora", MIN_ANUNCIOS_DEFAULT);
    const parsed = Number(raw);
    minAnuncios = Number.isFinite(parsed) && parsed > 0 ? parsed : MIN_ANUNCIOS_DEFAULT;
  } catch {
    // mantém default
  }

  console.log(`[ancora:backfill] min_anuncios_ancora = ${minAnuncios}`);

  // Dry-run primeiro: conta quantas serão afetadas, sem mexer.
  const { rows: preview } = await pool.query(
    `
    SELECT c.id, c.slug, c.state, COUNT(a.id) AS active_ads
    FROM cities c
    JOIN ads a ON a.city_id = c.id AND a.status = 'active'
    WHERE c.is_ancora = false
    GROUP BY c.id, c.slug, c.state
    HAVING COUNT(a.id) >= $1
    ORDER BY active_ads DESC, c.state ASC, c.slug ASC
    `,
    [minAnuncios]
  );

  if (!preview.length) {
    console.log(
      "[ancora:backfill] Nenhuma cidade elegível — todas as cidades com anúncios ativos já estão marcadas (ou não há anúncios ativos suficientes)."
    );
    return { affected: 0, sample: [] };
  }

  console.log(`[ancora:backfill] ${preview.length} cidades elegíveis. Top 10:`);
  for (const row of preview.slice(0, 10)) {
    console.log(`  - ${row.slug.padEnd(40)} (${row.state}): ${row.active_ads} ads ativos`);
  }

  // UPDATE em batch. Idempotente: só toca quem está com is_ancora=false.
  const result = await pool.query(
    `
    UPDATE cities c
    SET is_ancora = true,
        ancora_ativada_em = COALESCE(ancora_ativada_em, NOW()),
        updated_at = NOW()
    WHERE c.is_ancora = false
      AND c.id IN (
        SELECT a.city_id
        FROM ads a
        WHERE a.status = 'active'
        GROUP BY a.city_id
        HAVING COUNT(*) >= $1
      )
    `,
    [minAnuncios]
  );

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[ancora:backfill] OK — ${result.rowCount ?? 0} cidades marcadas como âncora em ${elapsedSec}s.`
  );

  return { affected: result.rowCount ?? 0, sample: preview.slice(0, 10) };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  try {
    await backfillCitiesAncora();
  } catch (err) {
    console.error("[ancora:backfill] Falha:", err?.stack || err?.message || err);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
