import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isValidBrazilianCitySlug } from "@/lib/buy/territory-variant";
import { createLocalSeoPage } from "@/lib/seo/local-seo-route";

/**
 * `force-dynamic` (NÃO usar `revalidate`) — igual a `/carros-em/[slug]`: o
 * gate de cidade inexistente chama `notFound()` e, sob ISR, o Next 14.2
 * retornaria HTTP 200 com body not-found (soft-404). `force-dynamic` renderiza
 * por request e preserva o 404 real. O fetch interno mantém cache próprio.
 *
 * CRÍTICO (auditoria soft-404 2026-07-03): `dynamic` declarado ANTES de
 * `generateMetadata`, e `generateMetadata` é uma `export async function`
 * declarada AQUI (no módulo da rota), com `notFound()` ANTES de qualquer
 * await — só assim o 404 é comitado no status. Reexportar a `generateMetadata`
 * do closure da factory NÃO comitava o 404 (renderizava o body de not-found
 * com 200). O gate fica no módulo da rota; a factory só monta o conteúdo.
 */
export const dynamic = "force-dynamic";

const built = createLocalSeoPage("baratos");

export async function generateMetadata(ctx: {
  params: { slug: string };
}): Promise<Metadata> {
  if (!isValidBrazilianCitySlug(ctx.params.slug)) notFound();
  return built.generateMetadata(ctx);
}

export default built.Page;
