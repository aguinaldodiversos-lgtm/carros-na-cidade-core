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
 * ── Atualização 2026-07-27 ───────────────────────────────────────────────────
 *
 * MOTIVO DE RODAR AGORA: o BFF descartava `transmission`/`body_type` da edição
 * do lojista em silêncio (whitelist de `pickEditablePayload`), então a coluna
 * ficava congelada no valor da CRIAÇÃO enquanto o opcional `cambio_*` seguia a
 * edição. Resultado: página exibindo um câmbio (derivado do opcional) e filtro
 * classificando por outro (a coluna). A whitelist foi corrigida; este backfill
 * alinha o acervo existente.
 *
 * MAPA MODELO → CARROCERIA (novo): antes, sem sinal no texto o script mandava
 * `body_type` para NULL — honesto para exibição ("Não informado"), mas deixava
 * o FILTRO de carroceria sem nada para casar. Kwid, T-Cross, Nivus e Dolphin
 * Mini iriam todos para NULL. Agora, quando o texto não nomeia a carroceria,
 * consultamos um mapa CURADO de modelos conhecidos; só cai para NULL quando o
 * modelo também é desconhecido.
 *
 * SEGURANÇA:
 *   - DRY-RUN por padrão: só mostra o que faria + amostras. Nada é gravado.
 *   - Grava apenas com `--apply` E `--confirm-target=<banco>` batendo com
 *     `current_database()` — guard contra o footgun do DATABASE_URL, que neste
 *     projeto aponta para localhost:5433/carros_na_cidade_test enquanto
 *     produção vive em DATABASE_URL1.
 *   - Snapshot das colunas ANTES do UPDATE, na mesma transação.
 *   - Só toca nas colunas `transmission` e `body_type`, por id, em transação.
 *
 * Uso:
 *   node scripts/backfill-cambio-carroceria.mjs            # dry-run
 *   node scripts/backfill-cambio-carroceria.mjs --apply --confirm-target=carros_na_cidade_db
 *   ... [--stamp=YYYYMMDD]   sufixo da tabela de snapshot (default: hoje)
 *
 * REVERSÃO (impressa ao final do --apply):
 *   UPDATE ads a SET transmission = b.transmission, body_type = b.body_type
 *     FROM ads_cambio_backup_<stamp> b WHERE a.id = b.id;
 */
import "dotenv/config";
import pg from "pg";

import {
  BODY_TYPE_SYNONYMS,
  TRANSMISSION_SYNONYMS,
} from "../src/modules/ads/ads.canonical.constants.js";
import { VEHICLE_OPTION_KEYS } from "../src/modules/ads/ad-options.catalog.js";

const APPLY = process.argv.includes("--apply");
const CONFIRM_TARGET = (process.argv.find((a) => a.startsWith("--confirm-target=")) || "").split(
  "="
)[1];
const STAMP =
  (process.argv.find((a) => a.startsWith("--stamp=")) || "").split("=")[1] ||
  new Date().toISOString().slice(0, 10).replace(/-/g, "");

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
    (s) =>
      new RegExp(`(?:^|[^0-9a-zà-ú])${escapeRe(String(s).toLowerCase())}(?:[^0-9a-zà-ú]|$)`, "i")
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

/**
 * Mapa CURADO modelo → carroceria, consultado só quando o texto NÃO nomeia a
 * carroceria ("Strada" não contém "picape"; "Renegade" não contém "suv").
 *
 * Por que existe: sem ele, o script mandava 23 anúncios para NULL. Correto
 * para a exibição (nunca chutar), mas o FILTRO de carroceria ficava sem nada
 * para casar — o usuário veria "SUV (0)" com um Renegade e um T-Cross no
 * estoque.
 *
 * É CURADO, não exaustivo: cobre o inventário atual e os modelos brasileiros
 * de maior volume. Modelo fora da lista continua indo para NULL, que é o
 * comportamento honesto. Ao entrar carro novo no acervo, estender aqui.
 *
 * ATENÇÃO a prefixos: "HB20S" é sedã e "HB20" é hatch. O casamento é por
 * TOKEN inteiro e a lista é ordenada do mais longo para o mais curto, então
 * "hb20s" é testado antes de "hb20".
 */
const BODY_BY_MODEL = {
  // hatch
  mobi: "hatch",
  argo: "hatch",
  kwid: "hatch",
  polo: "hatch",
  fox: "hatch",
  gol: "hatch",
  hb20: "hatch",
  c3: "hatch",
  onix: "hatch",
  uno: "hatch",
  celta: "hatch",
  march: "hatch",
  sandero: "hatch",
  "dolphin mini": "hatch",
  // sedan
  hb20s: "sedan",
  virtus: "sedan",
  voyage: "sedan",
  prisma: "sedan",
  siena: "sedan",
  cronos: "sedan",
  logan: "sedan",
  versa: "sedan",
  city: "sedan",
  corolla: "sedan",
  civic: "sedan",
  // suv
  renegade: "suv",
  pulse: "suv",
  "t-cross": "suv",
  tcross: "suv",
  nivus: "suv",
  compass: "suv",
  creta: "suv",
  kicks: "suv",
  duster: "suv",
  tracker: "suv",
  "hr-v": "suv",
  "wr-v": "suv",
  ecosport: "suv",
  captur: "suv",
  // picape
  strada: "picape",
  toro: "picape",
  saveiro: "picape",
  montana: "picape",
  hilux: "picape",
  ranger: "picape",
  s10: "picape",
  amarok: "picape",
  oroch: "picape",
};

// Mais longo primeiro: "hb20s" tem que ser testado antes de "hb20", e
// "dolphin mini" antes de qualquer token solto.
const BODY_BY_MODEL_ENTRIES = Object.entries(BODY_BY_MODEL).sort(
  (a, b) => b[0].length - a[0].length
);

/** Carroceria pelo NOME do modelo, quando o texto não nomeia a carroceria. */
function bodySlugFromModelName(haystack) {
  const h = String(haystack || "").toLowerCase();
  for (const [nome, slug] of BODY_BY_MODEL_ENTRIES) {
    // Fronteira tolerante a acento/hífen nas pontas, igual aos BODY_MATCHERS.
    const re = new RegExp(`(?:^|[^0-9a-zà-ú])${escapeRe(nome)}(?:[^0-9a-zà-ú]|$)`, "i");
    if (re.test(h)) return slug;
  }
  return null;
}

/* ── Backfill ────────────────────────────────────────────────────────────────── */

async function run() {
  const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);

  console.log(
    `\n=== Backfill câmbio/carroceria — modo: ${APPLY ? "APPLY (grava)" : "DRY-RUN"} ===\n`
  );

  // Guard do alvo. `DATABASE_URL` neste projeto aponta para o banco de TESTE
  // (localhost:5433); produção vive em `DATABASE_URL1`. Sem isto, um --apply
  // distraído reescreve o banco errado e parece ter funcionado.
  const [alvo] = await q("SELECT current_database() AS db, current_user AS usr");
  let host = "(indeterminado)";
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    /* connection string em formato não-URL */
  }
  console.log("ALVO DO BANCO");
  console.log(`  host : ${host}`);
  console.log(`  db   : ${alvo.db}`);
  console.log(`  user : ${alvo.usr}`);
  if (/localhost|127\.0\.0\.1/.test(host)) {
    console.log(
      '  ⚠️  LOCALHOST — provavelmente o banco de TESTE. Produção: DATABASE_URL="$DATABASE_URL1"'
    );
  }
  console.log("");

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
      cambioUpdates.push({
        id: ad.id,
        from: ad.transmission,
        to: slug,
        label: `${ad.brand} ${ad.model}`,
      });
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
    const texto = `${ad.model || ""} ${ad.title || ""}`;
    // Precedência: (1) texto nomeia a carroceria → confia; (2) modelo conhecido
    // no mapa curado; (3) NULL (sem sinal, não chuta).
    const porTexto = bodySlugFromText(texto);
    const porModelo = porTexto ? null : bodySlugFromModelName(texto);
    const sig = porTexto ?? porModelo;
    const next = sig ?? null;
    if (next !== "sedan") {
      bodyUpdates.push({
        id: ad.id,
        from: "sedan",
        to: next,
        label: `${ad.brand} ${ad.model}`,
        via: porTexto ? "texto" : porModelo ? "modelo" : "sem sinal",
      });
    }
  }

  // Resumo
  const bodyToNull = bodyUpdates.filter((u) => u.to === null).length;
  const bodyToSlug = bodyUpdates.length - bodyToNull;
  console.log(
    `CÂMBIO   — ${cambioRows.length} com opcional de câmbio; ${cambioUpdates.length} a corrigir (coluna ≠ opcional).`
  );
  console.log(
    `CARROCERIA — ${sedanRows.length} com body_type='sedan'; ${bodyUpdates.length} a corrigir (${bodyToSlug} → slug real, ${bodyToNull} → NULL).\n`
  );

  const porVia = bodyUpdates.reduce((acc, u) => ({ ...acc, [u.via]: (acc[u.via] || 0) + 1 }), {});
  console.log(
    `           via texto: ${porVia.texto || 0} · via mapa de modelo: ${porVia.modelo || 0} · sem sinal (NULL): ${porVia["sem sinal"] || 0}\n`
  );

  const sample = (arr) =>
    arr
      .slice(0, 8)
      .map(
        (u) => `  #${u.id} ${u.label}: ${u.from} → ${u.to ?? "NULL"}${u.via ? ` (${u.via})` : ""}`
      )
      .join("\n");
  if (cambioUpdates.length) console.log("Amostra câmbio:\n" + sample(cambioUpdates) + "\n");
  if (bodyUpdates.length) console.log("Amostra carroceria:\n" + sample(bodyUpdates) + "\n");

  if (!APPLY) {
    console.log("DRY-RUN — nada gravado. Para aplicar:");
    console.log(`  --apply --confirm-target=${alvo.db}\n`);
    return;
  }

  if (!CONFIRM_TARGET) {
    console.error(
      `\n✗ --apply exige --confirm-target=<banco>.\n` +
        `  O banco conectado agora é "${alvo.db}" (host ${host}).\n` +
        `  Se for esse mesmo, repita com --confirm-target=${alvo.db}\n`
    );
    process.exitCode = 1;
    return;
  }
  if (CONFIRM_TARGET !== alvo.db) {
    console.error(
      `\n✗ --confirm-target="${CONFIRM_TARGET}" NÃO bate com o banco conectado "${alvo.db}".\n` +
        `  Nada foi gravado.\n`
    );
    process.exitCode = 1;
    return;
  }
  if (cambioUpdates.length === 0 && bodyUpdates.length === 0) {
    console.log("Nada a fazer — nenhum anúncio a corrigir.\n");
    return;
  }

  const backup = `ads_cambio_backup_${STAMP}`;
  const ids = [...new Set([...cambioUpdates, ...bodyUpdates].map((u) => u.id))];

  // Aplica em transação.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Snapshot ANTES dos UPDATEs, na MESMA transação: se algo falhar, o
    // ROLLBACK derruba a tabela de backup junto e não sobra lixo.
    // Comparação por ::text porque `ads.id` é `integer` em produção apesar de
    // as migrations declararem BIGSERIAL (divergência real, verificada).
    await client.query(
      `CREATE TABLE IF NOT EXISTS "${backup}" AS
         SELECT id, transmission, body_type
           FROM ads
          WHERE id::text = ANY($1::text[])`,
      [ids.map(String)]
    );

    for (const u of cambioUpdates) {
      await client.query(`UPDATE ads SET transmission = $1 WHERE id = $2`, [u.to, u.id]);
    }
    for (const u of bodyUpdates) {
      await client.query(`UPDATE ads SET body_type = $1 WHERE id = $2`, [u.to, u.id]);
    }
    await client.query("COMMIT");
    console.log(
      `APLICADO: ${cambioUpdates.length} câmbio + ${bodyUpdates.length} carroceria atualizados.`
    );
    console.log(`Snapshot de ${ids.length} linha(s) em "${backup}".\n`);
    console.log("REVERSÃO (guardar):");
    console.log(
      `  UPDATE ads a SET transmission = b.transmission, body_type = b.body_type\n` +
        `    FROM "${backup}" b WHERE a.id = b.id;\n`
    );
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
