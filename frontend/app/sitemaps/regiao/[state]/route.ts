// frontend/app/sitemaps/regiao/[state]/route.ts
import { NextResponse } from "next/server";

import { BRAZIL_UFS } from "../../../../lib/city/brazil-ufs";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";
import { sitemapResponse } from "../../_lib/sitemap-response";

/**
 * `/sitemaps/regiao/[uf].xml` — sitemap regional por estado.
 *
 * ── A colisão de rota que este arquivo conserta ──────────────────────────────
 * O segmento morava numa pasta chamada `[state].xml`. No App Router, um
 * segmento dinâmico precisa ser a pasta INTEIRA entre colchetes — `[state].xml`
 * não fecha em `]`, então o Next o tratava como pasta literal e a rota nunca
 * casava com `/sitemaps/regiao/sp.xml`.
 *
 * A requisição caía então na única rota compatível: `app/[uf]/regiao/[ancora]`,
 * com `uf="sitemaps"` e `ancora="sp.xml"`. Essa página tem guard e chama
 * `notFound()` — que no Next 14.2 comita HTTP 200 com o HTML do not-found. Ou
 * seja: `GET /sitemaps/regiao/sp.xml` respondia 200 `text/html` com uma página
 * de erro e a canonical da home, no lugar de XML. O sitemap index apontava para
 * ele; o Google lia HTML onde esperava um urlset.
 *
 * Com a pasta renomeada para `[state]`, o parâmetro captura o segmento inteiro
 * (`"sp.xml"`) e o sufixo é removido aqui. O prefixo estático `sitemaps` tem
 * precedência sobre o `[uf]` dinâmico da raiz, então o hijack acaba.
 *
 * ── Estado inválido ──────────────────────────────────────────────────────────
 * 404 real com `text/plain`. Explícito de propósito: servir urlset vazio com
 * 200 para `zz.xml` seria dizer "este estado existe e está vazio", que é o
 * mesmo soft-404 que a correção elimina. O índice só lista UF com conteúdo
 * público, então um pedido fora dessa lista veio de fora.
 */

export const dynamic = "force-dynamic";
export const revalidate = 3600;

/** `"sp.xml"` → `"SP"`. Sem sufixo também é aceito (`"sp"` → `"SP"`). */
function normalizeStateParam(raw: string | undefined): string {
  return String(raw ?? "")
    .trim()
    .replace(/\.xml$/i, "")
    .toUpperCase();
}

function isBrazilianUf(uf: string): boolean {
  return BRAZIL_UFS.some((entry) => entry.value === uf);
}

function notFoundResponse(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=300",
    },
  });
}

export async function GET(_req: Request, ctx: { params?: { state?: string } }) {
  const normalizedState = normalizeStateParam(ctx?.params?.state);

  if (!normalizedState || !isBrazilianUf(normalizedState)) {
    return notFoundResponse();
  }

  return sitemapResponse(await fetchPublicSitemapByRegion(normalizedState, 50000));
}
