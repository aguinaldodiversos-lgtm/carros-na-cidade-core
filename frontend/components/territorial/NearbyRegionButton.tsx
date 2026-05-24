"use client";

import Link from "next/link";

import { useNearbyRegionRedirect } from "@/hooks/useNearbyRegionRedirect";

/**
 * NearbyRegionButton — CTA compacto "Ver carros perto de mim".
 *
 * Briefing 2026-05-21: toda página pública de catálogo (Estadual,
 * Regional, Cidade, /comprar) precisa oferecer esse caminho — o
 * visitante pode cair pelo Google em uma página que não é a região
 * dele, e precisa de um atalho rápido para a Regional correta.
 *
 * Diferente do `LocationRegionalPrompt` da Home (card grande, hero),
 * este componente é um banner enxuto pensado para ficar perto da
 * busca/filtros sem competir com o conteúdo principal.
 *
 * Variantes (`variant` prop):
 *   - "default": card com título + subtítulo + botão. Usar em página
 *     Estadual e Cidade (onde a chance de "caiu errado" é maior).
 *   - "compact": banner-pílula em uma linha só. Usar em página
 *     Regional (visitante já está em região territorial, só precisa
 *     do escape se for OUTRA região).
 *
 * Textos por contexto (`context` prop):
 *   - "estadual":  "Quer ver ofertas perto de você?"
 *   - "regional":  "Está em outra região?"
 *   - "cidade":    "Quer ver veículos próximos de você?"
 *   - "catalogo":  "Quer ver carros perto de você?"
 *
 * Toda a lógica de geolocalização + redirect para Regional vive no
 * hook `useNearbyRegionRedirect`. Este componente é só UI.
 */

type Context = "estadual" | "regional" | "cidade" | "catalogo";
type Variant = "default" | "compact";

type NearbyRegionButtonProps = {
  /** Vem do SSR caller: a flag REGIONAL_PAGE_ENABLED. Quando OFF,
   *  o hook degrada para Cidade — o componente continua funcional. */
  regionalEnabled: boolean;
  /** Decide o copy do título/subtítulo conforme a página. */
  context: Context;
  /** Layout: card cheio ou banner-pílula. Default "default". */
  variant?: Variant;
  /** UF da página atual (ex.: "SP"). Usada apenas no fallback manual
   *  para apontar o link "Escolher cidade" para a estadual correta. */
  stateUf?: string;
  /** ClassName extra (margem/padding ao redor do card). */
  className?: string;
  /**
   * Override do label do botão. Quando ausente, usa o `copy.button`
   * do contexto. Útil quando a mesma página renderiza 2 botões com
   * intenções diferentes (ex.: Regional com "Ver carros em minha
   * região" + "Ver carros da cidade").
   */
  label?: string;
  /**
   * Override do título acima do botão (variante compact). Quando
   * ausente, usa o `copy.title` do contexto.
   */
  title?: string;
  /**
   * Sufixo para o `data-testid` quando há mais de um botão na mesma
   * página (Regional renderiza 2). Default: vazio.
   */
  testIdSuffix?: string;
};

/**
 * Copy padrão por contexto (briefing 2026-05-23). O caller pode
 * overridar via prop `label`/`title` quando precisar de uma intenção
 * específica que não cabe num único default.
 *
 *   - estadual: "Ver carros perto de mim" → geo → Regional do visitante
 *   - regional: "Ver carros em minha região" → geo → Regional do visitante
 *     (útil quando o visitante caiu na regional de outra cidade pelo Google)
 *   - cidade:   "Ver carros perto de mim" → geo (raro nesta página; o
 *     CTA principal aqui costuma ser o link direto "Ver carros na Região"
 *     que NÃO usa geo, ver `CatalogPageHeader`)
 */
const COPY: Record<Context, { title: string; subtitle: string; button: string }> = {
  estadual: {
    title: "Quer ver ofertas perto de você?",
    subtitle: "Use sua localização para encontrar veículos na sua região.",
    button: "Ver carros perto de mim",
  },
  regional: {
    title: "Está em outra região?",
    subtitle: "Use sua localização para abrir a região correta.",
    button: "Ver carros em minha região",
  },
  cidade: {
    title: "Quer ver veículos próximos de você?",
    subtitle: "Use sua localização para ver ofertas na região correta.",
    button: "Ver carros perto de mim",
  },
  catalogo: {
    title: "Quer ver carros perto de você?",
    subtitle: "Use sua localização para encontrar a região mais próxima.",
    button: "Ver carros perto de mim",
  },
};

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s7-7 7-13a7 7 0 1 0-14 0c0 6 7 13 7 13Z" />
      <circle cx="12" cy="9" r="2.2" />
    </svg>
  );
}

export function NearbyRegionButton({
  regionalEnabled,
  context,
  variant = "default",
  stateUf,
  className,
  label,
  title,
  testIdSuffix = "",
}: NearbyRegionButtonProps) {
  const { state, trigger, reset } = useNearbyRegionRedirect({ regionalEnabled });
  const defaults = COPY[context];
  const copy = {
    title: title ?? defaults.title,
    subtitle: defaults.subtitle,
    button: label ?? defaults.button,
  };
  const testIdRoot = testIdSuffix ? `nearby-region-${testIdSuffix}` : "nearby-region";
  const testIdButton = testIdSuffix
    ? `nearby-region-trigger-${testIdSuffix}`
    : "nearby-region-trigger";

  const isBusy = state.kind === "locating" || state.kind === "redirecting";
  const busyLabel = state.kind === "redirecting" ? "Abrindo região..." : "Localizando...";

  // ───── Erro / fallback ─────────────────────────────────────────────
  if (
    state.kind === "denied" ||
    state.kind === "unavailable" ||
    state.kind === "backend_error" ||
    state.kind === "out_of_coverage"
  ) {
    const message =
      state.kind === "denied"
        ? "Não foi possível acessar sua localização. Escolha sua cidade ou região manualmente."
        : state.kind === "unavailable"
          ? "Seu navegador não permite localização automática. Escolha uma cidade ou região."
          : state.kind === "backend_error"
            ? "Não conseguimos encontrar sua região automaticamente. Escolha uma cidade para continuar."
            : "Não encontramos uma cidade próxima na nossa cobertura. Escolha manualmente.";

    const showRetry = state.kind === "backend_error" || state.kind === "unavailable";

    const fallbackHref = stateUf ? `/carros-usados/${stateUf.toLowerCase()}` : "/comprar";

    return (
      <section
        aria-label="Localização indisponível"
        className={className ?? "mx-auto w-full max-w-7xl px-4 pt-2 sm:px-6 lg:px-8"}
        data-testid="nearby-region-fallback"
      >
        <div className="rounded-xl border border-cnc-line bg-white p-3 sm:p-4">
          <p className="text-sm text-cnc-muted" role="status" aria-live="polite">
            {message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {showRetry ? (
              <button
                type="button"
                onClick={() => {
                  reset();
                  trigger();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
                data-testid="nearby-region-retry"
              >
                Tentar novamente
              </button>
            ) : null}
            <Link
              href={fallbackHref}
              className={
                showRetry
                  ? "inline-flex items-center gap-2 rounded-lg border border-cnc-line bg-white px-3.5 py-2 text-sm font-semibold text-cnc-text transition hover:border-primary hover:text-primary"
                  : "inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
              }
              data-testid="nearby-region-manual"
            >
              Escolher cidade
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // ───── Variante compact ────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <section
        aria-label={copy.button}
        className={className ?? "mx-auto w-full max-w-7xl px-4 pt-2 sm:px-6 lg:px-8"}
        data-testid={`${testIdRoot}-button`}
        data-variant="compact"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cnc-line bg-white px-3 py-2 sm:px-4">
          <p className="text-sm font-medium text-cnc-text-strong">{copy.title}</p>
          <button
            type="button"
            onClick={trigger}
            disabled={isBusy}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong disabled:opacity-60"
            data-testid={testIdButton}
          >
            <PinIcon />
            {isBusy ? busyLabel : copy.button}
          </button>
        </div>
      </section>
    );
  }

  // ───── Variante default (card médio) ───────────────────────────────
  return (
    <section
      aria-label={copy.button}
      className={className ?? "mx-auto w-full max-w-7xl px-4 pt-2 sm:px-6 lg:px-8"}
      data-testid={`${testIdRoot}-button`}
      data-variant="default"
    >
      <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary-soft/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-cnc-text-strong sm:text-[15px]">{copy.title}</p>
          <p className="mt-0.5 text-xs text-cnc-muted">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={trigger}
          disabled={isBusy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-extrabold text-white shadow-card transition hover:bg-primary-strong disabled:opacity-60 sm:w-auto"
          data-testid={testIdButton}
        >
          <PinIcon />
          {isBusy ? busyLabel : copy.button}
        </button>
      </div>
    </section>
  );
}
