/**
 * Fetch resiliente para SSR no frontend <-> backend no mesmo Render.
 *
 * Dois problemas que esta funcao resolve em producao:
 *
 * 1) Rate limit global do backend por IP (src/shared/middlewares/
 *    rateLimit.middleware.js): como todos os SSRs do frontend saem do
 *    mesmo IP de container do Render, o limite de 1000 req/15min era
 *    atingido em minutos e o backend passava a devolver 429 para TODO
 *    SSR publico (home, /comprar, /veiculo). Solucao: injetar
 *    X-Cnc-Client-Ip com o IP do visitante real, lido via headers() do
 *    Next.js quando disponivel; o backend ja tem suporte a esse header
 *    (clientRateLimitKey) mas o BFF so estava propagando para rotas de
 *    conta/painel — nao para catalogo publico.
 *
 * 2) Cold start do backend no plano free do Render (20-40s). Retry
 *    automatico com timeouts crescentes evita cache poisoning do ISR.
 *      - 1a tentativa: 12s (backend acordado)
 *      - 2a+ tentativa: 30s (apenas se AbortError/rede/5xx/429)
 *      - 4xx NAO refaz (exceto 429: o usuario real nao tem culpa).
 *
 * 3) Backoff entre tentativas: durante SSG/build paralelo, multiplos
 *    fetches saem juntos e martelam o backend. Adicionamos espera
 *    exponencial (com jitter) entre tentativas — especialmente para
 *    429, dando ao rate-limiter tempo de janela rodar.
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

/**
 * Backoff exponencial com jitter (ms) entre tentativas, bem maior para
 * 429 (rate limit) — ali precisamos esperar a janela do limiter rodar.
 */
function backoffDelayMs(attempt: number, isRateLimit: boolean): number {
  // attempt = numero da tentativa que ACABOU de falhar (1-based).
  // 429: 800ms, 2400ms, 6000ms (com jitter ±25%).
  // outros: 200ms, 600ms, 1500ms (com jitter ±25%).
  const base = isRateLimit ? [800, 2400, 6000] : [200, 600, 1500];
  const idx = Math.min(attempt - 1, base.length - 1);
  const center = base[idx];
  const jitter = center * 0.25;
  return Math.round(center + (Math.random() * 2 - 1) * jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Le o IP do visitante real do request Next.js em curso, apenas em SSR.
 * Usa dynamic import para evitar que next/headers quebre build/testes
 * fora de um request-scope. Retorna string vazia se nao houver header.
 */
async function readClientIpFromNextHeaders(): Promise<string> {
  if (!isServer()) return "";
  try {
    // `next/headers` so funciona dentro de um request SSR. Fora dele
    // (build, tests), a import pode ate funcionar mas headers() joga.
    const mod = await import("next/headers");
    const h = mod.headers();
    // headers() retorna ReadonlyHeaders no Next 14 (sync).
    const anyH = h as { get?: (name: string) => string | null };
    if (typeof anyH.get !== "function") return "";

    const candidates = [
      "x-vercel-forwarded-for",
      "cf-connecting-ip",
      "x-forwarded-for",
      "x-real-ip",
    ];
    for (const name of candidates) {
      const raw = anyH.get(name);
      if (!raw) continue;
      const first = String(raw).split(",")[0].trim();
      if (first) return first;
    }
    return "";
  } catch {
    return "";
  }
}

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): HeadersInit {
  const merged = new Headers(base);
  for (const [key, value] of Object.entries(extra)) {
    if (value) merged.set(key, value);
  }
  return merged;
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
    maxAttempts = 3,
    initialTimeoutMs = 12_000,
    retryTimeoutMs = 30_000,
    signal: externalSignal,
    next: nextCache,
    headers: extraHeaders,
    ...init
  } = options;

  // Descobre o IP do visitante UMA vez (a resposta do Next/headers() nao
  // muda entre tentativas). Vira header X-Cnc-Client-Ip para o backend
  // rate-limitar por usuario final em vez de pelo IP do container.
  const clientIp = await readClientIpFromNextHeaders();

  // Headers internos: UA cnc-internal/1.0 + X-Internal-Token. Sao injetados
  // em TODAS as chamadas server-side, mesmo as publicas — o backend usa o
  // par UA+token para bypassar o bot blocker e identificar a origem nos
  // logs (categoria internal). Sem isso, o frontend seria 429-ado quando
  // LEGACY_BFF_COMPAT for desativada em prod.
  //
  // Lazy import: o helper traz `server-only` para impedir vazamento de
  // INTERNAL_API_TOKEN no bundle do client. Carregamos so quando isServer().
  const internalHeaders: Record<string, string> = {};
  if (isServer()) {
    try {
      const mod = await import("@/lib/http/internal-backend-headers");
      Object.assign(internalHeaders, mod.buildInternalBackendHeaders());
    } catch {
      // build/test fora de request scope: segue sem internal headers
    }
  }

  const extras: Record<string, string> = { ...internalHeaders };
  if (clientIp) extras["X-Cnc-Client-Ip"] = clientIp;

  const mergedHeaders = mergeHeaders(extraHeaders, extras);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutMs = attempt === 1 ? initialTimeoutMs : retryTimeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    const signal = composeSignals(externalSignal, controller);

    try {
      const response = await fetch(url, {
        ...init,
        headers: mergedHeaders,
        signal,
        ...(nextCache ? { next: nextCache } : {}),
      } as RequestInit);

      // 5xx: backend pode ter acordado mas pool nao pronto.
      // 429: rate limit — se veio sem X-Cnc-Client-Ip, o retry nao adianta,
      // mas se veio com IP do visitante, pode ter sido picos e retry ajuda.
      const shouldRetryStatus = response.status >= 500 || response.status === 429;
      if (shouldRetryStatus && attempt < maxAttempts) {
        const delay = backoffDelayMs(attempt, response.status === 429);
        logServer(
          logTag,
          `${response.status} em ${url} (tentativa ${attempt}/${maxAttempts}), retry em ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - started;

      if (attempt < maxAttempts && isRetriableError(error)) {
        const delay = backoffDelayMs(attempt, false);
        logServer(
          logTag,
          `erro retriavel em ${url} apos ${elapsedMs}ms (tentativa ${attempt}/${maxAttempts}): ${message} — retry em ${delay}ms com timeout ${retryTimeoutMs}ms`
        );
        await sleep(delay);
        continue;
      }

      logServer(logTag, `fetch falhou definitivamente em ${url} apos ${elapsedMs}ms: ${message}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("ssrResilientFetch: unknown");
}
