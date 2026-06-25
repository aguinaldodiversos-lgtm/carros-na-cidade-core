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
function Megaphone({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 11v2a1 1 0 0 0 1 1h2l3.5 3.5a1 1 0 0 0 1.7-.7V7.2a1 1 0 0 0-1.7-.7L6 10H4a1 1 0 0 0-1 1Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M6 14H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h2l3.5-3.5A1 1 0 0 1 11.2 7v10a1 1 0 0 1-1.7.7L6 14Zm0 0v3.5A1.5 1.5 0 0 0 7.5 19M14 9a3 3 0 0 1 0 6m3-9a6 6 0 0 1 0 12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Diamond({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="m12 3 4 4-4 14L8 7l4-4Z"
        fill="currentColor"
        opacity="0.15"
      />
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
      <path
        d="M4 8l3.5 3L12 5l4.5 6L20 8l-1.5 9h-13L4 8Z"
        fill="currentColor"
        opacity="0.15"
      />
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
function Shield({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Bolt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
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
      <path d="m5 12 5 5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
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
      ring: selected ? "border-cnc-warning ring-2 ring-cnc-warning/40" : "border-cnc-warning/50",
      badge: "bg-cnc-warning text-white",
      btn: "bg-cnc-warning text-white hover:brightness-105",
      icon: "text-primary",
      Icon: Diamond,
    },
    highlight: {
      ring: selected ? "border-primary ring-2 ring-primary/40" : "border-primary/60 ring-1 ring-primary/20",
      badge: "bg-primary text-white",
      btn: "bg-primary text-white hover:bg-primary-strong",
      icon: "text-primary",
      Icon: Sparkles,
    },
    neutral: {
      ring: selected ? "border-primary ring-2 ring-primary/40" : "border-cnc-line",
      badge: "bg-cnc-bg text-cnc-text-strong",
      btn: "bg-cnc-text-strong text-white hover:bg-cnc-footer-b",
      icon: "text-cnc-success",
      Icon: Crown,
    },
    free: {
      ring: selected ? "border-primary ring-2 ring-primary/40" : "border-cnc-line",
      badge: "bg-cnc-bg text-cnc-text-strong",
      btn: "bg-cnc-text-strong text-white hover:bg-cnc-footer-b",
      icon: "text-cnc-muted",
      Icon: Sparkles,
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
          className={`absolute -top-2.5 left-5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${style.badge}`}
        >
          {card.badge}
        </span>
      ) : null}
      {selected ? (
        <span className="absolute right-4 top-4 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}

      <Icon className={`h-7 w-7 ${style.icon}`} />
      <h3 className="mt-3 text-lg font-extrabold text-cnc-text-strong">{card.name}</h3>

      <p className="mt-2 flex items-baseline gap-1">
        <strong className="text-2xl font-extrabold tracking-tight text-cnc-text-strong">
          {card.priceLabel}
        </strong>
        <span className="text-xs text-cnc-muted">{card.period}</span>
      </p>

      <p className="mt-2 text-[13px] leading-6 text-cnc-muted">{card.description}</p>

      <ul className="mt-3 flex-1 space-y-1.5 text-[13px] text-cnc-text-strong">
        {card.benefits.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cnc-success" />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {card.cautions?.length ? (
        <ul className="mt-3 space-y-1 text-[11px] text-cnc-muted">
          {card.cautions.map((c) => (
            <li key={c} className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-cnc-muted" />
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
    <div className="space-y-8">
      {/* Voltar */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-semibold text-cnc-muted transition hover:text-primary"
      >
        ← Voltar para descrição
      </button>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[linear-gradient(120deg,#0e62d8_0%,#0c4fb0_100%)] px-6 py-7 text-white sm:px-9 sm:py-9">
        <div className="relative z-10 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/80">Revisão</p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight sm:text-3xl">
            Seu anúncio está quase no ar
          </h1>
          <p className="mt-2 text-sm leading-7 text-white/90 sm:text-[15px]">
            Revise os dados e escolha como deseja publicar para ganhar mais visibilidade.
          </p>
        </div>
        <Megaphone className="pointer-events-none absolute -right-4 top-1/2 hidden h-44 w-44 -translate-y-1/2 text-white/25 sm:block" />
      </section>

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
      <section className="rounded-3xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative h-44 w-full shrink-0 overflow-hidden rounded-2xl bg-cnc-bg sm:h-28 sm:w-44">
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
            <h2 className="truncate text-lg font-extrabold text-cnc-text-strong">{title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              <span className="text-xl font-extrabold text-primary">{state.price || "—"}</span>
              <span className="text-cnc-muted">
                {state.mileage ? `${formatKm(state.mileage)} km` : "Km não informado"}
              </span>
              <span className={hasCity ? "text-cnc-text" : "font-semibold text-cnc-warning"}>
                {hasCity ? `${state.city}/${state.state}` : "Cidade não definida"}
              </span>
            </div>
          </div>

          <div className="shrink-0">
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
      <section className="rounded-3xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <QualityGauge score={quality.score} />
          <div className="flex-1">
            <h3 className="text-base font-extrabold text-cnc-text-strong">Qualidade do anúncio</h3>
            <p className="text-sm font-bold text-cnc-success">{quality.rating}</p>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {quality.checks.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      c.ok ? "bg-cnc-success text-white" : "border border-cnc-line text-transparent"
                    }`}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </span>
                  <span className={c.ok ? "text-cnc-text" : "text-cnc-muted"}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {quality.score >= 80 ? (
          <p className="mt-4 rounded-2xl border border-cnc-success/30 bg-cnc-success/5 px-4 py-3 text-sm font-medium text-cnc-success">
            Parabéns! Seu anúncio está completo e pronto para ter mais visibilidade.
          </p>
        ) : (
          <p className="mt-4 rounded-2xl border border-cnc-line bg-cnc-bg px-4 py-3 text-sm text-cnc-muted">
            Complete os itens pendentes acima para aumentar a visibilidade do anúncio.
          </p>
        )}
      </section>

      {/* Descrição + UF + Cidade */}
      <section className="space-y-5 rounded-3xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <label className="block">
          <span className={cardLabel}>Descrição do anúncio (opcional)</span>
          <textarea
            value={state.description}
            onChange={(e) => patch({ description: e.target.value.slice(0, DESCRIPTION_MAX) })}
            rows={5}
            maxLength={DESCRIPTION_MAX}
            placeholder="Destaque diferenciais, estado de conservação e histórico de revisões."
            className="w-full resize-y rounded-2xl border border-primary/30 bg-primary-soft/30 px-4 py-3 text-sm text-cnc-text outline-none transition focus:border-primary focus:bg-white focus:ring-1 focus:ring-primary/30"
          />
          <span className="mt-1 block text-right text-xs text-cnc-muted">
            {state.description.length}/{DESCRIPTION_MAX}
          </span>
        </label>

        <FinalizeLocationFields state={state} patch={patch} />
      </section>

      {/* Responsabilidade */}
      <section
        className={`rounded-3xl border bg-white p-5 shadow-card transition sm:p-6 ${
          termsError ? "border-cnc-danger ring-1 ring-cnc-danger/30" : "border-cnc-line"
        }`}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={state.acceptTerms}
            onChange={(e) => {
              patch({ acceptTerms: e.target.checked });
              if (e.target.checked) setTermsError(false);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-cnc-line-strong text-primary accent-primary"
          />
          <span className="text-sm leading-7 text-cnc-text">
            Confirmo que as informações são verdadeiras e autorizo a publicação conforme as regras do
            portal.
          </span>
        </label>
        {termsError ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-cnc-danger">
            Marque a confirmação acima para publicar.
          </p>
        ) : null}
      </section>

      {/* Bloco comercial */}
      <section aria-labelledby="review-monetization-title">
        <h2 id="review-monetization-title" className="text-xl font-extrabold text-cnc-text-strong sm:text-2xl">
          Aumente suas chances de vender
        </h2>
        <p className="mt-1 text-sm text-cnc-muted">
          Escolha a melhor opção para destacar seu anúncio e vender mais rápido.
        </p>

        <div
          role="radiogroup"
          aria-label="Opções de publicação"
          className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
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
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {subscribeMessage}
          </p>
        ) : null}
      </section>

      {/* Comparativo */}
      <section className="rounded-3xl border border-cnc-line bg-white p-5 shadow-card sm:p-6">
        <h2 className="text-lg font-extrabold text-cnc-text-strong">Compare as opções</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-40 py-2 pr-3 font-semibold text-cnc-muted" />
                {cards.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-extrabold text-cnc-text-strong">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-cnc-line/70">
                  <th className="py-2.5 pr-3 text-left font-semibold text-cnc-muted">{row.label}</th>
                  {cards.map((c) => {
                    const v = row.values[c.key];
                    const positive = v === "Sim";
                    const negative = v === "Não";
                    return (
                      <td key={c.key} className="px-3 py-2.5 align-top text-cnc-text">
                        {positive ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-cnc-success">
                            <Check className="h-4 w-4" /> Sim
                          </span>
                        ) : negative ? (
                          <span className="inline-flex items-center gap-1 text-cnc-muted">
                            <span aria-hidden>—</span> Não
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

      {/* Confiança */}
      <section className="grid gap-4 rounded-3xl border border-cnc-line bg-white p-5 shadow-card sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
        {TRUST_ITEMS.map((item) => {
          const Icon = TRUST_ICONS[item.icon];
          return (
            <div key={item.title} className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-cnc-text-strong">{item.title}</h3>
                <p className="text-xs leading-5 text-cnc-muted">{item.text}</p>
              </div>
            </div>
          );
        })}
      </section>

      {submitMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm leading-7 ${
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
        <div className="mx-auto flex max-w-[1180px] flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${
                selectedCard.requiresPayment ? "bg-cnc-warning/15 text-cnc-warning" : "bg-primary-soft text-primary"
              }`}
            >
              {selectedCard.requiresPayment ? <Diamond className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-cnc-text-strong">
                {selectedCard.requiresPayment
                  ? `${selectedCard.name} selecionado`
                  : "Publicação grátis selecionada"}
              </p>
              <p className="text-xs text-cnc-muted">
                {selectedCard.priceLabel}
                {selectedCard.requiresPayment ? ` · ${selectedCard.period}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {selectedCard.requiresPayment ? (
              <button
                type="button"
                onClick={handlePublishFreeShortcut}
                disabled={busy}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-cnc-line bg-white px-5 text-sm font-bold text-cnc-text-strong transition hover:bg-cnc-bg disabled:opacity-60"
              >
                Publicar grátis
              </button>
            ) : null}

            <button
              type="button"
              onClick={handlePrimaryCta}
              disabled={busy}
              data-testid="review-primary-cta"
              className="inline-flex min-w-[220px] flex-col items-center justify-center rounded-xl bg-primary px-6 py-2 text-sm font-bold text-white transition hover:bg-primary-strong disabled:opacity-60"
            >
              <span>
                {busy
                  ? "Processando…"
                  : selectedCard.requiresPayment
                    ? "Continuar para pagamento"
                    : "Publicar anúncio grátis"}
              </span>
              {selectedCard.requiresPayment && !busy ? (
                <span className="text-[11px] font-medium text-white/80">
                  Próximo passo: escolher forma de pagamento
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
  const color = clamped >= 80 ? "#0f9f6e" : clamped >= 60 ? "#0e62d8" : clamped >= 40 ? "#d18a12" : "#d14343";
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
