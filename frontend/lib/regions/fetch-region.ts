import "server-only";
import { getBackendApiBaseUrl, resolveBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * BFF server-only para o endpoint privado /api/internal/regions/:slug.
 *
 * Por que server-only?
 * - O header X-Internal-Token usa process.env.INTERNAL_API_TOKEN, que NUNCA
 *   pode vazar no bundle do client (qualquer NEXT_PUBLIC_* prefix exporia
 *   o token via JS público). `import "server-only"` faz o Next abortar o
 *   build se algum client component importar este arquivo.
 *
 * Por que degrade gracioso (null) em vez de throw?
 * - A futura Página Regional renderiza com graceful fallback se a região
 *   não estiver disponível (cidade isolada, INTERNAL_API_TOKEN não
 *   configurado, backend cold-start). Crash em SSR poluiria o ISR e
 *   geraria página de erro pública. Regional é "extra"; sua ausência
 *   nunca pode quebrar a navegação.
 *
 * Cache (next: { revalidate, tags }):
 * - revalidate=300 (5 min) coincide com o TTL do cache Redis do backend
 *   em /api/internal/regions/* — evita hit pattern em que ISR e Redis
 *   expiram em momentos descoordenados.
 * - tags ["internal:regions", "internal:regions:<slug>"] permitem invalidar
 *   uma região específica via revalidateTag(`internal:regions:${slug}`)
 *   ou tudo via revalidateTag("internal:regions") quando o admin rodar
 *   `npm run regions:build` em prod.
 *
 * Estados retornando null:
 *   - INTERNAL_API_TOKEN não configurado (warn).
 *   - backend base URL não configurada (silencioso — mesmo padrão de
 *     fetch-city-meta-server.ts).
 *   - HTTP 4xx (incluindo 404 para slug desconhecido OU token errado —
 *     backend dá 404 nos dois casos por design anti-enumeração).
 *   - HTTP 5xx, timeout, qualquer erro de rede ou parse.
 */

export type RegionMember = {
  city_id: number;
  slug: string;
  name: string;
  state: string;
  /** 1 = vizinha próxima (≤30 km); 2 = vizinha intermediária (30-60 km). */
  layer: number;
  distance_km: number | null;
};

export type RegionBase = {
  id: number;
  slug: string;
  name: string;
  state: string;
};

export type RegionPayload = {
  base: RegionBase;
  members: RegionMember[];
};

type BackendEnvelope = {
  ok?: boolean;
  data?: {
    base?: Partial<RegionBase> | null;
    members?: Array<Partial<RegionMember>> | null;
  } | null;
  error?: string;
};

const REVALIDATE_SECONDS = 300;

function logWarn(message: string, context?: Record<string, unknown>) {
  // Logger frontend = console em SSR. Não poluir produção com info debug.
  // eslint-disable-next-line no-console
  console.warn(`[regions:bff] ${message}`, context ?? "");
}

function logError(message: string, context?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.error(`[regions:bff] ${message}`, context ?? "");
}

function readInternalApiToken(): string {
  return String(process.env.INTERNAL_API_TOKEN || "").trim();
}

function isPlausibleBase(value: unknown): value is RegionBase {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RegionBase>;
  return (
    typeof v.id === "number" &&
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.state === "string"
  );
}

function normalizeMember(value: unknown): RegionMember | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<RegionMember>;
  if (
    typeof v.city_id !== "number" ||
    typeof v.slug !== "string" ||
    typeof v.name !== "string" ||
    typeof v.state !== "string" ||
    typeof v.layer !== "number"
  ) {
    return null;
  }
  return {
    city_id: v.city_id,
    slug: v.slug,
    name: v.name,
    state: v.state,
    layer: v.layer,
    distance_km:
      v.distance_km === null || v.distance_km === undefined ? null : Number(v.distance_km),
  };
}

/**
 * Lê a região aproximada de uma cidade-base no backend.
 * Retorna `null` em qualquer falha (degrade gracioso) — caller deve sempre
 * tratar null como "região não disponível agora".
 */
export async function fetchRegionByCitySlug(slug: string): Promise<RegionPayload | null> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  const token = readInternalApiToken();
  if (!token) {
    logWarn(
      "INTERNAL_API_TOKEN não configurado no env do frontend — região indisponível. Configure no Render do service do frontend (sync OFF, sem prefixo NEXT_PUBLIC_)."
    );
    return null;
  }

  if (!getBackendApiBaseUrl()) {
    // Mesmo padrão silencioso de fetch-city-meta-server.ts: em build local
    // sem backend, evitar warn ruidoso.
    return null;
  }

  const url = resolveBackendApiUrl(`/api/internal/regions/${encodeURIComponent(safeSlug)}`);
  if (!url) return null;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Internal-Token": token,
      },
      logTag: "regions:bff",
      next: {
        revalidate: REVALIDATE_SECONDS,
        tags: ["internal:regions", `internal:regions:${safeSlug}`],
      },
    });
  } catch (err) {
    logError("falha de rede ao buscar região", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (response.status === 404) {
    // 404 cobre dois casos no contrato do backend (anti-enumeração):
    //   (a) slug desconhecido em cities.
    //   (b) token errado/ausente.
    // Em qualquer um, do lado do BFF a região simplesmente não existe agora.
    return null;
  }

  if (!response.ok) {
    logError("backend retornou status não-OK", {
      slug: safeSlug,
      status: response.status,
    });
    return null;
  }

  let envelope: BackendEnvelope | null = null;
  try {
    envelope = (await response.json()) as BackendEnvelope;
  } catch (err) {
    logError("body não é JSON parseável", {
      slug: safeSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!envelope || envelope.ok !== true || !envelope.data) {
    logError("envelope inválido (ok!=true ou sem .data)", { slug: safeSlug });
    return null;
  }

  const base = envelope.data.base;
  if (!isPlausibleBase(base)) {
    logError("base com shape inválido", { slug: safeSlug, base });
    return null;
  }

  const rawMembers = Array.isArray(envelope.data.members) ? envelope.data.members : [];
  const members = rawMembers
    .map((m) => normalizeMember(m))
    .filter((m): m is RegionMember => m !== null);

  return { base, members };
}
