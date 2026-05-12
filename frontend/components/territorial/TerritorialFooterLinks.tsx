import "server-only";
import Link from "next/link";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";

/**
 * Faixa de CTAs cross-territoriais no rodapé das páginas de Cidade
 * (`/carros-em/[slug]`).
 *
 * Auditoria 2026-05-11: a Página da Cidade tinha CTA para a Regional
 * (via `RegionCtaLink`) mas NÃO oferecia caminho navegacional para a
 * Página Estadual. Resultado: visitante em Atibaia conseguia ampliar
 * para "Região de Atibaia" mas não para "Catálogo de SP".
 *
 * Este componente substitui o `RegionCtaLink` solo, agregando:
 *   - CTA "Ver carros na região de [Cidade]" → `/carros-usados/regiao/
 *     [slug]`. Gated por `isRegionalPageEnabled()` (preserva o gate
 *     server-only que o `RegionCtaLink` já tinha).
 *   - CTA "Ver catálogo de [UF]" → `/comprar/estado/[uf]`. Sempre
 *     visível (rota estadual não tem feature flag).
 *
 * Server component (`"server-only"`): a flag regional é server-only por
 * design. Mantém compat com `data-testid="region-cta-link"` para
 * anti-regressão de E2E/scripts.
 */

interface TerritorialFooterLinksProps {
  /** Slug da cidade-base (ex.: "atibaia-sp"). */
  slug: string;
  /** Nome da cidade exibido nos links (ex.: "Atibaia"). */
  cityName: string;
  /**
   * UF de 2 letras (lowercase ou uppercase). `null`/`undefined`
   * aceitos para suportar `LocalSeoLandingModel.state` cuja tipagem
   * é `string | null | undefined` no payload legado.
   */
  state: string | null | undefined;
}

export function TerritorialFooterLinks({
  slug,
  cityName,
  state,
}: TerritorialFooterLinksProps) {
  const stateUpper = String(state || "").toUpperCase().slice(0, 2);
  const stateLower = stateUpper.toLowerCase();
  const regionalEnabled = isRegionalPageEnabled();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <div className="flex flex-wrap items-center gap-3">
        {regionalEnabled ? (
          <Link
            href={`/carros-usados/regiao/${encodeURIComponent(slug)}`}
            className="inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
            aria-label={`Ver carros na região de ${cityName}`}
            data-testid="region-cta-link"
          >
            Ver carros na região de {cityName}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {stateUpper ? (
          <Link
            href={`/comprar/estado/${stateLower}`}
            className="inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
            aria-label={`Ver catálogo de ${stateUpper}`}
            data-testid="state-cta-link"
          >
            Ver catálogo de {stateUpper}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
