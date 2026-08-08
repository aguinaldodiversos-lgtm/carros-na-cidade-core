import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { isValidBrazilianCitySlug, type SearchParams } from "@/lib/buy/territory-variant";
import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";
import { decideSeoQueryPolicy } from "@/lib/seo/query-policy";

/**
 * `/comprar/cidade/[slug]` — ALIAS LEGADO. Só redireciona.
 *
 * ── O que era ────────────────────────────────────────────────────────────────
 * Uma segunda página de catálogo completa: mesmo H1, mesmo grid, mesma cidade,
 * com canonical apontando para `/carros-em/[slug]`. Duas URLs indexáveis para o
 * mesmo recurso — e a que tinha o canonical apontando para fora ainda respondia
 * 200 com `index` sempre que o estoque batia o limiar. O Search Console
 * reportava a família inteira como "página alternativa com canônica diferente".
 *
 * Pior: esta rota aplicava FALLBACK TERRITORIAL. Cidade sem estoque servia os
 * anúncios da vizinha mais forte sob a URL da cidade pedida. É a definição de
 * doorway page, e era a única rota do portal que fazia isso.
 *
 * ── O que é ──────────────────────────────────────────────────────────────────
 * 308 para a canônica, preservando o slug pedido. O status real é emitido pelo
 * `middleware.ts` (`decideLegacyCityRedirect`), antes de qualquer HTML sair —
 * o `permanentRedirect()` daqui é defesa em profundidade, caso o matcher do
 * middleware mude. Ver a nota sobre meta refresh em `canonical-redirects.ts`.
 *
 * Cidade inexistente continua 404 (nunca redirect para outra cidade), e cidade
 * sem anúncio ativo segue barrada pelo gate de existência no middleware.
 */

type ComprarCidadePageProps = {
  params: { slug: string };
  searchParams?: SearchParams;
};

export const dynamic = "force-dynamic";

/** Destino do 308, com a query já normalizada pela política central. */
function resolveTarget(slug: string, searchParams: SearchParams): string | null {
  const canonical = getCanonicalCityPath(slug);
  if (!canonical) return null;

  const { normalizedQuery } = decideSeoQueryPolicy(searchParams);
  return normalizedQuery ? `${canonical}?${normalizedQuery}` : canonical;
}

/**
 * `robots: noindex` — a rota não deve ser indexada em hipótese alguma. Se o
 * redirect falhar e o body vazar, o crawler ainda não indexa a duplicata.
 */
export async function generateMetadata({ params }: ComprarCidadePageProps): Promise<Metadata> {
  const slug = String(params.slug || "").trim();
  if (!isValidBrazilianCitySlug(slug)) notFound();

  return {
    alternates: { canonical: getCanonicalCityPath(slug) ?? undefined },
    robots: { index: false, follow: true },
  };
}

export default async function ComprarCidadeLegacyRedirect({
  params,
  searchParams = {},
}: ComprarCidadePageProps) {
  const slug = String(params.slug || "").trim();
  if (!isValidBrazilianCitySlug(slug)) notFound();

  const target = resolveTarget(slug, searchParams);
  if (!target) notFound();

  permanentRedirect(target);
}
