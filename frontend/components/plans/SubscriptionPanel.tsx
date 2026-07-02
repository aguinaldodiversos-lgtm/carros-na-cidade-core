"use client";

/**
 * Bloco "Sua assinatura" na tela /dashboard-loja/plano (Fase A).
 *
 * READ + cancelamento:
 *   - Ao montar, busca GET /api/payments/subscriptions/me (estado real:
 *     plano, status, expires_at, cancel_at_period_end).
 *   - Se houver assinatura viva, mostra plano + status + "próxima cobrança /
 *     ativa até [data real]" e um botão discreto "Cancelar assinatura".
 *   - O clique NÃO cancela direto: abre uma confirmação com a POLÍTICA REAL
 *     (não renova, mas mantém o plano até [expires_at]; depois volta ao
 *     gratuito). Só o "Confirmar cancelamento" dispara o POST.
 *   - Após cancelar, reflete o novo estado ("Assinatura cancelada — ativa até
 *     [data]") usando o expires_at devolvido pelo cancel — sem refazer o GET.
 *   - Estados de erro (ex.: Mercado Pago fora do ar → 502) são mostrados inline.
 *
 * Sem assinatura ({status:'none'}) → o bloco não renderiza nada (o usuário do
 * plano gratuito continua vendo apenas a vitrine de planos abaixo).
 */

import { useCallback, useEffect, useState } from "react";

type SubscriptionState = {
  status: string;
  plan_id?: string;
  plan_name?: string | null;
  expires_at?: string | null;
  cancel_at_period_end?: boolean;
};

const PRIMARY = "#0e62d8";

/** Formata ISO → "1 de agosto de 2026". Retorna "" para datas ausentes/ inválidas. */
function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function isLiveStatus(status: string): boolean {
  return status === "active" || status === "pending" || status === "paused";
}

export default function SubscriptionPanel() {
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/subscriptions/me", { cache: "no-store" });
      if (res.status === 401) {
        // Não logado (sessão expirou): silencioso — a página já exige login no SSR.
        setSub({ status: "none" });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as SubscriptionState & { error?: string };
      if (!res.ok) {
        // Falha na leitura não deve travar a tela — só não mostra o bloco.
        setSub({ status: "none" });
        return;
      }
      setSub(body);
    } catch {
      setSub({ status: "none" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleConfirmCancel() {
    if (cancelling) return;
    setCancelling(true);
    setError("");
    try {
      const res = await fetch("/api/payments/subscriptions/cancel", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as SubscriptionState & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Não foi possível cancelar a assinatura. Tente novamente.");
        setCancelling(false);
        return;
      }
      // Reflete o novo estado com a data devolvida pelo cancel (sem refazer o GET).
      setSub((prev) => ({
        status: body.status ?? "cancelled",
        plan_id: prev?.plan_id,
        plan_name: prev?.plan_name,
        expires_at: body.expires_at ?? prev?.expires_at ?? null,
        cancel_at_period_end: true,
      }));
      setConfirming(false);
      setCancelling(false);
    } catch {
      setError("Falha de rede ao cancelar a assinatura. Tente novamente.");
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <section
        aria-label="Sua assinatura"
        className="h-24 animate-pulse rounded-2xl border border-[#e8ecf4] bg-white"
        data-testid="subscription-panel-loading"
      />
    );
  }

  // Sem assinatura relevante — não renderiza o bloco.
  if (!sub || sub.status === "none") return null;

  const planName = sub.plan_name || "Assinatura da loja";
  const dateLabel = formatDateLong(sub.expires_at);
  const cancelled = sub.cancel_at_period_end === true || !isLiveStatus(sub.status);

  return (
    <section
      aria-label="Sua assinatura"
      className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_3px_18px_rgba(11,22,44,0.06)]"
      data-testid="subscription-panel"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-[#94a3b8]">Sua assinatura</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-lg font-extrabold text-[#1d2538]">{planName}</span>
            {cancelled ? (
              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                Cancelada
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                Ativa
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[#5a647d]">
            {cancelled
              ? dateLabel
                ? `Assinatura cancelada — ativa até ${dateLabel}. Depois disso, sua loja volta ao plano gratuito.`
                : "Assinatura cancelada — não será renovada."
              : dateLabel
                ? `Próxima cobrança em ${dateLabel}.`
                : "Assinatura ativa."}
          </p>
        </div>

        {!cancelled ? (
          <button
            type="button"
            onClick={() => {
              setError("");
              setConfirming(true);
            }}
            data-testid="subscription-cancel-open"
            className="shrink-0 self-start rounded-lg border border-[#f0d3b0] bg-[#fff9f0] px-4 py-2 text-sm font-bold text-[#b45309] transition hover:bg-[#fdf1de]"
          >
            Cancelar assinatura
          </button>
        ) : null}
      </div>

      {error && !confirming ? (
        <p
          className="mt-3 rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Confirmação — o clique acima só ABRE isto; nada é cancelado sem o
          "Confirmar cancelamento". */}
      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cancelamento da assinatura"
          data-testid="subscription-cancel-modal"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-[0_20px_60px_rgba(11,22,44,0.25)]">
            <h3 className="text-lg font-extrabold text-[#1d2538]">Cancelar assinatura?</h3>
            <p className="mt-2 text-sm text-[#4f5972]">
              Ao cancelar, sua assinatura <strong>não será renovada</strong>, mas você mantém o{" "}
              <strong>{planName}</strong>
              {dateLabel ? (
                <>
                  {" "}
                  até <strong>{dateLabel}</strong>
                </>
              ) : (
                " até o fim do período já pago"
              )}
              . Depois disso, sua loja volta ao <strong>plano gratuito</strong>.
            </p>

            {error ? (
              <p
                className="mt-3 rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                data-testid="subscription-cancel-confirm"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-[#b91c1c] px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (cancelling) return;
                  setConfirming(false);
                  setError("");
                }}
                disabled={cancelling}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[#dfe4ef] bg-white px-4 text-sm font-bold text-[#37425d] transition hover:bg-[#f8fafc] disabled:opacity-60"
                style={{ color: PRIMARY }}
              >
                Manter assinatura
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
