#!/usr/bin/env node
/**
 * Smoke do invariante territorial contra PRODUÇÃO.
 *
 *   "Uma cidade só existe a partir do momento em que um anunciante publica um
 *    anúncio nela."
 *
 * Ver `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * Verifica, contra o site real (não fixture, não local):
 *   1. município real SEM anúncio → 404 em todas as variantes;
 *   2. município INVENTADO → 404 e comportamento INDISTINGUÍVEL do item 1
 *      (qualquer diferença = sobrou catálogo de municípios em algum lugar);
 *   3. cidade COM estoque → 200, com robots conforme CITY_INDEX_MIN_ADS;
 *   4. o 404 é REAL (status HTTP), não soft-404 (200 com página de erro).
 *
 * Uso:
 *   node scripts/smoke/city-existence-smoke.mjs
 *   node scripts/smoke/city-existence-smoke.mjs --base https://staging.exemplo
 *   node scripts/smoke/city-existence-smoke.mjs --json
 *
 * Saída: exit 0 se tudo passou, 1 se houve divergência.
 *
 * UA de navegador de propósito: o backend tem bot-blocker por User-Agent e
 * curl/node cru levam 429 "rate_limited" com Retry-After de 24h.
 */

const args = process.argv.slice(2);
const BASE = (
  args.includes("--base") ? args[args.indexOf("--base") + 1] : "https://www.carrosnacidade.com"
).replace(/\/+$/, "");
const AS_JSON = args.includes("--json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** As 7 variantes com escopo de cidade. */
const CITY_ROUTES = [
  "/comprar/cidade",
  "/carros-em",
  "/carros-baratos-em",
  "/carros-automaticos-em",
  "/tabela-fipe",
  "/simulador-financiamento",
  "/blog",
  // Recebe slug de CIDADE (região ancorada nela), não de UF — por isso está
  // aqui e não no bloco de estado.
  "/carros-usados/regiao",
];

/** Municípios REAIS sem anúncio. Devem se comportar como inexistentes. */
const REAL_EMPTY = ["altaneira-ce", "xique-xique-ba", "coribe-ba", "ipua-sp"];

/**
 * Controles inventados. `-zz` tem UF falsa (barrado pelo gate estrutural);
 * `-sp` tem UF válida e só pode ser barrado pelo gate de existência — é o
 * caso que revela se sobrou catálogo.
 */
const INVENTED = ["cidade-inventada-zz", "cidade-inventada-sp"];

/** Cidade com estoque conhecido. */
const WITH_STOCK = "atibaia-sp";

/**
 * Faz a requisição SEGUINDO redirects e devolve o status FINAL.
 *
 * Seguir importa: `/[uf]/regiao/[ancora]` é alias 301 para a canônica
 * `/carros-usados/regiao/<ancora>-<uf>`. Aferir só o 301 marcaria divergência
 * onde o efeito já está correto — foi o que aconteceu na primeira rodada.
 * `redirects` guarda a cadeia para o relatório distinguir "404 direto" de
 * "301 → 404".
 */
async function probe(path) {
  const t0 = Date.now();
  let url = `${BASE}${path}`;
  const redirects = [];

  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        redirect: "manual",
      });

      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        redirects.push({ from: url, status: res.status, to: location });
        url = location.startsWith("http") ? location : `${BASE}${location}`;
        continue;
      }

      const body = await res.text();
      return {
        path,
        status: res.status,
        finalUrl: url,
        redirects,
        ms: Date.now() - t0,
        robots: (body.match(/<meta name="robots" content="([^"]*)"/i) || [])[1] || null,
        bytes: body.length,
        // Soft-404: status 200 servindo corpo de "não encontrado".
        looksNotFound: /não encontrad|nao encontrad|not found|404/i.test(body.slice(0, 4000)),
      };
    }
    return { path, status: 0, redirects, ms: Date.now() - t0, error: "loop de redirect" };
  } catch (err) {
    return { path, status: 0, redirects, ms: Date.now() - t0, error: err.message };
  }
}

/** Sufixo para o relatório quando houve redirect no caminho. */
function hopNote(r) {
  return r.redirects?.length ? ` (via ${r.redirects.map((h) => h.status).join("→")})` : "";
}

const failures = [];
const results = [];

function check(condition, label, detail) {
  if (!condition) failures.push({ label, detail });
  if (!AS_JSON) {
    console.log(`  ${condition ? "ok  " : "FALHA"}  ${label}${detail ? `  — ${detail}` : ""}`);
  }
}

function log(line) {
  if (!AS_JSON) console.log(line);
}

log(`\nSmoke do invariante territorial — ${BASE}\n${"=".repeat(64)}`);

// ── 1. Município REAL sem anúncio → 404 em todas as variantes ──────────────
log("\n[1] Município REAL sem anúncio → 404 em todas as variantes");
for (const city of REAL_EMPTY) {
  log(`\n  ${city}`);
  for (const route of CITY_ROUTES) {
    const r = await probe(`${route}/${city}`);
    results.push({ group: "real-empty", city, ...r });
    check(
      r.status === 404,
      `${route}/${city}`,
      r.status === 404 ? "" : `HTTP ${r.status}${r.robots ? ` robots="${r.robots}"` : ""}`
    );
  }
}

// ── 2. Inventado é INDISTINGUÍVEL do real vazio ────────────────────────────
log("\n[2] Município inventado ≡ município real vazio");
const baseline = results.filter((r) => r.group === "real-empty" && r.city === REAL_EMPTY[0]);

for (const fake of INVENTED) {
  log(`\n  ${fake}`);
  for (const route of CITY_ROUTES) {
    const r = await probe(`${route}/${fake}`);
    results.push({ group: "invented", city: fake, ...r });

    const ref = baseline.find((b) => b.path === `${route}/${REAL_EMPTY[0]}`);
    check(r.status === 404, `${route}/${fake} → 404`, r.status === 404 ? "" : `HTTP ${r.status}`);
    if (ref) {
      check(
        r.status === ref.status,
        `${route}/${fake} mesmo status do real vazio`,
        r.status === ref.status ? "" : `inventado=${r.status} real=${ref.status}`
      );
      check(
        (r.robots || null) === (ref.robots || null),
        `${route}/${fake} mesmo robots do real vazio`,
        `inventado="${r.robots}" real="${ref.robots}"`
      );
    }
  }
}

// ── 3. Cidade COM estoque → 200 ────────────────────────────────────────────
log(`\n[3] Cidade com estoque (${WITH_STOCK}) → 200`);
for (const route of CITY_ROUTES) {
  const r = await probe(`${route}/${WITH_STOCK}`);
  results.push({ group: "with-stock", city: WITH_STOCK, ...r });
  check(r.status === 200, `${route}/${WITH_STOCK}`, `HTTP ${r.status} robots="${r.robots}"`);
}

// ── 3b. UF: estado sem NENHUM anúncio não existe ───────────────────────────
log("\n[3b] UF sem anúncio no estado inteiro → 404");

/**
 * Rotas com escopo de ESTADO.
 *
 * `/carros-usados/regiao/[slug]` NÃO está aqui: recebe slug de CIDADE (é a
 * região ancorada nela) e por isso é verificada no bloco [1], junto das demais
 * variantes de cidade. `/[uf]/regiao/[ancora]` também não: é alias 301 para
 * essa canônica, e `probe` segue o redirect.
 */
const UF_ROUTES = [(uf) => `/carros-usados/${uf}`, (uf) => `/comprar/estado/${uf}`];

/** UFs sem estoque nenhum (o estoque está concentrado em SP). */
const EMPTY_UFS = ["ce", "ba"];

for (const uf of EMPTY_UFS) {
  log(`\n  ${uf}`);
  for (const build of UF_ROUTES) {
    const r = await probe(build(uf));
    results.push({ group: "empty-uf", uf, ...r });
    check(
      r.status === 404,
      build(uf) + hopNote(r),
      r.status === 404 ? "" : `HTTP ${r.status}${r.robots ? ` robots="${r.robots}"` : ""}`
    );
  }

  // Alias 301 → canônica de cidade. Só exigimos que o DESTINO seja 404.
  const alias = await probe(`/${uf}/regiao/alguma-ancora`);
  results.push({ group: "empty-uf", uf, ...alias });
  check(
    alias.status === 404,
    `/${uf}/regiao/alguma-ancora${hopNote(alias)}`,
    alias.status === 404 ? "" : `status final ${alias.status}`
  );
}

log("\n  UF COM estoque (sp) → 200");
for (const build of UF_ROUTES) {
  const r = await probe(build("sp"));
  results.push({ group: "stock-uf", uf: "sp", ...r });
  check(r.status === 200, build("sp"), `HTTP ${r.status} robots="${r.robots}"`);
}

// ── 4. O 404 é REAL, não soft-404 ──────────────────────────────────────────
log("\n[4] 404 é real (não 200 com página de erro)");
const soft = results.filter((r) => r.status === 200 && r.looksNotFound);
check(
  soft.length === 0,
  "nenhum soft-404 (200 servindo corpo de 'não encontrado')",
  soft.length ? soft.map((s) => s.path).join(", ") : ""
);

// ── Resumo ─────────────────────────────────────────────────────────────────
if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, failures, results }, null, 2));
} else {
  console.log(`\n${"=".repeat(64)}`);
  if (failures.length === 0) {
    console.log("TUDO PASSOU — o invariante está valendo em produção.");
  } else {
    console.log(`${failures.length} DIVERGÊNCIA(S):\n`);
    for (const f of failures.slice(0, 25)) {
      console.log(`  • ${f.label}${f.detail ? `  — ${f.detail}` : ""}`);
    }
    if (failures.length > 25) console.log(`  … e mais ${failures.length - 25}`);

    // Diagnóstico: "gate ausente" e "família de rota não coberta" produzem
    // sintomas parecidos (200 onde se esperava 404) mas exigem ações opostas.
    // Distinguir pelo ESCOPO da falha, não pelo sintoma.
    const cityChecks = results.filter((r) => r.group === "real-empty" || r.group === "invented");
    const cityBad = cityChecks.filter((r) => r.status !== 404);
    const ufBad = results.filter((r) => r.group === "empty-uf" && r.status !== 404);

    console.log("\nComo ler:");
    if (cityBad.length === cityChecks.length && cityChecks.length > 0) {
      console.log(
        "  TODAS as rotas de cidade vazia responderam 200 → o gate provavelmente\n" +
          "  NÃO está deployado. Confira se o commit do gate está no branch que o\n" +
          "  Render publica, e se INTERNAL_API_TOKEN bate entre frontend e backend\n" +
          "  (token errado faz o gate cair em fail-open e passar tudo em silêncio)."
      );
    } else if (cityBad.length > 0) {
      console.log(
        "  ALGUMAS rotas de cidade falharam e outras passaram → o gate está no ar,\n" +
          "  mas há FAMÍLIA DE ROTA fora da lista. Acrescente o prefixo a\n" +
          "  CITY_PREFIX_PATTERNS em lib/middleware/city-existence-gate.ts:\n" +
          `    ${[...new Set(cityBad.map((r) => r.path.split("/").slice(0, -1).join("/")))].join(", ")}`
      );
    }
    if (ufBad.length > 0) {
      console.log(
        "  Rotas de ESTADO falharam → verifique UF_PREFIX_PATTERNS no mesmo arquivo.\n" +
          "  Lembre que /carros-usados/regiao/[slug] recebe slug de CIDADE e pertence\n" +
          "  ao conjunto de cidade, não ao de UF."
      );
    }
  }
}

process.exit(failures.length === 0 ? 0 : 1);
