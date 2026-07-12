/**
 * Fase C — Backfill de câmbio/carroceria dos anúncios legados.
 *
 * Contexto: até a Fase B, o wizard gravava `transmission="Automático"` e
 * `body_type="Sedã"` como DEFAULT hardcoded (o anunciante nunca informava).
 * O único sinal REAL de câmbio é o opcional `cambio_*` que ele marcou.
 *
 * Este script corrige os dados já gravados, espelhando a lógica de exibição
 * da Fase A (mas gravando SLUGS canônicos ou NULL nas colunas):
 *
 *  CÂMBIO: para anúncios com UMA chave `cambio_*` nos opcionais, alinha a
 *    coluna `transmission` ao que o anunciante marcou (fonte única). Anúncios
 *    sem opcional de câmbio NÃO são tocados (não há sinal confiável).
 *
 *  CARROCERIA: para `body_type='sedan'` (possível default falso):
 *    - se o texto (modelo/título) indica uma carroceria → corrige p/ ela
 *      (ex.: "Onix Hatch" gravado como sedan → hatch; texto que diz "sedan"
 *      confirma e mantém);
 *    - senão (sedan "solto", sem sinal) → NULL (= "Não informado"), nunca chuta.
 *    Valores NÃO-sedan reconhecidos ficam intactos.
 *
 * SEGURANÇA:
 *   - DRY-RUN por padrão: só mostra o que faria + amostras. Nada é gravado.
 *   - Grava apenas com a flag `--apply`.
 *   - Só toca nas colunas `transmission` e `body_type`, por id, em transação.
 *
 * Uso:
 *   node scripts/backfill-cambio-carroceria.mjs            # dry-run
 *   node scripts/backfill-cambio-carroceria.mjs --apply    # aplica
 */
import "dotenv/config";
import pg from "pg";

import {
  BODY_TYPE_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "../src/modules/ads/ads.canonical.constants.js";
import { VEHICLE_OPTION_KEYS } from "../src/modules/ads/ad-options.catalog.js";

const APPLY = process.argv.includes("--apply");

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 20000,
});

/* ── Vocabulário canônico (fonte ÚNICA = backend) ────────────────────────────
 * Raiz (Fase A/B: cadastro + normalização) e legado (este backfill) usam os
 * MESMOS mapas — nada de tabela paralela aqui. Se o vocabulário mudar no
 * backend, o backfill acompanha automaticamente.
 *   BODY_TYPE_SYNONYMS + TRANSMISSION_SYNONYMS → ads.canonical.constants.js
 *   chaves de câmbio (cambio_*)                → ad-options.catalog.js
 */

// sinônimo/rótulo → slug de câmbio (ex.: "automatizado" → "automatico").
const TRANSMISSION_BY_SYNONYM = new Map();
for (const [slug, synonyms] of Object.entries(TRANSMISSION_SYNONYMS)) {
  TRANSMISSION_BY_SYNONYM.set(slug, slug);
  for (const s of synonyms) TRANSMISSION_BY_SYNONYM.set(String(s).toLowerCase(), slug);
}

// chaves de câmbio válidas (cambio_*), lidas do catálogo canônico de opcionais.
const CAMBIO_OPTION_KEYS = new Set(VEHICLE_OPTION_KEYS.filter((k) => k.startsWith("cambio_")));

/** cambio_* key → slug de câmbio, via sinônimos canônicos. null se desconhecida. */
function cambioKeyToSlug(key) {
  if (!CAMBIO_OPTION_KEYS.has(key)) return null;
  const token = key.slice("cambio_".length).toLowerCase(); // manual|automatico|automatizado|cvt
  return TRANSMISSION_BY_SYNONYM.get(token) || null;
}

// Matcher de carroceria a partir de TEXTO livre (model + title), construído dos
// MESMOS sinônimos canônicos. Cada sinônimo é testado como palavra inteira
// (fronteira tolerante a acento). NÃO há mapa modelo→carroceria: só reconhece a
// carroceria quando o próprio texto a nomeia; caso contrário devolve null.
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const BODY_MATCHERS = Object.entries(BODY_TYPE_SYNONYMS).map(([slug, synonyms]) => ({
  slug,
  res: synonyms.map(
    (s) => new RegExp(`(?:^|[^0-9a-zà-ú])${escapeRe(String(s).toLowerCase())}(?:[^0-9a-zà-ú]|$)`, "i")
  ),
}));

/** Extrai as keys de opcionais de um vehicle_options jsonb (objeto/array/string). */
function extractOptionKeys(stored) {
  let raw = stored;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  const out = [];
  if (Array.isArray(raw)) out.push(...raw);
  else if (raw && typeof raw === "object") {
    for (const v of Object.values(raw)) if (Array.isArray(v)) out.push(...v);
  }
  return out.map((k) => String(k ?? "").trim()).filter(Boolean);
}

/** Slug de câmbio a partir do opcional marcado; null se 0 ou conflitante. */
function cambioSlugFromOptions(stored) {
  const cambio = extractOptionKeys(stored).filter((k) => k.startsWith("cambio_"));
  const slugs = [...new Set(cambio.map(cambioKeyToSlug).filter(Boolean))];
  return slugs.length === 1 ? slugs[0] : null;
}

/** Slug de carroceria a partir do texto (modelo/título), via sinônimos canônicos; null se sem sinal. */
function bodySlugFromText(haystack) {
  const h = String(haystack || "").toLowerCase();
  for (const { slug, res } of BODY_MATCHERS) {
    if (res.some((re) => re.test(h))) return slug;
  }
  return null;
}

/* ── Backfill ────────────────────────────────────────────────────────────────── */

async function run() {
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);

  console.log(`\n=== Backfill câmbio/carroceria — modo: ${APPLY ? "APPLY (grava)" : "DRY-RUN"} ===\n`);

  // 1) CÂMBIO: anúncios com opcional de câmbio cuja coluna transmission diverge.
  const cambioRows = await q(
    `SELECT id, brand, model, transmission, vehicle_options
       FROM ads
      WHERE vehicle_options::text ILIKE '%cambio\\_%'`
  );
  const cambioUpdates = [];
  for (const ad of cambioRows) {
    const slug = cambioSlugFromOptions(ad.vehicle_options);
    if (slug && ad.transmission !== slug) {
      cambioUpdates.push({ id: ad.id, from: ad.transmission, to: slug, label: `${ad.brand} ${ad.model}` });
    }
  }

  // 2) CARROCERIA: body_type='sedan' possivelmente default falso.
  const sedanRows = await q(
    `SELECT id, brand, model, title, body_type
       FROM ads
      WHERE body_type = 'sedan'`
  );
  const bodyUpdates = [];
  for (const ad of sedanRows) {
    // A tabela `ads` NÃO tem coluna de versão/trim: a versão do veículo vive
    // embutida no `title` (ex.: "VW Gol 1.6 Comfortline"). Usamos model + title,
    // as únicas fontes de texto disponíveis no schema real.
    const sig = bodySlugFromText(`${ad.model || ""} ${ad.title || ""}`);
    const next = sig ?? null; // sem sinal → NULL; com sinal → o slug (pode ser 'sedan')
    if (next !== "sedan") {
      bodyUpdates.push({ id: ad.id, from: "sedan", to: next, label: `${ad.brand} ${ad.model}` });
    }
  }

  // Resumo
  const bodyToNull = bodyUpdates.filter((u) => u.to === null).length;
  const bodyToSlug = bodyUpdates.length - bodyToNull;
  console.log(`CÂMBIO   — ${cambioRows.length} com opcional de câmbio; ${cambioUpdates.length} a corrigir (coluna ≠ opcional).`);
  console.log(`CARROCERIA — ${sedanRows.length} com body_type='sedan'; ${bodyUpdates.length} a corrigir (${bodyToSlug} → slug real, ${bodyToNull} → NULL).\n`);

  const sample = (arr) =>
    arr.slice(0, 8).map((u) => `  #${u.id} ${u.label}: ${u.from} → ${u.to ?? "NULL"}`).join("\n");
  if (cambioUpdates.length) console.log("Amostra câmbio:\n" + sample(cambioUpdates) + "\n");
  if (bodyUpdates.length) console.log("Amostra carroceria:\n" + sample(bodyUpdates) + "\n");

  if (!APPLY) {
    console.log("DRY-RUN — nada gravado. Rode com --apply para aplicar.\n");
    return;
  }

  // Aplica em transação.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const u of cambioUpdates) {
      await client.query(`UPDATE ads SET transmission = $1 WHERE id = $2`, [u.to, u.id]);
    }
    for (const u of bodyUpdates) {
      await client.query(`UPDATE ads SET body_type = $1 WHERE id = $2`, [u.to, u.id]);
    }
    await client.query("COMMIT");
    console.log(`APLICADO: ${cambioUpdates.length} câmbio + ${bodyUpdates.length} carroceria atualizados.\n`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

run()
  .catch((e) => {
    console.error("ERRO:", e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
