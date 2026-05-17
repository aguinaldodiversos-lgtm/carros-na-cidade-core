import { notFound, permanentRedirect } from "next/navigation";

/**
 * Rota legada `/carros-usados/regiao/[slug]` — agora só redireciona.
 *
 * Fase 4 (Fase Regional): esta rota deixou de renderizar a Página Regional
 * e passou a emitir um redirect 308 permanente para o novo endereço
 * `/:uf/regiao/:ancora` (ex.: `/sp/regiao/atibaia`).
 *
 * `force-dynamic` mantido: garante que o Next não pre-renderize nem
 * armazene em cache de HTML a resposta de redirect — cada request recebe
 * o redirect fresco. Idempotente, sem custo de SSR real.
 *
 * O middleware (`middleware.ts`) não mais intercepta este path para gate
 * de feature flag — a rota sempre redireciona independente de
 * REGIONAL_PAGE_ENABLED.
 */
export const dynamic = "force-dynamic";

const SLUG_UF_RE = /^(.+)-([a-z]{2})$/;

export default function LegacyRegionPage({ params }: { params: { slug: string } }) {
  const slug = String(params.slug || "").trim().toLowerCase();
  const match = SLUG_UF_RE.exec(slug);
  if (!match) notFound();
  permanentRedirect(`/${match[2]}/regiao/${match[1]}`);
}
