/**
 * Fetch resiliente para SSR no frontend <-> backend no mesmo Render.
 *
 * Motivo: no plano free do Render, o backend dorme apos 15min sem trafego
 * e o primeiro request apos o sleep leva 20-40s para acordar. Sem retry
 * automatico, todo SSR no primeiro acesso do dia cai em timeout, renderiza
 * vazio e o Next guarda esse vazio no cache ISR ate o proximo revalidate —
 * cenario que deixou /comprar, home e /veiculo sem dados em producao.
 *
 * Estrategia:
 *   - 1a tentativa: 12s de timeout (cobre backend acordado)
 *   - 2a tentativa (so se AbortError/rede): 30s (cobre cold start confirmado)
 *   - Mais que isso nao faz sentido: usuario desiste antes.
 */

type NextCacheConfig = { revalidate?: number | false; tags?: string[] };

export type SsrFetchOptions = Omit<RequestInit, "signal"> & {
  /** Tag/prefixo para logs no server. [TAG] fetch falhou em ... */
  logTag?: string;
  /** Numero max de tentativas. Default 2. */
  maxAttempts?: number;
  /** Timeout da 1a tentativa (ms). Default 12000. */
  initialTimeoutMs?: number;
  /** Timeout da 2a+ tentativa (ms). Default 30000. */
  retryTimeoutMs?: number;
  /** Signal externo (opcional). Se fornecido, cancelamento externo tem prioridade. */
  signal?: AbortSignal | null;
  /** Config de cache do Next.js. Passado como `next: {...}` para o fetch. */
  next?: NextCacheConfig;
};

const isServer = () => typeof window === "undefined";

function logServer(tag: string, message: string) {
  if (isServer()) {
    // eslint-disable-next-line no-console
    console.error(`[${tag}] ${message}`);
  }
}

function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return true;
  if (error.name === "TypeError" && /fetch failed/i.test(error.message)) return true;
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED/.test(error.message)) return true;
  return false;
}

function composeSignals(
  external: AbortSignal | null | undefined,
  internal: AbortController
): AbortSignal {
  if (!external) return internal.signal;
  // Se o caller ja abortou, propaga.
  if (external.aborted) {
    internal.abort();
    return internal.signal;
  }
  const relay = () => internal.abort();
  external.addEventListener("abort", relay, { once: true });
  return internal.signal;
}

export async function ssrResilientFetch(
  url: string,
  options: SsrFetchOptions = {}
): Promise<Response> {
  const {
    logTag = "ssr-fetch",
    maxAttempts = 2,
    initialTimeoutMs = 12_000,
    retryTimeoutMs = 30_000,
    signal: externalSignal,
    next: nextCache,
    ...init
  } = options;

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = attempt === 1 ? initialTimeoutMs : retryTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    const signal = composeSignals(externalSignal, controller);

    try {
      // `next` do Next.js precisa ser passado como propriedade top-level da 2a arg;
      // aqui propagamos via spread + anexo explicito.
      const response = await fetch(url, {
        ...init,
        signal,
        ...(nextCache ? { next: nextCache } : {}),
      } as RequestInit);

      // 5xx tambem merece retry — backend pode ter acordado mas ainda
      // subindo conexoes do pool. 4xx nao: e input do usuario, nao melhora.
      if (response.status >= 500 && attempt < maxAttempts) {
        logServer(
          logTag,
          `${response.status} em ${url} (tentativa ${attempt}/${maxAttempts}), retry`
        );
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - started;

      if (attempt < maxAttempts && isRetriableError(error)) {
        logServer(
          logTag,
          `erro retriavel em ${url} apos ${elapsedMs}ms (tentativa ${attempt}/${maxAttempts}): ${message} — retry com timeout ${retryTimeoutMs}ms`
        );
        continue;
      }

      logServer(
        logTag,
        `fetch falhou definitivamente em ${url} apos ${elapsedMs}ms: ${message}`
      );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("ssrResilientFetch: unknown");
}
