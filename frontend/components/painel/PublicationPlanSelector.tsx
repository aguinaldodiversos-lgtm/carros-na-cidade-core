"use client";

/**
 * Tela interna pós-revisão (Fase 4) — escolha como publicar.
 *
 * Renderiza as ações vindas de GET /api/ads/:id/publication-options.
 * Frontend NÃO calcula preço, NÃO chama Mercado Pago no render, NÃO
 * inicia checkout sem clique do usuário. Toda action que envolve MP
 * exige `ad_id` (boost) ou `plan_id` (subscribe) explícitos.
 *
 * Visual segue a imagem de referência `revisão_final_publicacao.png`:
 * mobile-first, cards arredondados, azul como cor principal, Destaque
 * 7 dias com CTA laranja forte.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  formatBrlFromCents,
  type PublicationAction,
  type PublicationActionBoost7d,
  type PublicationActionPublishFree,
  type PublicationActionPublishWithSubscription,
  type PublicationActionSubscribePlan,
  type PublicationActionUpgradeToPro,
  type PublicationOptionsPayload,
} from "@/lib/painel/publication-options-types";

type AdSummary = {
  id: string;
  title: string;
  price: number;
  image_url: string;
  city?: string | null;
  state?: string | null;
};

type PublicationPlanSelectorProps = {
  adId: string;
  /** Resumo do anúncio para o card de cabeçalho (preço, foto, cidade). */
  adSummary?: AdSummary | null;
};

type FetchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: PublicationOptionsPayload };

const PUBLICATION_OPTIONS_PATH = (id: string) =>
  `/api/ads/${encodeURIComponent(id)}/publication-options`;

const PRIMARY = "#0e62d8";
const PRIMARY_STRONG = "#0c4fb0";
const SURFACE_LINE = "#dde2ec";
const TEXT_STRONG = "#0f172a";
const MUTED = "#5d667d";

function formatBrlFromReais(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function fallbackImageUrl(): string {
  return "/images/vehicle-placeholder.svg";
}

function findAction<T extends PublicationAction["id"]>(
  actions: PublicationAction[],
  id: T
): Extract<PublicationAction, { id: T }> | undefined {
  return actions.find((a) => a.id === id) as
    | Extract<PublicationAction, { id: T }>
    | undefined;
}

export default function PublicationPlanSelector({
  adId,
  adSummary,
}: PublicationPlanSelectorProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [pendingAction, setPendingAction] = useState<PublicationAction["id"] | null>(
    null
  );
  const [actionError, setActionError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch(PUBLICATION_OPTIONS_PATH(adId), { credentials: "include" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
          if (res.status === 401) {
            const next = encodeURIComponent(window.location.pathname);
            window.location.assign(`/login?next=${next}`);
            return;
          }
          const message =
            (body as { error?: string }).error ||
            (body as { message?: string }).message ||
            "Nao foi possivel carregar as opcoes de publicacao.";
          if (!cancelled) setState({ status: "error", message });
          return;
        }
        if (!cancelled) {
          setState({
            status: "ready",
            payload: body as unknown as PublicationOptionsPayload,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Falha de rede ao carregar opcoes de publicacao.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [adId]);

  if (state.status === "loading") {
    return (
      <section
        data-testid="publication-plan-loading"
        className="mx-auto max-w-3xl px-4 py-10 text-center text-sm text-cnc-muted"
      >
        Carregando opções de publicação…
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        data-testid="publication-plan-error"
        className="mx-auto max-w-3xl px-4 py-10"
      >
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
          {state.message}
        </div>
        <div className="mt-4 text-center">
          <Link
            href="/dashboard/meus-anuncios"
            className="text-sm font-bold underline"
            style={{ color: PRIMARY }}
          >
            Voltar para meus anúncios
          </Link>
        </div>
      </section>
    );
  }

  const { payload } = state;
  const { actions, ad, ad_limit } = payload;

  if (!actions.length) {
    return (
      <section
        data-testid="publication-plan-empty"
        className="mx-auto max-w-3xl px-4 py-10"
      >
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Nenhuma ação disponível para este anúncio no momento.
        </div>
      </section>
    );
  }

  const publishFree = findAction(actions, "publish_free");
  const publishWithSub = findAction(actions, "publish_with_subscription");
  const boost = findAction(actions, "boost_7d");
  const subStart = findAction(actions, "subscribe_start");
  const subPro = findAction(actions, "subscribe_pro");
  const upgradePro = findAction(actions, "upgrade_to_pro");

  return (
    <section
      data-testid="publication-plan-selector"
      data-ad-id={adId}
      className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10"
    >
      <Header />

      <AdSummaryCard ad={ad} summary={adSummary} />

      <ReviewDoneCard />

      <RulesCard />

      <h2
        className="mt-8 mb-3 text-xl font-extrabold sm:text-2xl"
        style={{ color: TEXT_STRONG }}
      >
        Escolha como publicar
      </h2>

      {actionError ? (
        <div
          role="alert"
          className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {publishFree ? (
          <PublishFreeCard
            action={publishFree}
            adLimit={ad_limit}
            disabledByPending={pendingAction !== null}
            isPending={pendingAction === "publish_free"}
            onPublish={() => handlePublishFree(adId, setPendingAction, setActionError)}
          />
        ) : null}

        {publishWithSub ? (
          <PublishWithSubscriptionCard
            action={publishWithSub}
            adLimit={ad_limit}
            disabledByPending={pendingAction !== null}
            isPending={pendingAction === "publish_with_subscription"}
            onPublish={() =>
              handlePublishWithSubscription(adId, setPendingAction, setActionError)
            }
          />
        ) : null}

        {subStart ? (
          <SubscribeCard
            action={subStart}
            isPending={pendingAction === "subscribe_start"}
            disabledByPending={pendingAction !== null}
            label="Lojista Start"
            description="Plano mensal para CNPJ verificado: 20 anúncios/mês, prioridade no ranking."
            ctaLabel="Assinar Start"
            onSubscribe={() =>
              handleSubscribe(subStart.plan_id, setPendingAction, setActionError)
            }
          />
        ) : null}

        {subPro ? (
          <SubscribeCard
            action={subPro}
            isPending={pendingAction === "subscribe_pro"}
            disabledByPending={pendingAction !== null}
            label="Lojista Pro"
            description="Plano mensal para CNPJ verificado: anúncios ilimitados (limite operacional), maior visibilidade."
            ctaLabel="Assinar Pro"
            onSubscribe={() =>
              handleSubscribe(subPro.plan_id, setPendingAction, setActionError)
            }
          />
        ) : null}

        {upgradePro ? <UpgradeToProCard action={upgradePro} /> : null}

        {boost ? (
          <BoostCard
            action={boost}
            isPending={pendingAction === "boost_7d"}
            disabledByPending={pendingAction !== null}
            onBoost={() =>
              handleBoostCheckout(boost.ad_id || adId, setPendingAction, setActionError)
            }
          />
        ) : null}
      </div>

      <FlowFooter />
    </section>
  );
}

function Header() {
  return (
    <header className="mb-6">
      <h1
        className="text-2xl font-extrabold tracking-tight sm:text-3xl"
        style={{ color: TEXT_STRONG }}
      >
        Revisão final e publicação
      </h1>
      <p className="mt-2 text-sm leading-7 sm:text-base" style={{ color: MUTED }}>
        Seu anúncio foi revisado. Agora escolha como deseja publicar.
      </p>
    </header>
  );
}

function AdSummaryCard({
  ad,
  summary,
}: {
  ad: PublicationOptionsPayload["ad"];
  summary?: AdSummary | null;
}) {
  const image = summary?.image_url || fallbackImageUrl();
  const price = summary && Number.isFinite(summary.price) ? summary.price : null;
  const city = summary?.city || null;
  const stateUf = summary?.state || null;
  const location = [city, stateUf].filter(Boolean).join("/");

  return (
    <article
      className="overflow-hidden rounded-3xl border bg-white shadow-[0_3px_18px_rgba(10,20,40,0.06)]"
      style={{ borderColor: SURFACE_LINE }}
    >
      <div className="grid gap-4 p-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:p-5">
        <div
          className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#EDF2FB] sm:aspect-square sm:h-[120px] sm:w-[120px]"
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide"
            style={{ backgroundColor: "#E8F6EE", color: "#0f9f6e" }}
            data-testid="badge-pronto-publicar"
          >
            Pronto para publicar
          </span>
          <h2
            className="mt-2 line-clamp-2 text-lg font-extrabold sm:text-xl"
            style={{ color: TEXT_STRONG }}
          >
            {ad.title || summary?.title || "Anúncio"}
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {price !== null ? (
              <span
                className="text-xl font-extrabold sm:text-2xl"
                style={{ color: PRIMARY }}
              >
                {formatBrlFromReais(price)}
              </span>
            ) : null}
            {location ? (
              <span className="text-sm" style={{ color: MUTED }}>
                {location}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ReviewDoneCard() {
  const items = [
    "Dados do veículo",
    "Preço e versão",
    "Fotos",
    "Localização",
    "Contato",
    "Termos aceitos",
  ];
  return (
    <article
      className="mt-4 rounded-3xl border bg-white p-5 shadow-[0_3px_18px_rgba(10,20,40,0.04)]"
      style={{ borderColor: SURFACE_LINE }}
    >
      <h3
        className="text-base font-extrabold sm:text-lg"
        style={{ color: TEXT_STRONG }}
      >
        Revisão concluída
      </h3>
      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2" style={{ color: TEXT_STRONG }}>
        {items.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-extrabold text-white"
              style={{ backgroundColor: PRIMARY }}
            >
              ✓
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RulesCard() {
  const rules = [
    "O Destaque não libera vídeo 360.",
    "Não altera o limite de fotos.",
    "Não altera o limite de anúncios.",
    "Compras repetidas apenas prorrogam o tempo no topo.",
  ];
  return (
    <article
      className="mt-4 rounded-3xl border p-5"
      style={{ borderColor: "#FFE0B2", backgroundColor: "#FFF7EC" }}
    >
      <h3
        className="text-base font-extrabold sm:text-lg"
        style={{ color: "#B45309" }}
      >
        Regras importantes
      </h3>
      <ul
        className="mt-3 space-y-2 text-sm leading-6"
        style={{ color: "#7C4A03" }}
      >
        {rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2">
            <span aria-hidden>•</span>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PublishFreeCard({
  action,
  adLimit,
  disabledByPending,
  isPending,
  onPublish,
}: {
  action: PublicationActionPublishFree;
  adLimit: PublicationOptionsPayload["ad_limit"];
  disabledByPending: boolean;
  isPending: boolean;
  onPublish: () => void;
}) {
  const enabled = action.enabled && !disabledByPending;
  return (
    <article
      data-action="publish_free"
      data-enabled={action.enabled ? "true" : "false"}
      className="rounded-3xl border bg-white p-5 shadow-[0_3px_18px_rgba(10,20,40,0.04)]"
      style={{ borderColor: SURFACE_LINE }}
    >
      <h3
        className="text-lg font-extrabold sm:text-xl"
        style={{ color: TEXT_STRONG }}
      >
        Publicar grátis
      </h3>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        Mantém seu anúncio ativo no plano gratuito atual. Você pode comprar Destaque
        depois pelo painel.
      </p>
      {adLimit.total > 0 ? (
        <p className="mt-2 text-xs font-semibold" style={{ color: MUTED }}>
          {adLimit.used}/{adLimit.total} anúncios usados • {adLimit.available}{" "}
          disponível(is) no plano atual
        </p>
      ) : null}
      {!action.enabled && action.reason ? (
        <p className="mt-2 text-sm font-semibold text-red-700" data-testid="publish-free-reason">
          {action.reason}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="cta-publish-free"
        disabled={!enabled || isPending}
        onClick={onPublish}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: enabled ? PRIMARY : "#9CB1E0",
        }}
      >
        {isPending ? "Publicando…" : "Publicar grátis"}
      </button>
    </article>
  );
}

function PublishWithSubscriptionCard({
  action,
  adLimit,
  disabledByPending,
  isPending,
  onPublish,
}: {
  action: PublicationActionPublishWithSubscription;
  adLimit: PublicationOptionsPayload["ad_limit"];
  disabledByPending: boolean;
  isPending: boolean;
  onPublish: () => void;
}) {
  const enabled = action.enabled && !disabledByPending;
  const planLabel =
    action.plan_id === "cnpj-store-pro" ? "Lojista Pro" : "Lojista Start";
  return (
    <article
      data-action="publish_with_subscription"
      data-enabled={action.enabled ? "true" : "false"}
      className="rounded-3xl border bg-white p-5 shadow-[0_3px_18px_rgba(10,20,40,0.04)]"
      style={{ borderColor: SURFACE_LINE }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-lg font-extrabold sm:text-xl"
          style={{ color: TEXT_STRONG }}
        >
          Publicar com meu plano
        </h3>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: "#EAF2FF", color: PRIMARY_STRONG }}
        >
          {planLabel}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        Sua assinatura ativa cobre esta publicação. Sem cobrança individual.
      </p>
      {adLimit.total > 0 ? (
        <p className="mt-2 text-xs font-semibold" style={{ color: MUTED }}>
          {adLimit.used}/{adLimit.total} anúncios usados • {adLimit.available}{" "}
          disponível(is) no plano atual
        </p>
      ) : null}
      {!action.enabled && action.reason ? (
        <p
          className="mt-2 text-sm font-semibold text-red-700"
          data-testid="publish-with-sub-reason"
        >
          {action.reason}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="cta-publish-with-subscription"
        disabled={!enabled || isPending}
        onClick={onPublish}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: enabled ? PRIMARY : "#9CB1E0",
        }}
      >
        {isPending ? "Publicando…" : "Publicar com meu plano"}
      </button>
    </article>
  );
}

function SubscribeCard({
  action,
  label,
  description,
  ctaLabel,
  isPending,
  disabledByPending,
  onSubscribe,
}: {
  action: PublicationActionSubscribePlan;
  label: string;
  description: string;
  ctaLabel: string;
  isPending: boolean;
  disabledByPending: boolean;
  onSubscribe: () => void;
}) {
  const enabled = action.enabled && !disabledByPending;
  return (
    <article
      data-action={action.id}
      data-plan-id={action.plan_id}
      className="rounded-3xl border bg-white p-5 shadow-[0_3px_18px_rgba(10,20,40,0.04)]"
      style={{ borderColor: SURFACE_LINE }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className="text-lg font-extrabold sm:text-xl"
          style={{ color: TEXT_STRONG }}
        >
          {label}
        </h3>
        <span
          className="text-base font-extrabold sm:text-lg"
          style={{ color: PRIMARY }}
          data-testid={`price-${action.id}`}
        >
          {formatBrlFromCents(action.price_cents)} <span className="text-xs font-bold">/ mês</span>
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        {description}
      </p>
      <button
        type="button"
        data-testid={`cta-${action.id}`}
        disabled={!enabled || isPending}
        onClick={onSubscribe}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl border-2 bg-white px-4 text-base font-extrabold transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          color: PRIMARY,
          borderColor: PRIMARY,
        }}
      >
        {isPending ? "Abrindo Mercado Pago…" : ctaLabel}
      </button>
    </article>
  );
}

function UpgradeToProCard({ action }: { action: PublicationActionUpgradeToPro }) {
  return (
    <article
      data-action="upgrade_to_pro"
      data-enabled="false"
      className="rounded-3xl border p-5"
      style={{ borderColor: SURFACE_LINE, backgroundColor: "#F4F6FB" }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-base font-extrabold sm:text-lg"
          style={{ color: TEXT_STRONG }}
        >
          Upgrade para Pro
        </h3>
        <span
          className="rounded-full px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: "#E5E9F2", color: MUTED }}
        >
          Em validação
        </span>
      </div>
      <p className="mt-2 text-sm" style={{ color: MUTED }} data-testid="upgrade-reason">
        {action.reason ||
          "Upgrade direto ainda não disponível — cancele o Start e assine o Pro."}
      </p>
      <button
        type="button"
        disabled
        data-testid="cta-upgrade_to_pro"
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl border bg-white px-4 text-base font-extrabold opacity-60"
        style={{ color: MUTED, borderColor: SURFACE_LINE }}
      >
        Indisponível agora
      </button>
    </article>
  );
}

function BoostCard({
  action,
  isPending,
  disabledByPending,
  onBoost,
}: {
  action: PublicationActionBoost7d;
  isPending: boolean;
  disabledByPending: boolean;
  onBoost: () => void;
}) {
  const enabled = action.enabled && Boolean(action.ad_id) && !disabledByPending;
  return (
    <article
      data-action="boost_7d"
      data-enabled={action.enabled ? "true" : "false"}
      data-ad-id={action.ad_id}
      className="rounded-3xl border bg-white p-5 shadow-[0_3px_18px_rgba(10,20,40,0.04)]"
      style={{ borderColor: "#FFD7B5" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3
          className="text-lg font-extrabold sm:text-xl"
          style={{ color: TEXT_STRONG }}
        >
          Destaque 7 dias
        </h3>
        <span
          className="text-base font-extrabold sm:text-lg"
          data-testid="price-boost_7d"
          style={{ color: "#C2410C" }}
        >
          {formatBrlFromCents(action.price_cents)}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: MUTED }}>
        Topo das buscas locais por <strong>{action.days} dias</strong>. Pagamento único
        via Mercado Pago.
      </p>
      {action.already_active ? (
        <p
          className="mt-2 rounded-xl px-3 py-2 text-xs font-semibold"
          style={{ backgroundColor: "#FFEDD5", color: "#9A3412" }}
          data-testid="boost-already-active"
        >
          {action.note || "Comprar novamente prorroga o prazo (não troca)."}
        </p>
      ) : null}
      <button
        type="button"
        data-testid="cta-boost_7d"
        data-boost-cta="boost-7d"
        data-ad-id={action.ad_id}
        disabled={!enabled || isPending}
        onClick={onBoost}
        className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-2xl px-4 text-base font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: enabled
            ? "linear-gradient(120deg,#f59e0b 0%,#f97316 100%)"
            : "#FBC78A",
        }}
      >
        {isPending ? "Abrindo Mercado Pago…" : "Ir para pagamento"}
      </button>
    </article>
  );
}

function FlowFooter() {
  const steps = ["Revisão", "Plano", "Pagamento", "Publicação"];
  return (
    <footer
      className="mt-8 rounded-3xl border bg-white p-4"
      style={{ borderColor: SURFACE_LINE }}
      aria-label="Fluxo de publicação"
    >
      <ol className="flex items-center justify-between gap-2 text-xs font-bold sm:text-sm">
        {steps.map((step, idx) => (
          <li key={step} className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
              style={{
                backgroundColor: idx <= 1 ? PRIMARY : "#E5E9F2",
                color: idx <= 1 ? "white" : MUTED,
              }}
              aria-hidden
            >
              {idx + 1}
            </span>
            <span style={{ color: idx <= 1 ? TEXT_STRONG : MUTED }}>{step}</span>
            {idx < steps.length - 1 ? (
              <span aria-hidden style={{ color: MUTED }}>
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </footer>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Handlers — chamam endpoints seguros, NUNCA Mercado Pago no render.
// ──────────────────────────────────────────────────────────────────────

async function handlePublishFree(
  adId: string,
  setPending: (id: PublicationAction["id"] | null) => void,
  setError: (msg: string) => void
) {
  if (!adId) {
    setError("ID do anúncio ausente.");
    return;
  }
  setPending("publish_free");
  setError("");
  try {
    const res = await fetch(`/api/ads/${encodeURIComponent(adId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.assign(`/login?next=${next}`);
        return;
      }
      setError(body.error || "Falha ao ativar o anúncio.");
      setPending(null);
      return;
    }
    window.location.assign("/dashboard/meus-anuncios?published=1");
  } catch {
    setError("Falha de rede ao ativar o anúncio.");
    setPending(null);
  }
}

async function handlePublishWithSubscription(
  adId: string,
  setPending: (id: PublicationAction["id"] | null) => void,
  setError: (msg: string) => void
) {
  if (!adId) {
    setError("ID do anúncio ausente.");
    return;
  }
  setPending("publish_with_subscription");
  setError("");
  try {
    const res = await fetch(`/api/ads/${encodeURIComponent(adId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.assign(`/login?next=${next}`);
        return;
      }
      setError(body.error || "Falha ao publicar com a assinatura.");
      setPending(null);
      return;
    }
    window.location.assign("/dashboard-loja/meus-anuncios?published=1");
  } catch {
    setError("Falha de rede ao publicar com a assinatura.");
    setPending(null);
  }
}

async function handleBoostCheckout(
  adId: string,
  setPending: (id: PublicationAction["id"] | null) => void,
  setError: (msg: string) => void
) {
  if (!adId) {
    setError("ID do anúncio ausente — recarregue a página.");
    return;
  }
  setPending("boost_7d");
  setError("");
  try {
    const res = await fetch("/api/payments/boost-7d/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // SOMENTE ad_id — preço/dias/option_id ficam 100% no servidor.
      body: JSON.stringify({ ad_id: adId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      init_point?: string;
      error?: string;
    };
    if (!res.ok) {
      if (res.status === 401) {
        const next = encodeURIComponent(
          `${window.location.pathname}${window.location.search}`
        );
        window.location.assign(`/login?next=${next}`);
        return;
      }
      setError(body.error || "Não foi possível iniciar o destaque.");
      setPending(null);
      return;
    }
    if (body.init_point) {
      window.location.href = body.init_point;
      return;
    }
    setError("Resposta inesperada do checkout.");
    setPending(null);
  } catch {
    setError("Falha de rede ao iniciar o destaque.");
    setPending(null);
  }
}

async function handleSubscribe(
  planId: string,
  setPending: (id: PublicationAction["id"] | null) => void,
  setError: (msg: string) => void
) {
  if (!planId) {
    setError("plan_id ausente.");
    return;
  }
  const actionId =
    planId === "cnpj-store-pro" ? "subscribe_pro" : "subscribe_start";
  setPending(actionId);
  setError("");
  try {
    const res = await fetch("/api/payments/subscriptions/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_id: planId }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      init_point?: string;
      error?: string;
    };
    if (!res.ok) {
      if (res.status === 401) {
        const next = encodeURIComponent(window.location.pathname);
        window.location.assign(`/login?next=${next}`);
        return;
      }
      setError(body.error || "Não foi possível iniciar a assinatura.");
      setPending(null);
      return;
    }
    if (body.init_point) {
      window.location.href = body.init_point;
      return;
    }
    setError("Resposta inesperada do checkout.");
    setPending(null);
  } catch {
    setError("Falha de rede ao iniciar a assinatura.");
    setPending(null);
  }
}

