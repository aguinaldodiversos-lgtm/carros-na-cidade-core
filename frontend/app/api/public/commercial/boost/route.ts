/**
 * BFF público: GET /api/public/commercial/boost
 *
 * O frontend Next NÃO faz proxy central de /api/* — cada área expõe seu
 * próprio BFF (ex.: app/api/admin/[...path]). Não havia BFF nem rewrite para
 * /api/public/*, então o domínio (www) respondia 404 HTML para este path.
 *
 * Aqui encaminhamos (SEM autenticação) para o backend
 * GET /api/public/commercial/boost, que devolve a config pública do produto
 * avulso "Destaque 7 dias" (price_cents/duration_days/active) lida de
 * platform_settings — a MESMA fonte do modal/checkout.
 *
 * Read-only, sem dados sensíveis. Cacheável (ISR 900s + s-maxage no CDN).
 * Em qualquer falha (base ausente, !ok, JSON inválido), responde 200 com o
 * fallback centralizado (PUBLIC_BOOST_FALLBACK) — nunca 404/5xx para o card
 * público de /planos.
 */
import { NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { PUBLIC_BOOST_FALLBACK } from "@/lib/commercial/public-boost";

export const revalidate = 900;

const CACHE_HEADER = "public, s-maxage=900, stale-while-revalidate=86400";

function boostResponse(boost: unknown) {
  return NextResponse.json(
    { boost },
    { status: 200, headers: { "Cache-Control": CACHE_HEADER } }
  );
}

export async function GET() {
  try {
    const backendUrl = resolveInternalBackendApiUrl("/api/public/commercial/boost");
    if (!backendUrl) return boostResponse(PUBLIC_BOOST_FALLBACK);

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
    });
    if (!response.ok) return boostResponse(PUBLIC_BOOST_FALLBACK);

    const body = (await response.json().catch(() => null)) as { boost?: unknown } | null;
    if (!body || typeof body !== "object" || !body.boost) {
      return boostResponse(PUBLIC_BOOST_FALLBACK);
    }

    return boostResponse(body.boost);
  } catch {
    return boostResponse(PUBLIC_BOOST_FALLBACK);
  }
}
