/**
 * Leitura de env em RUNTIME dentro do middleware (Edge).
 *
 * ── O problema que este módulo existe para resolver ──────────────────────────
 * O Next substitui `process.env.NOME` por um LITERAL no bundle do middleware em
 * tempo de build. Medido em 2026-08-06: dois builds do mesmo código, diferindo
 * apenas na presença de `INTERNAL_API_TOKEN` no ambiente de BUILD, produziam
 * `/carros-em/<cidade-sem-anúncio>` respondendo 404 (variável presente) ou 200
 * (ausente). Exportar a variável ao subir o servidor não adiantava: o valor já
 * tinha sido congelado no bundle.
 *
 * Um gate de indexação cujo comportamento depende de uma variável ter estado
 * presente no build é um gate que se desliga sozinho, sem erro visível, e só é
 * descoberto quando o Google já indexou o que não devia.
 *
 * ── A correção ───────────────────────────────────────────────────────────────
 * Acesso DINÂMICO. A substituição do Next é estática: ela só reescreve
 * `process.env.NOME` quando consegue ler o nome no código. `process.env[nome]`,
 * com `nome` vindo de uma variável, não é analisável — o Next deixa passar e a
 * leitura acontece contra o `process.env` real do processo, em runtime.
 *
 * A leitura estática fica como FALLBACK, para o caso de um runtime que não
 * exponha `process.env` ao sandbox: aí o valor inlinado no build ainda serve.
 * Os dois caminhos juntos cobrem as duas formas de deploy.
 *
 * ── O que NÃO muda ───────────────────────────────────────────────────────────
 * Este módulo não torna nenhum segredo público. `INTERNAL_API_TOKEN` continua
 * sem prefixo `NEXT_PUBLIC_`, então o Next segue removendo-o do bundle do
 * cliente. O valor nunca é logado, nunca vai para header de resposta e nunca
 * cruza para o browser — só entra no header de uma chamada server→server.
 */

/**
 * Lê uma env sem deixar o bundler inliná-la.
 *
 * O `Record` intermediário é o ponto: sem ele, um bundler mais agressivo ainda
 * poderia tentar resolver o acesso. Com ele, `process.env` é tratado como um
 * objeto qualquer.
 */
function readDynamicEnv(name: string): string {
  try {
    const env = process.env as unknown as Record<string, string | undefined>;
    const key = String(name);
    return (env[key] ?? "").trim();
  } catch {
    // Runtime sem `process` (teste em ambiente exótico, worker isolado).
    return "";
  }
}

/**
 * Valor da env, preferindo runtime e caindo no literal do build.
 *
 * @param runtimeName nome lido dinamicamente (não inlinado)
 * @param buildTimeValue `process.env.NOME` escrito estaticamente pelo chamador,
 *   que o Next inlina — usado só quando o runtime não devolveu nada
 */
export function readGateEnv(runtimeName: string, buildTimeValue?: string): string {
  const fromRuntime = readDynamicEnv(runtimeName);
  if (fromRuntime) return fromRuntime;
  return (buildTimeValue ?? "").trim();
}

/**
 * `BACKEND_API_URL` sem barra final. Aceita `API_URL` como alias, igual ao
 * resto do frontend.
 */
export function readBackendApiBaseUrl(): string {
  const base =
    readGateEnv("BACKEND_API_URL", process.env.BACKEND_API_URL) ||
    readGateEnv("API_URL", process.env.API_URL);
  return base.replace(/\/+$/, "");
}

/**
 * `INTERNAL_API_TOKEN`.
 *
 * NUNCA é obrigatório para o gate funcionar — ver a nota em
 * `city-existence-gate.ts`. Serve só para a chamada pular o rate-limit do
 * backend (`isAuthenticatedInternalCall`). Ausente, a chamada é feita mesmo
 * assim e o endpoint público responde normalmente.
 */
export function readInternalApiToken(): string {
  return readGateEnv("INTERNAL_API_TOKEN", process.env.INTERNAL_API_TOKEN);
}

/** Inteiro positivo de env, com fallback. Usado para TTLs configuráveis. */
export function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = readDynamicEnv(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}
