import "server-only";
import Link from "next/link";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";

/**
 * Faixa de CTAs cross-territoriais nas páginas de Cidade
 * (`/carros-em/[slug]` e `/cidade/[slug]`).
 *
 * Auditoria 2026-05-11: a Página da Cidade tinha CTA para a Regional
 * (via `RegionCtaLink`) mas NÃO oferecia caminho navegacional para a
 * Página Estadual. Resultado: visitante em Atibaia conseguia ampliar
 * para "Região de Atibaia" mas não para "Catálogo de SP".
 *
 * PR 2 (2026-05-15) — hierarquia de "ampliação" reestruturada:
 *   - A Região é o destino NATURAL de quem está numa cidade pequena ou
 *     com poucos anúncios. Antes, ambos os CTAs (Região + Estado) eram
 *     outline neutros lado a lado, e o Regional ficava escondido como
 *     "mais um botão". Agora o Regional vira PRIMARY filled quando a
 *     flag `REGIONAL_PAGE_ENABLED` está ativa.
 *   - O Estado é "ampliação ampla" — mantido como secondary outline.
 *   - Quando a flag regional está OFF (Fase A do rollout, ou estados
 *     onde a regional ainda não foi ativada), o Estado vira o único
 *     caminho e ganha destaque primary como fallback.
 *
 * Princípio: o usuário SEMPRE tem um próximo passo claro. A regional é
 * preferida quando disponível porque preserva proximidade; o estado é
 * a alternativa segura quando a regional não existe.
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

const PRIMARY_BTN =
  "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong";

const SECONDARY_BTN =
  "inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-4 py-2 text-sm font-semibold text-cnc-text hover:border-primary hover:text-primary transition-colors";

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
      {/* Microcopy que explica POR QUE estes CTAs existem — sem ela, a
          ampliação parece arbitrária. Mantida discreta acima dos botões. */}
      <p className="mb-3 text-sm text-cnc-muted">
        {regionalEnabled
          ? `Quer ver mais opções perto de ${cityName}? Amplie para a região ou para o estado.`
          : `Quer ver mais opções? Veja o catálogo completo do estado.`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {regionalEnabled ? (
          <Link
            href={`/carros-usados/regiao/${encodeURIComponent(slug)}`}
            className={PRIMARY_BTN}
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
            className={regionalEnabled ? SECONDARY_BTN : PRIMARY_BTN}
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
