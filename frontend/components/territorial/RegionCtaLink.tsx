import "server-only";
import Link from "next/link";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";

/**
 * CTA discreto que liga uma página de cidade à Página Regional
 * (`/carros-usados/regiao/[slug]`).
 *
 * Server component (`"server-only"`): chama `isRegionalPageEnabled()`
 * direto e retorna `null` quando a flag está desligada. NÃO pode ser
 * usado de client component — a flag é server-only por design.
 *
 * Compartilhado entre:
 *  - `/cidade/[slug]/page.tsx` (URL legada que canonicaliza para /carros-em).
 *  - `/carros-em/[slug]/page.tsx` (URL canônica indexada).
 *
 * Não duplicar a lógica do gate em outros lugares — sempre passar por
 * este componente. Se a flag mudar de contrato no futuro
 * (ex.: passar a depender de uma config do admin), só este arquivo
 * precisa ser ajustado.
 */

interface RegionCtaLinkProps {
  /** Slug da cidade-base (ex.: "atibaia-sp"). */
  slug: string;
  /** Nome da cidade exibido no link (ex.: "Atibaia"). */
  cityName: string;
}

export function RegionCtaLink({ slug, cityName }: RegionCtaLinkProps) {
  if (!isRegionalPageEnabled()) {
    return null;
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <Link
        href={`/carros-usados/regiao/${encodeURIComponent(slug)}`}
        className="inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors"
        aria-label={`Ver carros na região de ${cityName}`}
        data-testid="region-cta-link"
      >
        Ver carros na região de {cityName}
      </Link>
    </div>
  );
}
