/**
 * Hard gate de existência para o detalhe de anúncio executado no
 * `middleware.ts` (Edge runtime, ANTES do App Router processar a request).
 *
 * Cobre as duas rotas que renderizam o detalhe de um anúncio:
 *   - `/veiculo/[slug]`         (canônica)
 *   - `/anuncios/[identifier]`  (alias legado, 308 → /veiculo/[slug])
 *
 * Por que aqui em vez de só no page.tsx?
 *   Comprovado em produção 2026-05-24 com Next 14.2.35: `notFound()` em
 *   server component — mesmo com `dynamic = "force-dynamic"` + segment-
 *   level `not-found.tsx` — renderiza o body do not-found mas comita
 *   HTTP 200 (soft-404). Esse é o mesmo bug já contornado por
 *   `regional-page-guard` e `territory-gate`. Middleware emite 404 HTTP
 *   real ANTES do router pegar a rota.
 *
 * Funções puras (sem dependência de Next runtime) para serem testadas
 * isoladamente com vitest. O `middleware.ts` importa e monta a
 * `NextResponse` correspondente.
 *
 * Edge runtime considerations:
 *   - `process.env` funciona.
 *   - `fetch` global suporta `next: { revalidate, tags }` para data cache.
 *   - Sem Node APIs (fs, crypto.* node-specific).
 */

/**
 * Pathname canônico `/veiculo/<identifier>`. NÃO casa com sub-rotas
 * (não existem hoje, mas a guarda é barata).
 */
import { readBackendApiBaseUrl, readInternalApiToken } from "./gate-runtime-env";
import { GateSnapshotStore, getSnapshotMaxAgeMs } from "./gate-snapshot";

const VEICULO_PATH_REGEX = /^\/veiculo\/([^/?#]+)\/?$/;

/**
 * Pathname legado `/anuncios/<identifier>`. Mesma forma. O page.tsx desta
 * rota redireciona (308) para `/veiculo/<slug>` quando o anúncio existe,
 * mas só após o gate confirmar existência — sem isso, o redirect só roda
 * depois do soft-404.
 */
const ANUNCIOS_PATH_REGEX = /^\/anuncios\/([^/?#]+)\/?$/;

export type AdDetailRoute = "veiculo" | "anuncios";

export interface AdDetailMatch {
  route: AdDetailRoute;
  identifier: string;
}

/**
 * Extrai o identifier (slug ou id) do pathname quando for uma rota de
 * detalhe de anúncio. Devolve `null` para qualquer outro pathname — o
 * caller usa esse `null` para sair cedo sem custar fetch.
 */
export function extractAdDetailMatch(pathname: string): AdDetailMatch | null {
  const veiculo = VEICULO_PATH_REGEX.exec(pathname);
  if (veiculo) return { route: "veiculo", identifier: veiculo[1] };

  const anuncios = ANUNCIOS_PATH_REGEX.exec(pathname);
  if (anuncios) return { route: "anuncios", identifier: anuncios[1] };

  return null;
}

export interface AdDetailValidationConfig {
  apiBase?: string;
  token?: string;
  /** TTL do cache Next em segundos. Default 60 (anúncio criado/pausado
   *  deve aparecer/desaparecer em até 1min, alinhado a `ssrResilientFetch`
   *  do BFF). */
  revalidateSeconds?: number;
  /** Timeout do fetch em ms. Default 6s (gate roda em todo request a
   *  /veiculo/* — orçamento curto para não acumular latência). */
  timeoutMs?: number;
  /** Fetch a usar — substituível em teste. */
  fetchImpl?: typeof fetch;
  /**
   * Lê o corpo da resposta para devolver o slug canônico do anúncio.
   * Só o alias `/anuncios/[identifier]` precisa; `/veiculo/[slug]` não paga.
   */
  readCanonicalSlug?: boolean;
  /** Relógio injetável — só teste passa. */
  now?: number;
  /** Idade máxima do snapshot. Default `getSnapshotMaxAgeMs()`. */
  snapshotMaxAgeMs?: number;
}

/**
 * Motivos enumerados para `unavailable`. Mesma taxonomia do
 * `regional-page-guard` para uniformizar diagnóstico operacional via
 * header `X-Middleware-Ad-Reason`.
 */
export type AdDetailUnavailableReason =
  | "missing-backend-api-url"
  // `missing-internal-api-token` saiu (2026-08-07): o token é bypass de
  // rate-limit, não autorização. `/api/ads/:id` responde 200 sem token e com
  // token inválido — verificado por requisição real. Exigi-lo fazia o gate se
  // recusar a tentar uma chamada que funcionaria, e o resultado era o alias
  // `/anuncios/[identifier]` voltando a 200 + meta refresh.
  | "backend-401"
  | "backend-403"
  | "backend-5xx"
  | "backend-timeout"
  | "fetch-error";

export type AdDetailValidation =
  /**
   * `canonicalSlug` só vem quando o caller pede (`readCanonicalSlug`), porque
   * exige ler o corpo da resposta. O gate roda em TODO request a `/veiculo/*`
   * — parsear JSON à toa ali seria custo puro. Quem precisa é o alias
   * `/anuncios/[identifier]`, que sem o slug não consegue emitir o 308 no
   * middleware e teria de deixar o App Router renderizar antes de redirecionar.
   */
  | { kind: "valid"; canonicalSlug?: string }
  | { kind: "not_found" }
  /**
   * Backend fora, mas este identificador foi confirmado recentemente. Vale
   * como `valid` para decidir — inclusive para emitir o 308 do alias, já que
   * o slug canônico veio junto.
   */
  | { kind: "stale"; canonicalSlug?: string; reason: AdDetailUnavailableReason; ageMs: number }
  | { kind: "unavailable"; reason: AdDetailUnavailableReason; detail?: string };

/** O que guardamos por identificador confirmado. */
interface AdSnapshotValue {
  canonicalSlug?: string;
}

/**
 * Cofre por identificador, com teto.
 *
 * O teto é essencial aqui e não no gate de cidade: o espaço de identificadores
 * é ILIMITADO, e um crawler varrendo slugs inventados encheria a memória do
 * processo. Só entra identificador CONFIRMADO pelo backend, então slug
 * inventado nunca ocupa espaço — 404 não vira snapshot.
 */
const AD_SNAPSHOT = new GateSnapshotStore<AdSnapshotValue>(2000);

/** Uso EXCLUSIVO de teste. */
export function __resetAdSnapshot(): void {
  AD_SNAPSHOT.clear();
}

function logAdGateDegraded(message: string): void {
  if (typeof window !== "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[ad-detail-gate] ${message}`);
}

/** Falha de backend: tenta o snapshot antes de declarar indisponibilidade. */
function degradedAdDetail(
  identifier: string,
  reason: AdDetailUnavailableReason,
  now: number,
  detail?: string,
  maxAgeMs?: number
): AdDetailValidation {
  const lookup = AD_SNAPSHOT.lookup(identifier, now, maxAgeMs ?? getSnapshotMaxAgeMs());

  if (lookup.kind === "hit") {
    return { kind: "stale", canonicalSlug: lookup.value.canonicalSlug, reason, ageMs: lookup.ageMs };
  }

  logAdGateDegraded(
    `anúncio não verificável (${reason}) e sem snapshot (${lookup.kind}) — respondendo 503`
  );
  return { kind: "unavailable", reason, detail };
}

/** Extrai `slug` (ou `id`) do payload público, tolerando os envelopes do BFF. */
function readCanonicalSlugFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const envelope = payload as Record<string, unknown>;
  const candidates = [envelope.data, envelope.ad, envelope.item, envelope];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const ad = candidate as { slug?: unknown; id?: unknown };

    const slug = typeof ad.slug === "string" ? ad.slug.trim() : "";
    if (slug) return slug;

    // Anúncio sem slug ainda tem destino canônico: `/veiculo/[id]`.
    if (typeof ad.id === "number" || (typeof ad.id === "string" && ad.id.trim())) {
      return String(ad.id).trim();
    }
  }

  return undefined;
}

/**
 * Bate em `${BACKEND_API_URL}/api/ads/<identifier>` autenticado como
 * caller interno (UA cnc-internal/1.0 + X-Internal-Token).
 *
 * - 200 → valid
 * - 404 → not_found
 * - 401/403/5xx/timeout/erro → unavailable
 *
 * Cache via `next: { revalidate, tags }` para que requests subsequentes
 * para o mesmo identifier não martelem o backend dentro da janela.
 */
export async function validateAdIdentifier(
  identifier: string,
  config: AdDetailValidationConfig = {}
): Promise<AdDetailValidation> {
  const safeId = String(identifier || "").trim();
  if (!safeId) return { kind: "not_found" };

  const apiBase = (config.apiBase ?? readBackendApiBaseUrl()).replace(/\/+$/, "");
  const token = (config.token ?? readInternalApiToken()).trim();
  const revalidate = config.revalidateSeconds ?? 60;
  const timeoutMs = config.timeoutMs ?? 6000;
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now();
  const maxAgeMs = config.snapshotMaxAgeMs;

  // Só a ausência de base impede a tentativa. Token ausente NÃO impede — ver
  // a nota em `AdDetailUnavailableReason`.
  if (!apiBase) return degradedAdDetail(safeId, "missing-backend-api-url", now, undefined, maxAgeMs);

  const url = `${apiBase}/api/ads/${encodeURIComponent(safeId)}`;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        // UA + X-Internal-Token autentica como caller interno —
        // `isAuthenticatedInternalCall` no backend bypassa rate-limit
        // por IP (todos os edges do Render saem do mesmo IP) e
        // bot-blocker.
        "User-Agent": "cnc-internal/1.0",
        "X-Internal-Token": token,
      },
      signal: controller.signal,
      next: { revalidate, tags: ["ad-detail-gate", `ad-detail-gate:${safeId}`] },
    });

    if (response.status === 200) {
      if (!config.readCanonicalSlug) {
        AD_SNAPSHOT.remember(safeId, {}, now);
        return { kind: "valid" };
      }
      try {
        const canonicalSlug = readCanonicalSlugFromPayload(await response.json());
        AD_SNAPSHOT.remember(safeId, { canonicalSlug }, now);
        return { kind: "valid", canonicalSlug };
      } catch {
        // Corpo ilegível não invalida a existência: o backend respondeu 200.
        // Sem slug, o caller cai no fallback (deixa o App Router redirecionar).
        return { kind: "valid" };
      }
    }
    if (response.status === 404) return { kind: "not_found" };
    // 410 Gone = "esse recurso existiu mas foi removido em definitivo".
    // Semanticamente equivalente a not_found para o usuário final. Sem
    // este mapeamento, 410 caía no catch-all `unavailable` (rotulado
    // backend-5xx por engano) e o middleware fazia pass-unavailable,
    // levando a soft-404 com status 200 — exatamente o bug que o
    // ad-detail-gate existe para evitar (briefing P1 2026-05-25).
    if (response.status === 410) return { kind: "not_found" };
    // 401/403 dizem "não sei", não "não existe". Caem no snapshot; sem
    // snapshot, viram 503 — nunca 200.
    if (response.status === 401) {
      return degradedAdDetail(safeId, "backend-401", now, undefined, maxAgeMs);
    }
    if (response.status === 403) {
      return degradedAdDetail(safeId, "backend-403", now, undefined, maxAgeMs);
    }
    return degradedAdDetail(safeId, "backend-5xx", now, `status ${response.status}`, maxAgeMs);
  } catch (err) {
    if (timedOut) return degradedAdDetail(safeId, "backend-timeout", now, undefined, maxAgeMs);
    return degradedAdDetail(
      safeId,
      "fetch-error",
      now,
      err instanceof Error ? err.message : String(err),
      maxAgeMs
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decisão pura do gate. Recebe o resultado da validação e devolve a ação.
 *
 * Política — diferente do `regional-page-guard` em um ponto crítico:
 *
 *   - regional `unavailable` → 503 (bloqueia). Trade-off: a Regional é
 *     UMA rota; cold-start de backend traduz para 503 com Retry-After.
 *
 *   - ad-detail `unavailable` → pass (deixa passar). Aqui o gate roda
 *     em TODO request a /veiculo/*, incluindo todos os anúncios reais
 *     que existem. Falhar 503 em cold-start quebraria o catálogo
 *     inteiro. Fail-open é seguro porque:
 *       1. O `page.tsx` ainda chama `notFound()` se `fetchAdDetail`
 *          retornar null — defesa em profundidade preservada.
 *       2. Pior caso: anúncio inexistente cai em soft-404 (estado
 *          atual) durante a janela de instabilidade — exatamente o
 *          comportamento que existia antes deste gate, não regride.
 *       3. Logs operacionais ainda capturam `unavailable` via header
 *          `X-Middleware-Ad-Reason`.
 */
export type AdDetailMiddlewareAction =
  | { kind: "pass-valid"; source: "fresh" | "snapshot" }
  | { kind: "block-not-found" }
  /** Nem confirmado nem negado: 503 temporário. NUNCA 200. */
  | { kind: "block-unavailable"; reason: AdDetailUnavailableReason };

export function decideAdDetailMiddlewareAction(
  validation: AdDetailValidation
): AdDetailMiddlewareAction {
  if (validation.kind === "valid") return { kind: "pass-valid", source: "fresh" };
  if (validation.kind === "stale") return { kind: "pass-valid", source: "snapshot" };
  if (validation.kind === "not_found") return { kind: "block-not-found" };
  return { kind: "block-unavailable", reason: validation.reason };
}

/** Path canônico do detalhe de anúncio. Uma família, um literal. */
export const VEHICLE_CANONICAL_PATH_PREFIX = "/veiculo";

export type AdAliasAction =
  /** 308 HTTP real, emitido antes de qualquer HTML sair. */
  | { kind: "redirect-permanent"; pathname: string }
  /** Sem slug utilizável: deixa a rota renderizar e redirecionar como antes. */
  | { kind: "pass" };

/**
 * `/anuncios/[identifier]` → `/veiculo/[slug-canônico]`.
 *
 * O redirect já existia, mas no `page.tsx` (`permanentRedirect`), o que
 * significa entrar no App Router e montar a rota antes de responder. No
 * middleware o 308 sai antes de qualquer HTML, sem etapa intermediária —
 * é o contrato que preserva backlinks antigos com o menor custo possível.
 *
 * Só age sobre a rota alias: `/veiculo/[slug]` é o destino e nunca redireciona
 * para si mesmo (seria um loop). Identificador inexistente já foi barrado com
 * 404 pelo gate; aqui só chega anúncio que existe.
 */
export function decideAdAliasRedirect(
  match: AdDetailMatch,
  validation: AdDetailValidation
): AdAliasAction {
  if (match.route !== "anuncios") return { kind: "pass" };

  // `stale` serve tão bem quanto `valid`: o slug guardado foi confirmado pelo
  // backend, só não nesta requisição. É o que permite ao alias continuar
  // emitindo 308 durante um blip em vez de cair no `page.tsx` — que responderia
  // 200 + meta refresh, o defeito medido em 2026-08-06.
  if (validation.kind !== "valid" && validation.kind !== "stale") return { kind: "pass" };

  const slug = (validation.canonicalSlug || "").trim();
  if (!slug) return { kind: "pass" };

  return {
    kind: "redirect-permanent",
    pathname: `${VEHICLE_CANONICAL_PATH_PREFIX}/${encodeURIComponent(slug)}`,
  };
}
