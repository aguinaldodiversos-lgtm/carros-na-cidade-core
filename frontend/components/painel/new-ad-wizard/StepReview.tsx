"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardPayload, BoostOption } from "@/lib/dashboard-types";
import type { SubscriptionPlan } from "@/lib/plans/plan-store";
import { fetchPlansFromAPI } from "@/lib/plans/plan-service";
import { computeAdQuality } from "@/lib/painel/ad-quality";
import {
  buildMonetizationCards,
  COMPARISON_ROWS,
  TRUST_ITEMS,
  type MonetizationCard,
  type MonetizationKey,
} from "@/lib/painel/review-monetization";
import { formatKm, parseCurrency } from "./currency";
import { FinalizeLocationFields } from "./FinalizeLocationFields";
import type { WizardFormState } from "./types";

type Patch = (partial: Partial<WizardFormState>) => void;
type SubmitState = "idle" | "submitting" | "success" | "error";

type Props = {
  state: WizardFormState;
  patch: Patch;
  dashboard: DashboardPayload | null;
  dashboardError: string | null;
  boostOptions: BoostOption[];
  submitState: SubmitState;
  submitMessage: string;
  subscribeState: "idle" | "loading";
  subscribeMessage: string;
  onBack: () => void;
  onPublishFree: () => void;
  onPublishBoost: () => void;
  onSubscribe: (planId: string) => void;
};

const DESCRIPTION_MAX = 1000;
const cardLabel = "mb-2 block text-sm font-semibold text-cnc-text-strong";

// ── Ícones inline (lucide-react não está instalado no projeto) ──────────────
// Ilustração de megafone colorida (sobre o fundo claro, sem card azul) — fiel
// ao mockup revisão-anuncio.png: megafone azul institucional + confete.
function MegaphoneArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      {/* Confete */}
      <circle cx="84" cy="20" r="3.2" fill="#d18a12" />
      <circle cx="101" cy="33" r="2.6" fill="#0e62d8" />
      <circle cx="95" cy="14" r="2.2" fill="#0f9f6e" />
      <circle cx="111" cy="51" r="2.6" fill="#d14343" />
      <path d="M90 28c2-3 6-3 8 0" stroke="#0e62d8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M105 43l6-3" stroke="#d18a12" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M100 60l7 1" stroke="#0f9f6e" strokeWidth="2.2" strokeLinecap="round" />
      {/* Megafone */}
      <g transform="rotate(-14 60 62)">
        <path d="M82 50c4 3 4 13 0 16" stroke="#0e62d8" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M89 44c7 5 7 25 0 30" stroke="#9bc1ff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M30 52 74 38a4 4 0 0 1 5 4v38a4 4 0 0 1-5 4L30 70Z" fill="#0e62d8" />
        <path d="M74 38a4 4 0 0 1 5 4v38a4 4 0 0 1-5 4Z" fill="#0c4fb0" />
        <rect x="40" y="69" width="9" height="22" rx="3" fill="#0c4fb0" />
        <rect x="21" y="52" width="11" height="18" rx="4" fill="#9bc1ff" />
      </g>
    </svg>
  );
}
function Diamond({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="m12 3 4 4-4 14L8 7l4-4Z" fill="currentColor" opacity="0.15" />
      <path
        d="M5 8h14M9 4h6l4 4-7 13L5 8l4-4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Crown({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13L4 8Z" fill="currentColor" opacity="0.15" />
      <path
        d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13L4 8Zm1.5 12h13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Sparkles({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Zm6 9l.8 2.2L21 15l-2.2.8L18 18l-.8-2.2L15 15l2.2-.8L18 12Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Award({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.5 13.2 7 21l5-3 5 3-1.5-7.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m12 6.5 1 2 2.2.3-1.6 1.5.4 2.2L12 11.5l-2 1 .4-2.2L8.8 8.8 11 8.5z"
        fill="currentColor"
        opacity="0.25"
      />
    </svg>
  );
}
function Tag({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4.5h6.5L20 14l-6.5 6.5L4 11V4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
function Shield({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Bolt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Handshake({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m11 17 2 2a1.5 1.5 0 0 0 2.1-2.1M3 11l4-4 5 4 2-1 5 4M3 11l-1 1m1-1 3 3M21 11l1 1m-1-1-3 3-2-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Headset({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 13v-1a8 8 0 0 1 16 0v1m0 0v3a2 2 0 0 1-2 2h-2v-5h2.5M4 13h2.5v5H4.5A1.5 1.5 0 0 1 3 16.5V13h1Zm16 5a4 4 0 0 1-4 3h-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Check({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m5 12 5 5L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Lock({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 11V8a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TRUST_ICONS = { shield: Shield, zap: Bolt, handshake: Handshake, headset: Headset } as const;

// ── Card comercial (radio card acessível) ──────────────────────────────────
function PlanCard({
  card,
  selected,
  onSelect,
}: {
  card: MonetizationCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const style = {
    accent: {
      ring: selected
        ? "border-cnc-warning ring-2 ring-cnc-warning/30"
        : "border-cnc-warning/45 hover:border-cnc-warning/70",
      badge: "bg-cnc-warning text-white",
      btn: "bg-cnc-warning text-white hover:brightness-105",
      iconWrap: "bg-primary-soft",
      icon: "text-primary",
      check: "text-primary",
      Icon: Diamond,
    },
    highlight: {
      ring: selected
        ? "border-primary ring-2 ring-primary/30"
        : "border-primary/55 ring-1 ring-primary/15 hover:border-primary/80",
      badge: "bg-primary text-white",
      btn: "bg-primary text-white hover:bg-primary-strong",
      iconWrap: "bg-primary-soft",
      icon: "text-primary",
      check: "text-cnc-success",
      Icon: Award,
    },
    neutral: {
      ring: selected
        ? "border-primary ring-2 ring-primary/30"
        : "border-cnc-line hover:border-cnc-line-strong",
      badge: "bg-cnc-bg text-cnc-text-strong",
      btn: "bg-cnc-text-strong text-white hover:bg-cnc-footer-b",
      iconWrap: "bg-cnc-success/10",
      icon: "text-cnc-success",
      check: "text-cnc-success",
      Icon: Crown,
    },
    free: {
      ring: selected
        ? "border-primary ring-2 ring-primary/30"
        : "border-cnc-line hover:border-cnc-line-strong",
      badge: "bg-cnc-bg text-cnc-text-strong",
      btn: "bg-cnc-text-strong text-white hover:bg-cnc-footer-b",
      iconWrap: "bg-cnc-bg",
      icon: "text-cnc-muted",
      check: "text-cnc-success",
      Icon: Tag,
    },
  }[card.style];

  const Icon = style.Icon;

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-plan-key={card.key}
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`relative flex cursor-pointer flex-col rounded-2xl border bg-white p-5 text-left shadow-card outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary/50 ${style.ring}`}
    >
      {card.badge ? (
        <span
          className={`absolute -top-2.5 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider shadow-sm ${style.badge}`}
        >
          {card.badge}
        </span>
      ) : null}
      {selected ? (
        <span className="absolute right-4 top-4 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}

      {/* Cabeçalho centralizado */}
      <div className="flex flex-col items-center text-center">
        <span
          className={`mt-1.5 inline-flex h-12 w-12 items-center justify-center rounded-full ${style.iconWrap}`}
        >
          <Icon className={`h-6 w-6 ${style.icon}`} />
        </span>
        <h3 className="mt-3 text-[17px] font-extrabold text-cnc-text-strong">{card.name}</h3>
        <p className="mt-1 flex items-baseline gap-1">
          <strong className="text-[22px] font-extrabold tracking-tight text-cnc-text-strong">
            {card.priceLabel}
          </strong>
          <span className="text-xs text-cnc-muted">{card.period}</span>
        </p>
      </div>

      <ul className="mt-4 flex-1 space-y-2 text-[13px] text-cnc-text-strong">
        {card.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.check}`} />
            <span className="leading-5">{b}</span>
          </li>
        ))}
      </ul>

      {card.cautions?.length ? (
        <ul className="mt-3 space-y-1 border-t border-cnc-line/70 pt-3 text-[11px] text-cnc-muted">
          {card.cautions.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-cnc-muted"
              />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={`mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-bold transition ${style.btn}`}
      >
        {card.buttonLabel}
      </button>
    </div>
  );
}

// ── Componente principal ────────────────────────────────────────────────────
export default function StepReview({
  state,
  patch,
  dashboard,
  dashboardError,
  boostOptions,
  submitState,
  submitMessage,
  subscribeState,
  subscribeMessage,
  onBack,
  onPublishFree,
  onPublishBoost,
  onSubscribe,
}: Props) {
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [selected, setSelected] = useState<MonetizationKey>("free");
  const [termsError, setTermsError] = useState(false);

  // Refina preços com dados reais; cards já renderizam com os valores oficiais
  // de fallback antes do fetch resolver (sem flash / sem dependência de rede).
  useEffect(() => {
    let active = true;
    fetchPlansFromAPI({ activeOnly: true })
      .then((rows) => {
        if (active) setPlans(rows);
      })
      .catch(() => {
        /* mantém fallback centralizado */
      });
    return () => {
      active = false;
    };
  }, []);

  const boostOption = useMemo(
    () => boostOptions.find((b) => b.days === 7) ?? boostOptions[0] ?? null,
    [boostOptions]
  );

  const cards = useMemo(
    () => buildMonetizationCards({ plans: plans ?? undefined, boostOption }),
    [plans, boostOption]
  );
  const selectedCard = cards.find((c) => c.key === selected) ?? cards[cards.length - 1];

  const title =
    [state.yearModel, state.brandLabel, state.modelLabel, state.versionLabel]
      .filter(Boolean)
      .join(" ")
      .trim() || "Novo anúncio";

  const hasCity = state.cityId != null && state.city.trim().length > 0;
  const quality = computeAdQuality({
    photos: state.draftPhotoUrls.length,
    hasPrice: parseCurrency(state.price) > 0,
    hasDescription: state.description.trim().length > 0,
    hasCity,
    hasOptionals: state.vehicleOptionKeys.length > 0,
  });

  const coverUrl = state.draftPhotoUrls[0] ?? "";
  const photoCount = state.draftPhotoUrls.length;
  const busy = submitState === "submitting" || subscribeState === "loading";

  function ensureTerms(): boolean {
    if (!state.acceptTerms) {
      setTermsError(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    }
    setTermsError(false);
    return true;
  }

  function handlePrimaryCta() {
    if (busy) return;
    if (selectedCard.action === "subscribe" && selectedCard.planId) {
      onSubscribe(selectedCard.planId);
      return;
    }
    // publish-free e publish-boost exigem termo de responsabilidade.
    if (!ensureTerms()) return;
    if (selectedCard.action === "publish-boost") {
      onPublishBoost();
    } else {
      onPublishFree();
    }
  }

  function handlePublishFreeShortcut() {
    if (busy) return;
    if (!ensureTerms()) return;
    onPublishFree();
  }

  const eligibilityBlocked =
    dashboard?.publish_eligibility &&
    !dashboard.publish_eligibility.allowed &&
    dashboard.publish_eligibility.reason;

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <button
        type="button"
        onClick={onBack}
        className="-mb-1 inline-flex items-center gap-1 text-sm font-semibold text-cnc-muted transition hover:text-primary"
      >
        ← Voltar para descrição
      </button>

      {/* Título da etapa — sobre o fundo claro, sem card azul (spec §2) */}
      <header className="flex items-start justify-between gap-6">
        <div className="max-w-2xl">
          <h1
            data-testid="review-title"
            className="text-[26px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[33px]"
          >
            Seu anúncio está quase no ar
          </h1>
          <p className="mt-2 text-sm leading-7 text-cnc-muted sm:text-base">
            Revise os dados e escolha como deseja publicar para ganhar mais visibilidade.
          </p>
        </div>
        <MegaphoneArt className="hidden h-24 w-24 shrink-0 sm:block lg:h-28 lg:w-28" />
      </header>

      {dashboardError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dashboardError}
        </div>
      ) : null}
      {eligibilityBlocked ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {dashboard?.publish_eligibility?.reason}
        </div>
      ) : null}

      {/* Resumo do anúncio */}
      <section className="rounded-2xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative h-48 w-full shrink-0 overflow-hidden rounded-xl bg-cnc-bg sm:h-[120px] sm:w-52">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-cnc-muted">
                Sem foto
              </div>
            )}
            {photoCount > 0 ? (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white">
                {photoCount} {photoCount === 1 ? "foto" : "fotos"}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-snug text-cnc-text-strong">{title}</h2>
            <div className="mt-3 flex flex-wrap items-end gap-x-7 gap-y-2">
              <div>
                <span className="block text-xl font-extrabold text-primary">
                  {state.price || "—"}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-cnc-muted">
                  Preço
                </span>
              </div>
              <div>
                <span className="block text-sm font-bold text-cnc-text-strong">
                  {state.mileage ? `${formatKm(state.mileage)} km` : "—"}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-cnc-muted">
                  Quilometragem
                </span>
              </div>
              <div>
                <span
                  className={`block text-sm font-bold ${hasCity ? "text-cnc-text-strong" : "text-cnc-warning"}`}
                >
                  {hasCity ? `${state.city} / ${state.state}` : "Não definida"}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wide text-cnc-muted">
                  Cidade
                </span>
              </div>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-center">
            {quality.score >= 80 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cnc-success/10 px-3 py-1.5 text-xs font-bold text-cnc-success ring-1 ring-cnc-success/30">
                <Check className="h-3.5 w-3.5" /> Anúncio completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-cnc-warning ring-1 ring-cnc-warning/30">
                Revise as pendências
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Qualidade do anúncio */}
      <section className="rounded-2xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center text-center sm:w-40">
            <QualityGauge score={quality.score} />
            <h3 className="mt-3 text-sm font-extrabold text-cnc-text-strong">
              Qualidade do anúncio
            </h3>
            <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-bold text-cnc-warning">
              <span aria-hidden>★</span>
              {quality.rating}
            </p>
          </div>
          <div className="w-full flex-1">
            <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
              {quality.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      c.ok ? "bg-cnc-success text-white" : "border border-cnc-line text-transparent"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className={c.ok ? "font-medium text-cnc-text" : "text-cnc-muted"}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
            {quality.score >= 80 ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-cnc-success/25 bg-cnc-success/5 px-4 py-3 text-sm font-medium text-cnc-success">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                Parabéns! Seu anúncio está completo e pronto para ter mais visibilidade.
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-cnc-line bg-cnc-bg px-4 py-3 text-sm text-cnc-muted">
                Complete os itens pendentes acima para aumentar a visibilidade do anúncio.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Descrição + UF + Cidade + Responsabilidade (bloco de dados editáveis) */}
      <section className="rounded-2xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <div className="space-y-5">
          <label className="block">
            <span className={cardLabel}>Descrição do anúncio (opcional)</span>
            <div className="relative">
              <textarea
                value={state.description}
                onChange={(e) => patch({ description: e.target.value.slice(0, DESCRIPTION_MAX) })}
                rows={5}
                maxLength={DESCRIPTION_MAX}
                placeholder="Destaque diferenciais, estado de conservação e histórico de revisões."
                className="w-full resize-y rounded-xl border border-primary/30 bg-primary-soft/30 px-4 py-3 pb-7 text-sm text-cnc-text outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/30"
              />
              <span className="pointer-events-none absolute bottom-2.5 right-3 text-xs text-cnc-muted">
                {state.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
          </label>

          <FinalizeLocationFields state={state} patch={patch} />
        </div>

        {/* Responsabilidade — caixa discreta logo abaixo (spec §7) */}
        <div className="mt-5 border-t border-cnc-line/70 pt-5">
          <label
            className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 transition ${
              termsError
                ? "border-cnc-danger bg-cnc-danger/5 ring-1 ring-cnc-danger/20"
                : "border-cnc-line bg-cnc-bg/50"
            }`}
          >
            <input
              type="checkbox"
              checked={state.acceptTerms}
              onChange={(e) => {
                patch({ acceptTerms: e.target.checked });
                if (e.target.checked) setTermsError(false);
              }}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-cnc-line-strong text-primary accent-primary"
            />
            <span className="text-sm leading-6 text-cnc-text">
              Confirmo que as informações são verdadeiras e autorizo a publicação conforme as regras
              do portal.
            </span>
          </label>
          {termsError ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-cnc-danger">
              Marque a confirmação acima para publicar.
            </p>
          ) : null}
        </div>
      </section>

      {/* Bloco comercial */}
      <section aria-labelledby="review-monetization-title" className="pt-1">
        <h2
          id="review-monetization-title"
          className="text-xl font-extrabold text-cnc-text-strong sm:text-[22px]"
        >
          Aumente suas chances de vender
        </h2>
        <p className="mt-1 text-sm text-cnc-muted">
          Escolha a melhor opção para destacar seu anúncio e vender mais rápido.
        </p>

        <div
          role="radiogroup"
          aria-label="Opções de publicação"
          className="mt-5 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {cards.map((card) => (
            <PlanCard
              key={card.key}
              card={card}
              selected={selected === card.key}
              onSelect={() => setSelected(card.key)}
            />
          ))}
        </div>

        {subscribeMessage ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {subscribeMessage}
          </p>
        ) : null}
      </section>

      {/* Comparativo */}
      <section className="overflow-hidden rounded-2xl border border-cnc-line bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-cnc-bg/60 text-left">
                <th className="w-44 px-5 py-3 text-xs font-bold uppercase tracking-wide text-cnc-muted">
                  Compare as opções
                </th>
                {cards.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-3 text-[13px] font-extrabold text-cnc-text-strong"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-cnc-line/70">
                  <th className="px-5 py-2.5 text-left text-[13px] font-semibold text-cnc-muted">
                    {row.label}
                  </th>
                  {cards.map((c) => {
                    const v = row.values[c.key];
                    const positive = v === "Sim";
                    const negative = v === "Não";
                    return (
                      <td
                        key={c.key}
                        className="px-3 py-2.5 align-middle text-[13px] text-cnc-text"
                      >
                        {positive ? (
                          <Check className="h-4 w-4 text-cnc-success" />
                        ) : negative ? (
                          <span aria-hidden className="text-cnc-muted-soft">
                            —
                          </span>
                        ) : (
                          v
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Confiança — tira horizontal única, células separadas por hairline (spec §14) */}
      <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-cnc-line bg-cnc-line/70 shadow-card sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_ITEMS.map((item) => {
          const Icon = TRUST_ICONS[item.icon];
          return (
            <div key={item.title} className="flex items-start gap-3 bg-white px-5 py-4">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-[13px] font-extrabold text-cnc-text-strong">{item.title}</h3>
                <p className="text-xs leading-5 text-cnc-muted">{item.text}</p>
              </div>
            </div>
          );
        })}
      </section>

      {submitMessage ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm leading-7 ${
            submitState === "success"
              ? "border-cnc-success/30 bg-cnc-success/5 text-cnc-success"
              : "border-cnc-danger/30 bg-cnc-danger/5 text-cnc-danger"
          }`}
        >
          {submitMessage}
        </div>
      ) : null}

      {/* Barra fixa inferior */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cnc-line bg-white/95 px-4 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:py-3">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                selectedCard.requiresPayment
                  ? "bg-cnc-warning/15 text-cnc-warning"
                  : "bg-primary-soft text-primary"
              }`}
            >
              {selectedCard.requiresPayment ? (
                <Diamond className="h-5 w-5" />
              ) : (
                <Check className="h-5 w-5" />
              )}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-cnc-text-strong">
                {selectedCard.requiresPayment
                  ? `${selectedCard.name} selecionado`
                  : "Publicação grátis selecionada"}
              </p>
              <p className="text-base font-extrabold text-cnc-text-strong sm:text-[15px]">
                {selectedCard.priceLabel}
                {selectedCard.requiresPayment ? (
                  <span className="ml-1 text-xs font-medium text-cnc-muted">
                    {selectedCard.period}
                  </span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {selectedCard.requiresPayment ? (
              <button
                type="button"
                onClick={handlePublishFreeShortcut}
                disabled={busy}
                className="inline-flex h-12 items-center justify-center rounded-xl border border-cnc-line bg-white px-5 text-sm font-bold text-cnc-text-strong transition hover:bg-cnc-bg disabled:opacity-60"
              >
                Publicar grátis
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryCta}
              disabled={busy}
              data-testid="review-primary-cta"
              className="inline-flex h-12 min-w-[240px] flex-col items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-[0_8px_18px_rgba(14,98,216,0.28)] transition hover:bg-primary-strong disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {selectedCard.requiresPayment && !busy ? <Lock className="h-4 w-4" /> : null}
                {busy
                  ? "Processando…"
                  : selectedCard.requiresPayment
                    ? "Continuar para pagamento"
                    : "Publicar anúncio grátis"}
              </span>
              {selectedCard.requiresPayment && !busy ? (
                <span className="text-[11px] font-medium text-white/80">
                  Próximo passo: escolha forma de pagamento
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityGauge({ score }: { score: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color =
    clamped >= 80 ? "#0f9f6e" : clamped >= 60 ? "#0e62d8" : clamped >= 40 ? "#d18a12" : "#d14343";
  return (
    <div className="relative h-24 w-24 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#e6ebf5" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold text-cnc-text-strong">{clamped}%</span>
      </div>
    </div>
  );
}
