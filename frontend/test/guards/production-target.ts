import fs from "node:fs";
import path from "node:path";

/**
 * Guard de alvo: impede que a suíte E2E rode contra PRODUÇÃO.
 *
 * ── Por que isto existe ─────────────────────────────────────────────────────
 * `frontend/.env.local` aponta `AUTH_API_BASE_URL`, `BACKEND_API_URL`, `API_URL`
 * e `NEXT_PUBLIC_API_URL` para `https://carros-na-cidade-core.onrender.com`.
 * Um `npm run dev` no frontend sem override, seguido de `npx playwright test`,
 * roda contra a API real — e a suíte E2E **cadastra usuários, publica anúncios
 * e dispara webhooks**. Não é um risco teórico: é o comportamento padrão de
 * quem clonar o repositório e seguir o README.
 *
 * A homologação de 2026-09-06 só não sujou produção porque as quatro variáveis
 * foram sobrescritas à mão no comando de start. Um guard tira isso da sorte.
 *
 * ── Contrato reutilizado, não inventado ─────────────────────────────────────
 * `scripts/staging-antifraud-smoke.mjs` já resolveu este problema para os
 * smokes, com um contrato explícito:
 *
 *     const SAFE_PATTERNS = [/staging/i, /localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/];
 *     …  "Defina ALLOW_PRODUCTION=true para forçar."
 *
 * Este módulo adota o MESMO vocabulário — mesmos padrões seguros, mesma válvula
 * `ALLOW_PRODUCTION`. Duas convenções diferentes para a mesma decisão seriam
 * pior do que nenhuma: a segunda seria esquecida.
 *
 * ── O que este arquivo NÃO faz ──────────────────────────────────────────────
 * Não altera nada do produto. É infraestrutura de teste, consumida por
 * `playwright.config.ts` antes de o primeiro spec carregar.
 */

/** Hosts de produção conhecidos do portal. Comparados por sufixo de domínio. */
export const PRODUCTION_HOSTS = [
  "carrosnacidade.com",
  "carros-na-cidade-core.onrender.com",
] as const;

/**
 * Variáveis que decidem contra QUEM a suíte fala. A lista precisa cobrir tanto
 * o que o Playwright injeta no `webServer` quanto o que os helpers leem
 * diretamente — uma sobrando é inofensiva; uma faltando é o buraco.
 */
export const TARGET_ENV_KEYS = [
  "NEXT_PUBLIC_API_URL",
  "E2E_BACKEND_API_URL",
  "BACKEND_API_URL",
  "AUTH_API_BASE_URL",
  "API_URL",
  "PLAYWRIGHT_BASE_URL",
  "BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/** Mesmos padrões do guard de staging já existente no repositório. */
const SAFE_PATTERNS = [/staging/i, /localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/, /\[::1\]/];

export type Veredito = "local" | "staging" | "producao" | "desconhecido";

export type AlvoAvaliado = {
  chave: string;
  valor: string;
  host: string;
  veredito: Veredito;
};

/**
 * `a.b.com` é subdomínio de `b.com`; `b.com.evil.net` NÃO é.
 *
 * A comparação por `includes` — tentadora e errada — deixaria
 * `carrosnacidade.com.atacante.net` passar por produção e, pior, faria um
 * host de atacante ser tratado como "conhecido".
 */
export function isHostOrSubdomainOf(host: string, base: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  const b = base.toLowerCase().replace(/\.$/, "");
  return h === b || h.endsWith(`.${b}`);
}

/** Extrai o host de uma URL; devolve "" para valor vazio ou não parseável. */
export function hostOf(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // `new URL("localhost:3000")` NÃO lança: lê "localhost:" como esquema e
  // devolve hostname vazio. Por isso a condição de fallback é o hostname
  // vazio, e não a exceção — confiar no catch deixaria "localhost:3000"
  // classificado como desconhecido e abortaria uma execução legítima.
  try {
    const direto = new URL(raw).hostname.toLowerCase();
    if (direto) return direto;
  } catch {
    /* segue para a tentativa com esquema explícito */
  }

  try {
    return new URL(`http://${raw}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Classifica um alvo.
 *
 * Ordem importa: `staging-api.carrosnacidade.com` termina em
 * `carrosnacidade.com` e seria classificado como produção se o teste de
 * produção viesse primeiro. O contrato do repositório diz que "staging" no
 * host é seguro — então staging é avaliado ANTES.
 */
export function classifyTarget(value: string): Veredito {
  const host = hostOf(value);
  if (!host) return "desconhecido";

  if (SAFE_PATTERNS.some((p) => p.test(host))) {
    return /staging/i.test(host) ? "staging" : "local";
  }
  if (host === "::1" || host.startsWith("192.168.") || host.startsWith("10.")) return "local";
  if (host.endsWith(".local") || host.endsWith(".localhost")) return "local";

  if (PRODUCTION_HOSTS.some((p) => isHostOrSubdomainOf(host, p))) return "producao";

  return "desconhecido";
}

/** Avalia todas as variáveis de alvo presentes no ambiente informado. */
export function evaluateTargets(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const avaliados: AlvoAvaliado[] = [];
  for (const chave of TARGET_ENV_KEYS) {
    const valor = String(env[chave] ?? "").trim();
    if (!valor) continue;
    avaliados.push({ chave, valor, host: hostOf(valor), veredito: classifyTarget(valor) });
  }
  return avaliados;
}

/** Alvos que impedem a execução: produção confirmada ou host não reconhecido. */
export function findUnsafeTargets(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  return evaluateTargets(env).filter(
    (a) => a.veredito === "producao" || a.veredito === "desconhecido"
  );
}

/**
 * Lê um arquivo `.env` no formato KEY=VALUE.
 *
 * Sem dependência nova de propósito: o guard roda em `playwright.config.ts`,
 * antes de qualquer setup, e precisa continuar funcionando mesmo num checkout
 * onde `dotenv` não foi instalado no workspace do frontend.
 */
export function parseEnvFile(conteudo: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const linha of String(conteudo).split(/\r?\n/)) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    out[m[1]] = valor;
  }
  return out;
}

/** Ordem de precedência do Next em dev — o primeiro que define a chave vence. */
export const NEXT_ENV_FILES = [
  ".env.local",
  ".env.development.local",
  ".env.development",
  ".env",
] as const;

/**
 * Ambiente EFETIVO que o `next dev` enxergará: `process.env` tem precedência,
 * e o que ele não define vem dos arquivos `.env*` do diretório do frontend.
 *
 * Sem este passo o guard teria um buraco do tamanho do problema que ele existe
 * para resolver: `process.env` limpo + `.env.local` apontando para produção é
 * EXATAMENTE o estado padrão de quem clona o repositório, e olhar só para
 * `process.env` daria verde.
 */
export function resolveEffectiveEnv(
  processEnv: NodeJS.ProcessEnv | Record<string, string | undefined>,
  fileEnvs: Array<Record<string, string>>
): Record<string, string> {
  const efetivo: Record<string, string> = {};
  for (const chave of TARGET_ENV_KEYS) {
    const doProcesso = String(processEnv[chave] ?? "").trim();
    if (doProcesso) {
      efetivo[chave] = doProcesso;
      continue;
    }
    for (const arquivo of fileEnvs) {
      const doArquivo = String(arquivo?.[chave] ?? "").trim();
      if (doArquivo) {
        efetivo[chave] = doArquivo;
        break;
      }
    }
  }
  if (processEnv.ALLOW_PRODUCTION) efetivo.ALLOW_PRODUCTION = String(processEnv.ALLOW_PRODUCTION);
  return efetivo;
}

export class ProductionTargetError extends Error {
  readonly alvos: AlvoAvaliado[];
  constructor(alvos: AlvoAvaliado[]) {
    const linhas = alvos.map((a) => `  • ${a.chave} = ${a.valor}  (${a.veredito})`).join("\n");
    super(
      `[e2e-guard] A suíte E2E é DESTRUTIVA (cadastra usuários, publica anúncios) e ` +
        `o ambiente aponta para alvo não permitido:\n${linhas}\n\n` +
        `Permitidos: localhost, 127.0.0.1, 0.0.0.0, [::1], redes privadas e hosts com "staging".\n` +
        `Causa mais comum: frontend/.env.local aponta para a API de produção. ` +
        `Suba a API local e exporte NEXT_PUBLIC_API_URL/BACKEND_API_URL/AUTH_API_BASE_URL/API_URL=http://127.0.0.1:4000.\n` +
        `Para forçar mesmo assim (não faça isso em produção): ALLOW_PRODUCTION=true.`
    );
    this.name = "ProductionTargetError";
    this.alvos = alvos;
  }
}

/**
 * Aborta se algum alvo for produção (ou desconhecido).
 *
 * `ALLOW_PRODUCTION=true` é a mesma válvula de escape do
 * `staging-antifraud-smoke.mjs` — deliberadamente explícita e barulhenta.
 */
export function assertSafeE2eTarget(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AlvoAvaliado[] {
  const avaliados = evaluateTargets(env);
  if (String(env.ALLOW_PRODUCTION ?? "") === "true") return avaliados;

  const inseguros = findUnsafeTargets(env);
  if (inseguros.length > 0) throw new ProductionTargetError(inseguros);
  return avaliados;
}

/**
 * Ponto de entrada do `playwright.config.ts`: resolve `process.env` + arquivos
 * `.env*` do diretório informado e aborta se o alvo não for seguro.
 *
 * `fs` é importado dinamicamente para o módulo continuar carregável em
 * ambiente de teste sem acesso a disco.
 */
export function assertSafeE2eTargetForDir(
  dir: string,
  processEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): AlvoAvaliado[] {
  const arquivos: Array<Record<string, string>> = [];
  for (const nome of NEXT_ENV_FILES) {
    const alvo = path.join(dir, nome);
    try {
      if (fs.existsSync(alvo)) arquivos.push(parseEnvFile(fs.readFileSync(alvo, "utf8")));
    } catch {
      /* arquivo ilegível não deve derrubar o guard */
    }
  }

  return assertSafeE2eTarget(resolveEffectiveEnv(processEnv, arquivos));
}
