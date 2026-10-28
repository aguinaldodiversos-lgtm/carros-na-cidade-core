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
import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { PUBLIC_BOOST_FALLBACK, isValidPublicBoost } from "@/lib/commercial/public-boost";

export const revalidate = 60;

const CACHE_HEADER = "public, s-maxage=60, stale-while-revalidate=60";

function boostResponse(boost: unknown) {
  return NextResponse.json({ boost }, { status: 200, headers: { "Cache-Control": CACHE_HEADER } });
}

export async function GET(request: NextRequest) {
  const verified = request.nextUrl.searchParams.get("verified") === "1";
  const fail = () => verified
    ? NextResponse.json({ error: "Destaque temporariamente indisponível." }, { status: 503, headers: { "Cache-Control": "no-store" } })
    : boostResponse(PUBLIC_BOOST_FALLBACK);
  try {
    const backendUrl = resolveInternalBackendApiUrl("/api/public/commercial/boost");
    if (!backendUrl) return fail();

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!response.ok) return fail();

    const body = (await response.json().catch(() => null)) as { boost?: unknown } | null;
    if (!isValidPublicBoost(body?.boost)) return fail();
    return verified
      ? NextResponse.json({ boost: body.boost }, { headers: { "Cache-Control": "no-store" } })
      : boostResponse(body.boost);
  } catch {
    return fail();
  }
}
