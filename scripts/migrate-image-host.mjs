#!/usr/bin/env node
/**
 * Troca o HOST das URLs de imagem já gravadas no banco.
 *
 * POR QUE ESTE SCRIPT EXISTE
 *
 * As fotos de anúncio são servidas hoje por `pub-<hash>.r2.dev` — o *public
 * development URL* do Cloudflare R2, que a Cloudflare não recomenda para
 * produção por ser limitado por taxa. A migração para domínio próprio
 * (`img.carrosnacidade.com`) NÃO se resolve trocando `R2_PUBLIC_BASE_URL`:
 * o banco guarda a URL ABSOLUTA, não a chave.
 *
 *   - `createAd` grava `images` verbatim          (ads.repository.js:32-35)
 *   - o upload monta `${R2_PUBLIC_BASE_URL}/${key}` no cliente
 *     (frontend/lib/painel/upload-draft-photos-direct-r2.ts:116)
 *   - na leitura, `normalizePublicImageCandidate` devolve URL absoluta SEM
 *     reescrever (ads.public-images.js) — só CHAVE crua recebe host da env
 *
 * Logo a env só afeta uploads NOVOS. O acervo existente precisa deste script.
 *
 * SEGURO POR CONSTRUÇÃO
 *
 * O host antigo continua servindo o mesmo bucket depois do custom domain —
 * os dois coexistem. Então esta migração não tem janela de indisponibilidade:
 * antes, durante e depois, as duas URLs funcionam.
 *
 * USO
 *
 *   # dry-run (padrão — não grava nada)
 *   DATABASE_URL="$DATABASE_URL1" node scripts/migrate-image-host.mjs \
 *     --from=https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev \
 *     --to=https://img.carrosnacidade.com
 *
 *   # aplicar
 *   DATABASE_URL="$DATABASE_URL1" node scripts/migrate-image-host.mjs \
 *     --from=... --to=... --apply --confirm-target=carros_na_cidade_db
 *
 *   # escopos
 *   --table=ads|blog_posts|home_sections|vehicle_images|all   (default: all)
 *   --limit=N        teto de linhas por tabela
 *   --id=N           uma linha só (PK da tabela)
 *   --stamp=YYYYMMDD sufixo das tabelas de backup (default: hoje)
 *
 * REVERSÃO
 *
 * Duas camadas, ambas impressas ao final do `--apply`:
 *
 *   1. Snapshot (criado ANTES do UPDATE, dentro da mesma transação):
 *        UPDATE ads a SET images = b.images
 *        FROM ads_images_backup_<stamp> b WHERE a.id = b.id;
 *
 *   2. Simetria: rodar de novo com --from e --to trocados desfaz o replace.
 *
 * FOOTGUN DO ALVO
 *
 * `getPoolConfig` lê SOMENTE `DATABASE_URL` (pool-config.js:13), e neste
 * projeto `DATABASE_URL` aponta para `localhost:5433/carros_na_cidade_test`
 * enquanto produção vive em `DATABASE_URL1`. Sem guard, um `--apply`
 * distraído reescreve o banco de teste e parece ter funcionado. Por isso o
 * script imprime host/db/user antes de qualquer escrita e exige
 * `--confirm-target=<nome-do-banco>` batendo com `current_database()`.
 */

import "dotenv/config";

import { pool, closeDatabasePool, getPoolConfig } from "../src/infrastructure/database/db.js";

/* ------------------------------------------------------------------ args -- */

const argv = process.argv.slice(2);

function flag(name) {
  return argv.includes(`--${name}`);
}

function value(name, fallback = null) {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const FROM_RAW = value("from");
const TO_RAW = value("to");
const APPLY = flag("apply");
const CONFIRM_TARGET = value("confirm-target");
const TABLE_FILTER = (value("table", "all") || "all").toLowerCase();
const LIMIT = value("limit") ? Math.max(1, Number.parseInt(value("limit"), 10) || 0) : null;
const ONLY_ID = value("id") ? Number.parseInt(value("id"), 10) : null;
const STAMP = value("stamp") || new Date().toISOString().slice(0, 10).replace(/-/g, "");

function die(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!FROM_RAW || !TO_RAW) {
  die(
    "--from e --to são obrigatórios.\n  ex.: --from=https://pub-xxx.r2.dev --to=https://img.exemplo.com"
  );
}

/** Normaliza para origem canônica (protocolo + host), sem barra final. */
function toOrigin(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    die(`${label} não é uma URL absoluta válida: ${raw}`);
  }
  if (!/^https?:$/.test(url.protocol)) die(`${label} precisa ser http(s): ${raw}`);
  if (url.pathname !== "/" && url.pathname !== "") {
    die(`${label} deve ser só a origem (sem caminho). Recebido: ${raw}`);
  }
  return `${url.protocol}//${url.host}`;
}

const FROM = toOrigin(FROM_RAW, "--from");
const TO = toOrigin(TO_RAW, "--to");

if (FROM.toLowerCase() === TO.toLowerCase()) die("--from e --to são o mesmo host. Nada a fazer.");
if (!STAMP.match(/^\d{8}$/)) die(`--stamp deve ser YYYYMMDD. Recebido: ${STAMP}`);

/* --------------------------------------------------------------- targets -- */

/**
 * Cada alvo declara COMO o valor guarda a URL:
 *
 *   url       → a coluna É uma URL. Replace de PREFIXO (não substring solto:
 *               evita mangling de uma URL que só CONTENHA o host).
 *   jsonb     → array JSONB de strings (ads.images). Mapeia elemento a
 *               elemento; elemento não-string é preservado e contabilizado.
 *   embedded  → texto livre que pode CONTER URLs (corpo do post). Replace
 *               global da origem — aqui substring é o comportamento correto.
 */
const TARGETS = [
  { table: "ads", pk: "id", columns: [{ name: "images", kind: "jsonb" }] },
  {
    table: "blog_posts",
    pk: "id",
    columns: [
      { name: "cover_image_url", kind: "url" },
      { name: "og_image_url", kind: "url" },
      { name: "content", kind: "embedded" },
    ],
  },
  {
    table: "home_sections",
    pk: "id",
    columns: [
      { name: "image_desktop_url", kind: "url" },
      { name: "image_mobile_url", kind: "url" },
    ],
  },
  // CONDICIONAL: `vehicle_images` não está nas migrations e o próprio código
  // a consulta via information_schema antes de usar (ads.public-images.js).
  // Pode simplesmente não existir. A checagem de existência abaixo cobre.
  { table: "vehicle_images", pk: "id", columns: [{ name: "image_url", kind: "url" }] },
];

/* ---------------------------------------------------------------- replace -- */

const FROM_LOWER = FROM.toLowerCase();

/** URL absoluta cuja origem casa o --from (comparação case-insensitive). */
function matchesFrom(str) {
  return typeof str === "string" && str.toLowerCase().startsWith(FROM_LOWER);
}

function replacePrefix(str) {
  return TO + str.slice(FROM.length);
}

/** Replace global da origem, para texto que EMBUTE urls. */
function replaceEmbedded(text) {
  // Sem regex: split/join é imune a caractere especial no host.
  return text.split(FROM).join(TO);
}

/** Classifica um valor de imagem para o relatório de órfãos. */
function classify(str, stats) {
  if (typeof str !== "string" || !str.trim()) {
    stats.vazio += 1;
    return "vazio";
  }
  if (matchesFrom(str)) {
    stats.casa += 1;
    return "casa";
  }
  if (str.toLowerCase().startsWith(TO.toLowerCase())) {
    stats.jaNoDestino += 1;
    return "ja-no-destino";
  }
  if (/^https?:\/\//i.test(str)) {
    stats.outroHost += 1;
    stats.exemplosOutroHost.add(new URL(str).origin);
    return "outro-host";
  }
  stats.relativo += 1;
  stats.exemplosRelativo.add(str.slice(0, 40));
  return "relativo";
}

function novoStats() {
  return {
    casa: 0,
    jaNoDestino: 0,
    outroHost: 0,
    relativo: 0,
    vazio: 0,
    naoString: 0,
    exemplosOutroHost: new Set(),
    exemplosRelativo: new Set(),
  };
}

/* ------------------------------------------------------------- inspeção -- */

async function tableExists(table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

/**
 * Lê as linhas candidatas e calcula o novo valor de cada coluna.
 * Não grava — devolve o plano para o dry-run e para o --apply.
 */
async function planTable(target) {
  const cols = [];
  for (const col of target.columns) {
    if (await columnExists(target.table, col.name)) cols.push(col);
  }
  if (cols.length === 0) return { ...target, existe: false, motivo: "sem colunas conhecidas" };

  const colList = cols.map((c) => `"${c.name}"`).join(", ");
  const where = [];
  const params = [];

  // Só linhas que CONTENHAM o host de origem em alguma das colunas — evita
  // varrer a tabela inteira e mantém o UPDATE cirúrgico.
  const ors = cols.map((c) => {
    params.push(`%${FROM}%`);
    return `COALESCE("${c.name}"::text, '') ILIKE $${params.length}`;
  });
  where.push(`(${ors.join(" OR ")})`);

  if (ONLY_ID != null && Number.isInteger(ONLY_ID)) {
    params.push(ONLY_ID);
    where.push(`"${target.pk}" = $${params.length}`);
  }

  const limitSql = LIMIT ? ` LIMIT ${LIMIT}` : "";
  const { rows } = await pool.query(
    `SELECT "${target.pk}" AS __pk, ${colList}
       FROM "${target.table}"
      WHERE ${where.join(" AND ")}
      ORDER BY "${target.pk}" ASC${limitSql}`,
    params
  );

  const stats = novoStats();
  const updates = [];
  const amostras = [];

  for (const row of rows) {
    const changes = {};

    for (const col of cols) {
      const atual = row[col.name];

      if (col.kind === "jsonb") {
        const arr = Array.isArray(atual) ? atual : [];
        let mudou = false;
        const novo = arr.map((item) => {
          if (typeof item !== "string") {
            stats.naoString += 1;
            return item;
          }
          classify(item, stats);
          if (matchesFrom(item)) {
            mudou = true;
            return replacePrefix(item);
          }
          return item;
        });
        if (mudou) {
          changes[col.name] = { kind: "jsonb", valor: novo };
          if (amostras.length < 5) {
            const i = arr.findIndex((x) => matchesFrom(x));
            amostras.push({ pk: row.__pk, col: col.name, antes: arr[i], depois: novo[i] });
          }
        }
        continue;
      }

      if (typeof atual !== "string" || !atual) {
        stats.vazio += 1;
        continue;
      }

      if (col.kind === "embedded") {
        if (atual.includes(FROM)) {
          const ocorrencias = atual.split(FROM).length - 1;
          stats.casa += ocorrencias;
          const novo = replaceEmbedded(atual);
          changes[col.name] = { kind: "text", valor: novo };
          if (amostras.length < 5) {
            const at = atual.indexOf(FROM);
            amostras.push({
              pk: row.__pk,
              col: `${col.name} (${ocorrencias}× embutida)`,
              antes: atual.slice(at, at + 72),
              depois: replaceEmbedded(atual.slice(at, at + 72)),
            });
          }
        }
        continue;
      }

      // kind === "url"
      classify(atual, stats);
      if (matchesFrom(atual)) {
        const novo = replacePrefix(atual);
        changes[col.name] = { kind: "text", valor: novo };
        if (amostras.length < 5) {
          amostras.push({ pk: row.__pk, col: col.name, antes: atual, depois: novo });
        }
      }
    }

    if (Object.keys(changes).length > 0) updates.push({ pk: row.__pk, changes });
  }

  return { ...target, existe: true, cols, rows: rows.length, updates, stats, amostras };
}

/* ------------------------------------------------------------------ apply -- */

function backupTableName(table) {
  return `${table}_images_backup_${STAMP}`;
}

async function applyPlan(client, plan) {
  const backup = backupTableName(plan.table);
  const colList = plan.cols.map((c) => `"${c.name}"`).join(", ");
  const ids = plan.updates.map((u) => u.pk);

  // Snapshot ANTES do UPDATE, na mesma transação: se o UPDATE falhar, o
  // ROLLBACK derruba a tabela de backup junto e não sobra lixo.
  //
  // Comparação por TEXTO de propósito. As migrations declaram BIGSERIAL, mas
  // produção divergiu — `ads.id` e `blog_posts.id` são `integer` e
  // `home_sections.id` é `bigint` (verificado em 2026-07-26). Um
  // `= ANY($1::bigint[])` dependeria de resolução implícita int4=int8 e
  // quebraria de vez se alguma PK virasse uuid. `::text` funciona nos três.
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${backup}" AS
       SELECT "${plan.pk}" AS ${plan.pk}, ${colList}
         FROM "${plan.table}"
        WHERE "${plan.pk}"::text = ANY($1::text[])`,
    [ids.map((id) => String(id))]
  );

  let gravadas = 0;
  for (const u of plan.updates) {
    const sets = [];
    const params = [];
    for (const [colName, change] of Object.entries(u.changes)) {
      if (change.kind === "jsonb") {
        params.push(JSON.stringify(change.valor));
        sets.push(`"${colName}" = $${params.length}::jsonb`);
      } else {
        params.push(change.valor);
        sets.push(`"${colName}" = $${params.length}`);
      }
    }
    params.push(u.pk);
    const res = await client.query(
      `UPDATE "${plan.table}" SET ${sets.join(", ")} WHERE "${plan.pk}" = $${params.length}`,
      params
    );
    gravadas += res.rowCount || 0;
  }

  return { backup, gravadas };
}

/* ------------------------------------------------------------------ main -- */

function fmtOrigem() {
  const cs = getPoolConfig().connectionString || "";
  try {
    const u = new URL(cs);
    return { host: u.host, db: u.pathname.replace(/^\//, ""), user: u.username };
  } catch {
    return { host: "(indeterminado)", db: "(indeterminado)", user: "(indeterminado)" };
  }
}

async function main() {
  const alvo = fmtOrigem();
  const { rows: dbRows } = await pool.query("SELECT current_database() AS db, current_user AS usr");
  const dbAtual = dbRows[0]?.db || "(?)";

  console.log(
    `\n=== Migração de host de imagens — modo: ${APPLY ? "APPLY (GRAVA)" : "DRY-RUN"} ===\n`
  );
  console.log("ALVO DO BANCO");
  console.log(`  host : ${alvo.host}`);
  console.log(`  db   : ${dbAtual}`);
  console.log(`  user : ${dbRows[0]?.usr || alvo.user}`);
  if (/localhost|127\.0\.0\.1/.test(alvo.host)) {
    console.log("  ⚠️  LOCALHOST — provavelmente o banco de TESTE.");
    console.log('      Produção exige: DATABASE_URL="$DATABASE_URL1"');
  }
  console.log(`\n  de   : ${FROM}`);
  console.log(`  para : ${TO}`);
  if (LIMIT) console.log(`  limit: ${LIMIT} linhas por tabela`);
  if (ONLY_ID != null) console.log(`  id   : ${ONLY_ID}`);
  console.log("");

  const escopo = TARGETS.filter((t) => TABLE_FILTER === "all" || TABLE_FILTER === t.table);
  if (escopo.length === 0) {
    die(
      `--table=${TABLE_FILTER} não corresponde a nenhum alvo conhecido: ${TARGETS.map((t) => t.table).join(", ")}`
    );
  }

  const planos = [];
  for (const target of escopo) {
    if (!(await tableExists(target.table))) {
      console.log(`[${target.table.padEnd(15)}] tabela AUSENTE — pulada`);
      continue;
    }
    const plano = await planTable(target);
    if (!plano.existe) {
      console.log(`[${target.table.padEnd(15)}] ${plano.motivo} — pulada`);
      continue;
    }
    planos.push(plano);

    const s = plano.stats;
    console.log(
      `[${plano.table.padEnd(15)}] ${String(plano.updates.length).padStart(4)} linhas a alterar` +
        ` | ${String(s.casa).padStart(4)} URLs casam --from` +
        ` | ${s.jaNoDestino} já no destino` +
        ` | ${s.outroHost} em outro host` +
        ` | ${s.relativo} relativas`
    );
  }

  const totalLinhas = planos.reduce((acc, p) => acc + p.updates.length, 0);
  const totalUrls = planos.reduce((acc, p) => acc + p.stats.casa, 0);
  const totalOrfaos = planos.reduce((acc, p) => acc + p.stats.outroHost, 0);
  const totalRelativas = planos.reduce((acc, p) => acc + p.stats.relativo, 0);

  console.log(`\nTOTAL: ${totalLinhas} linhas | ${totalUrls} URLs a trocar`);

  // Órfãos: URL absoluta de imagem que NÃO casa o --from. Se houver, alguma
  // imagem vai continuar em host antigo//terceiro sem ninguém perceber.
  if (totalOrfaos > 0 || totalRelativas > 0) {
    console.log("\n⚠️  NÃO casam o --from (não serão migradas):");
    for (const p of planos) {
      if (p.stats.outroHost > 0) {
        console.log(
          `   [${p.table}] ${p.stats.outroHost} em outro host: ${[...p.stats.exemplosOutroHost].join(", ")}`
        );
      }
      if (p.stats.relativo > 0) {
        console.log(
          `   [${p.table}] ${p.stats.relativo} relativas (proxy/legado, esperado): ${[...p.stats.exemplosRelativo].slice(0, 3).join(" · ")}`
        );
      }
      if (p.stats.naoString > 0) {
        console.log(`   [${p.table}] ${p.stats.naoString} elementos não-string preservados`);
      }
    }
  }

  const amostras = planos
    .flatMap((p) => p.amostras.map((a) => ({ ...a, table: p.table })))
    .slice(0, 5);
  if (amostras.length > 0) {
    console.log("\nAMOSTRAS (antes → depois):");
    for (const a of amostras) {
      console.log(`\n  ${a.table}#${a.pk} · ${a.col}`);
      console.log(`    - ${a.antes}`);
      console.log(`    + ${a.depois}`);
    }
  }

  if (!APPLY) {
    console.log("\nDRY-RUN — nada gravado. Para aplicar:");
    console.log(`  --apply --confirm-target=${dbAtual}\n`);
    return;
  }

  /* ---- guard do alvo: só a partir daqui existe risco de escrita ---- */

  if (!CONFIRM_TARGET) {
    die(
      `--apply exige --confirm-target=<banco>.\n` +
        `  O banco conectado agora é "${dbAtual}" (host ${alvo.host}).\n` +
        `  Se for esse mesmo, repita com --confirm-target=${dbAtual}`
    );
  }
  if (CONFIRM_TARGET !== dbAtual) {
    die(
      `--confirm-target="${CONFIRM_TARGET}" NÃO bate com o banco conectado "${dbAtual}".\n` +
        `  Nada foi gravado. Confira o DATABASE_URL antes de repetir.`
    );
  }
  if (totalLinhas === 0) {
    console.log("\nNada a fazer — nenhuma linha casou o --from.\n");
    return;
  }

  const client = await pool.connect();
  const backups = [];
  try {
    await client.query("BEGIN");
    for (const plano of planos) {
      if (plano.updates.length === 0) continue;
      const { backup, gravadas } = await applyPlan(client, plano);
      backups.push({ table: plano.table, pk: plano.pk, backup, cols: plano.cols });
      console.log(`  ✓ ${plano.table}: ${gravadas} linhas · backup em "${backup}"`);
    }
    await client.query("COMMIT");
    console.log("\n✓ COMMIT — migração aplicada.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`\n✗ ROLLBACK — nada foi gravado. Erro: ${err?.message || err}\n`);
    process.exitCode = 1;
    return;
  } finally {
    client.release();
  }

  console.log("REVERSÃO (guardar):");
  for (const b of backups) {
    const sets = b.cols.map((c) => `"${c.name}" = b."${c.name}"`).join(", ");
    console.log(
      `  UPDATE "${b.table}" a SET ${sets} FROM "${b.backup}" b WHERE a."${b.pk}" = b."${b.pk}";`
    );
  }
  console.log("\n  ou, simetricamente:");
  console.log(
    `  node scripts/migrate-image-host.mjs --from=${TO} --to=${FROM} --apply --confirm-target=${dbAtual}\n`
  );
}

main()
  .catch((err) => {
    console.error(`\n✗ Falha: ${err?.stack || err}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabasePool();
  });
