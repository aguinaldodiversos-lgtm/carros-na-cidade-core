import "server-only";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildInternalBackendHeaders } from "@/lib/http/internal-backend-headers";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import type { RegionPayload } from "@/lib/regions/fetch-region";

/**
 * BFF server-only para o endpoint privado
 * `GET /api/internal/regions/ancora/:uf/:ancora`.
 *
 * Diferença de `fetchRegionByCitySlug`:
 *  - Aceita UF + ancoraPart (sem sufixo de estado no slug).
 *  - Só retorna região se a cidade-base tiver is_ancora = true.
 *  - Usado exclusivamente pela nova Página Regional /[uf]/regiao/[ancora].
 *
 * Degrade gracioso: retorna null em qualquer falha (token ausente, 404,
 * cidade não é âncora, erro de rede). Caller chama notFound() conforme.
 */

const REVALIDATE_SECONDS = 300;

function logWarn(message: string, context?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.warn(`[fetch-region-ancora] ${message}`, context ?? "");
}

export async function fetchRegionByAncora(
  uf: string,
  ancora: string
): Promise<RegionPayload | null> {
  const ufNorm = String(uf || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const ancoraNorm = String(ancora || "")
    .trim()
    .toLowerCase();

  if (!/^[A-Z]{2}$/.test(ufNorm) || !ancoraNorm) return null;

  const headers = buildInternalBackendHeaders();
  if (!headers) {
    logWarn("INTERNAL_API_TOKEN não configurado", { uf: ufNorm, ancora: ancoraNorm });
    return null;
  }

  const url = resolveInternalBackendApiUrl(
    `/api/internal/regions/ancora/${encodeURIComponent(ufNorm.toLowerCase())}/${encodeURIComponent(ancoraNorm)}`
  );
  if (!url) return null;

  let response: Response;
  try {
    response = await ssrResilientFetch(url, {
      method: "GET",
      headers: { ...headers, Accept: "application/json" },
      logTag: "fetch-region-ancora",
      next: {
        revalidate: REVALIDATE_SECONDS,
        tags: ["internal:regions", `internal:regions:ancora:${ufNorm.toLowerCase()}:${ancoraNorm}`],
      },
    });
  } catch (err) {
    logWarn("falha de rede", {
      uf: ufNorm,
      ancora: ancoraNorm,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!response.ok) {
    if (response.status !== 404) {
      logWarn("status não-OK", { uf: ufNorm, ancora: ancoraNorm, status: response.status });
    }
    return null;
  }

  let envelope: { ok?: boolean; data?: unknown } | null = null;
  try {
    envelope = (await response.json()) as { ok?: boolean; data?: unknown };
  } catch {
    logWarn("body não é JSON", { uf: ufNorm, ancora: ancoraNorm });
    return null;
  }

  if (!envelope?.ok || !envelope.data || typeof envelope.data !== "object") {
    logWarn("envelope inválido", { uf: ufNorm, ancora: ancoraNorm });
    return null;
  }

  const d = envelope.data as Partial<RegionPayload>;
  if (!d.base || !Array.isArray(d.members)) {
    logWarn("payload sem base/members", { uf: ufNorm, ancora: ancoraNorm });
    return null;
  }

  return d as RegionPayload;
}
