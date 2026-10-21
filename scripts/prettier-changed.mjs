#!/usr/bin/env node
/**
 * GATE DE FORMATAÇÃO INCREMENTAL — só o que o diff tocou.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O PROBLEMA QUE ISTO RESOLVE
 * ════════════════════════════════════════════════════════════════════════════
 * `prettier --check .` reprovava 321 arquivos do monorepo — dívida acumulada
 * desde antes de o Prettier entrar no projeto. Um gate que já está vermelho não
 * gateia nada: ele reprova toda PR, inclusive as que não encostaram em nenhum
 * daqueles arquivos, e o time aprende a ignorar o passo. Pior: quando alguém
 * DE FATO manda um arquivo mal formatado, o sinal se perde no meio dos 321.
 *
 * A saída NÃO é reformatar o repositório inteiro — isso produziria um commit de
 * centenas de arquivos que sepulta o histórico de `git blame` e torna qualquer
 * revisão impossível. A saída é cobrar formatação de quem a PR tocou.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * COMO A BASE É ESCOLHIDA
 * ════════════════════════════════════════════════════════════════════════════
 *   pull_request → `git merge-base origin/<base> HEAD`
 *       O merge-base, e não a ponta do alvo: comparar com a ponta acusaria
 *       arquivos que a `main` mudou depois que a branch saiu — arquivos que
 *       esta PR não tocou.
 *
 *   push         → `github.event.before`, quando existe e é alcançável.
 *       Primeiro push de uma branch traz `before` zerado; nesse caso cai para
 *       `HEAD~1`, e se nem isso existir (commit inicial) não há diff a cobrar.
 *
 *   local        → o que vier em `--base`, ou `origin/main`, ou `HEAD~1`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DETALHES QUE PARECEM PEQUENOS E NÃO SÃO
 * ════════════════════════════════════════════════════════════════════════════
 * • `-z` no `git diff`: nomes com espaço ou acento saem entre aspas e escapados
 *   no formato normal. NUL-separado é o único jeito de ler o nome como ele é.
 * • `--diff-filter=ACMR`: arquivo APAGADO não pode ser formatado. Renomeado
 *   (R) entra porque o conteúdo no destino é novo para o gate.
 * • `prettier.getFileInfo`: quem decide se um arquivo é elegível é o próprio
 *   Prettier — ele consulta `.prettierignore` e sabe se existe parser para a
 *   extensão. Nada de lista de extensões escrita à mão aqui, e nada de excluir
 *   diretório para "ficar verde".
 * • Zero arquivos elegíveis é SUCESSO explícito, não erro. Uma PR que só mexe
 *   em .png não tem o que formatar.
 *
 * Uso:
 *   node scripts/prettier-changed.mjs              # descobre a base sozinho
 *   node scripts/prettier-changed.mjs --base <ref> # base explícita
 *   node scripts/prettier-changed.mjs --write      # formata em vez de checar
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

import prettier from "prettier";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const baseFlagIndex = args.indexOf("--base");
const BASE_ARG = baseFlagIndex >= 0 ? args[baseFlagIndex + 1] : null;

function git(...argv) {
  return execFileSync("git", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** `true` se a ref existe e é alcançável neste clone (shallow morde aqui). */
function refExists(ref) {
  if (!ref) return false;
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * A base do diff. Devolve `null` quando não há base alcançável — caso legítimo
 * (commit inicial), tratado como "nada a cobrar".
 */
function resolveBase() {
  if (BASE_ARG) {
    if (!refExists(BASE_ARG)) {
      console.error(`[prettier-changed] base "${BASE_ARG}" não existe neste clone.`);
      process.exit(1);
    }
    return BASE_ARG;
  }

  const evento = process.env.GITHUB_EVENT_NAME;

  if (evento === "pull_request" || evento === "pull_request_target") {
    const alvo = process.env.GITHUB_BASE_REF;
    for (const candidato of [`origin/${alvo}`, alvo]) {
      if (refExists(candidato)) {
        try {
          return git("merge-base", candidato, "HEAD");
        } catch {
          // Sem ancestral comum (histórias não relacionadas): usa a própria ref.
          return candidato;
        }
      }
    }
    console.error(
      `[prettier-changed] base "${alvo}" inalcançável. ` +
        `O checkout precisa de fetch-depth: 0 (ou fetch explícito da base).`
    );
    process.exit(1);
  }

  if (evento === "push") {
    const antes = process.env.GITHUB_EVENT_BEFORE || lerEventoPush();
    // Branch nova: `before` vem zerado.
    if (antes && !/^0+$/.test(antes) && refExists(antes)) return antes;
  }

  for (const fallback of ["origin/main", "HEAD~1"]) {
    if (refExists(fallback)) return fallback;
  }
  return null;
}

/** `before` do payload do push, quando o runner expõe o arquivo do evento. */
function lerEventoPush() {
  const caminho = process.env.GITHUB_EVENT_PATH;
  if (!caminho) return null;
  try {
    return JSON.parse(readFileSync(caminho, "utf8"))?.before ?? null;
  } catch {
    return null;
  }
}

/** Arquivos adicionados/copiados/modificados/renomeados entre `base` e HEAD. */
function arquivosAlterados(base) {
  // `-z` = NUL-separado: preserva nomes com espaço, acento e aspas.
  const bruto = execFileSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACMR", "-z", `${base}...HEAD`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  return bruto.split("\0").filter(Boolean);
}

/** Só o que o Prettier sabe formatar e o `.prettierignore` não exclui. */
async function elegiveis(caminhos) {
  const saida = [];
  for (const caminho of caminhos) {
    const info = await prettier.getFileInfo(caminho, { ignorePath: ".prettierignore" });
    if (!info.ignored && info.inferredParser) saida.push(caminho);
  }
  return saida;
}

const base = resolveBase();

if (!base) {
  console.log("[prettier-changed] sem base de comparação (commit inicial?) — nada a verificar.");
  process.exit(0);
}

const alterados = arquivosAlterados(base);
const alvos = await elegiveis(alterados);

console.log(`[prettier-changed] base: ${base}`);
console.log(`[prettier-changed] arquivos no diff: ${alterados.length}`);
console.log(`[prettier-changed] elegíveis ao Prettier: ${alvos.length}`);

if (alvos.length === 0) {
  console.log("[prettier-changed] OK — nenhum arquivo formatável foi alterado.");
  process.exit(0);
}

const reprovados = [];

for (const caminho of alvos) {
  let fonte;
  try {
    fonte = readFileSync(caminho, "utf8");
  } catch {
    // Sumiu entre o diff e a leitura (rebase concorrente). Não é falha de estilo.
    continue;
  }

  const opcoes = { ...(await prettier.resolveConfig(caminho)), filepath: caminho };

  if (WRITE) {
    const formatado = await prettier.format(fonte, opcoes);
    if (formatado !== fonte) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(caminho, formatado, "utf8");
      console.log(`  formatado  ${caminho}`);
    }
    continue;
  }

  if (!(await prettier.check(fonte, opcoes))) reprovados.push(caminho);
}

if (WRITE) {
  console.log("[prettier-changed] arquivos alterados formatados.");
  process.exit(0);
}

if (reprovados.length > 0) {
  console.error("");
  console.error(`[prettier-changed] ${reprovados.length} arquivo(s) fora do padrão:`);
  for (const caminho of reprovados) console.error(`  ✗ ${caminho}`);
  console.error("");
  console.error("Rode: npm run format:changed");
  process.exit(1);
}

console.log(`[prettier-changed] OK — ${alvos.length} arquivo(s) alterado(s) estão formatados.`);
