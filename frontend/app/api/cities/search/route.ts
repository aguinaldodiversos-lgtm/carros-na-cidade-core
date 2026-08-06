import { NextRequest, NextResponse } from "next/server";

import { getBackendApiBaseUrl, resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { buildBffBackendForwardHeaders } from "@/lib/http/client-ip";
import { fetchPublicCitySet, filterToPublicCities } from "@/lib/city/public-city-set";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Seletor de cidade do site PÚBLICO.
 * GET /api/cities/search?q=&uf=&limit=
 *
 * Delega ao catálogo de municípios do backend e **filtra ao conjunto público**
 * (cidades com anúncio ativo) — ver
 * `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * Por que o filtro é aqui e não no backend: o MESMO endpoint
 * (`/api/public/cities/search`) serve o wizard de anúncio, onde o vendedor
 * precisa escolher QUALQUER município — é esse ato que cria a cidade. Filtrar
 * na origem quebraria a publicação. A separação é por consumidor:
 *
 *   /api/cities/search          (este)  → público, FILTRADO
 *   /api/painel/cidades/search          → wizard,  catálogo completo
 *
 * Sem este filtro, o visitante escolheria uma cidade sem anúncio e cairia num
 * 404 — trocaríamos páginas duplicadas por links quebrados.
 */
export async function GET(request: NextRequest) {
  if (!getBackendApiBaseUrl()) {
    return NextResponse.json(
      { success: false, message: "API do backend não configurada.", data: [] },
      { status: 500 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const uf = sp.get("uf") ?? "";
  const limit = sp.get("limit") ?? "";

  const url = resolveInternalBackendApiUrl(
    `/api/public/cities/search?${new URLSearchParams({ q, uf, ...(limit ? { limit } : {}) }).toString()}`
  );
  if (!url) {
    return NextResponse.json(
      { success: false, message: "URL inválida.", data: [] },
      { status: 500 }
    );
  }

  const res = await fetch(url, {
    headers: { Accept: "application/json", ...buildBffBackendForwardHeaders(request) },
    cache: "no-store",
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { success: false, message: "Resposta inválida.", data: [] },
      { status: 502 }
    );
  }

  // Filtro ao conjunto público. `fetchPublicCitySet` devolve null quando o
  // backend está indisponível e `filterToPublicCities` deixa a lista intacta
  // nesse caso — numa queda, é melhor oferecer link que pode 404 do que apagar
  // o seletor inteiro. Mesma política de fail-open do gate.
  const payload = data as { data?: unknown } | null;
  if (payload && Array.isArray(payload.data)) {
    const set = await fetchPublicCitySet();
    payload.data = filterToPublicCities(
      set,
      payload.data as Array<{ slug?: string }>,
      (city) => city?.slug
    );
  }

  const out = NextResponse.json(payload ?? data, { status: res.status });
  out.headers.set("Cache-Control", "private, no-store, max-age=0");
  return out;
}
