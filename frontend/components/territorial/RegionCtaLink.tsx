import "server-only";
import Link from "next/link";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";

/**
 * CTA primário que liga uma página de cidade à Página Regional
 * (`/carros-usados/regiao/[slug]`).
 *
 * PR 2 (2026-05-15) — promovido de outline neutro para primary filled.
 * A Página Regional é o destino natural de quem visita uma cidade com
 * poucos anúncios. Antes ficava como botão neutro discreto e o usuário
 * não tinha pista clara do "próximo passo certo".
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
      <p className="mb-3 text-sm text-cnc-muted">
        Quer ver mais opções perto de {cityName}? Veja a região completa.
      </p>
      <Link
        href={`/carros-usados/regiao/${encodeURIComponent(slug)}`}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong"
        aria-label={`Ver carros na região de ${cityName}`}
        data-testid="region-cta-link"
      >
        Ver carros na região de {cityName}
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
