"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi, type AdDetail, type AdMetrics, type AdEvent } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

type StatusTarget = "active" | "paused" | "blocked";

type DialogState =
  | { type: "none" }
  | { type: "status"; target: StatusTarget }
  | { type: "highlight" }
  | { type: "clearHighlight" }
  | { type: "priority" };

const SENSITIVE_STATUS: ReadonlyArray<StatusTarget> = ["blocked", "paused"];

const STATUS_DIALOG_CONFIG: Record<
  StatusTarget,
  { title: string; confirmLabel: string; confirmColor: "primary" | "danger" | "warning" }
> = {
  active: {
    title: "Ativar anúncio?",
    confirmLabel: "Ativar",
    confirmColor: "primary",
  },
  paused: {
    title: "Pausar anúncio?",
    confirmLabel: "Pausar",
    confirmColor: "warning",
  },
  blocked: {
    title: "Bloquear anúncio?",
    confirmLabel: "Bloquear",
    confirmColor: "danger",
  },
};

export default function AdminAnuncioDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const ad = useAdminFetch<{ ok: boolean; data: AdDetail }>(() => adminApi.ads.get(id), [id]);
  const metrics = useAdminFetch<{ ok: boolean; data: AdMetrics }>(
    () => adminApi.ads.metrics(id),
    [id]
  );
  const events = useAdminFetch<{ ok: boolean; data: AdEvent[] }>(
    () => adminApi.ads.events(id, 30),
    [id]
  );

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [highlightDays, setHighlightDays] = useState(7);
  const [priorityVal, setPriorityVal] = useState(0);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (ad.loading) return <AdminLoadingState message="Carregando anúncio…" />;
  if (ad.error) return <AdminErrorState message={ad.error} onRetry={ad.reload} />;

  const d = ad.data?.data;
  if (!d) return <AdminEmptyState message="Anúncio não encontrado" />;

  const m = metrics.data?.data;
  const evts = events.data?.data ?? [];

  const hasActiveHighlight =
    d.highlight_until != null && new Date(d.highlight_until).getTime() > Date.now();

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((current) => (current?.text === text ? null : current)), 4000);
  }

  async function refreshAll() {
    await Promise.all([ad.reload(), metrics.reload(), events.reload()]);
  }

  async function handleStatusChange(target: StatusTarget, reason: string) {
    await adminApi.ads.changeStatus(d!.id, target, reason || undefined);
    setDialog({ type: "none" });
    await refreshAll();
    showFlash("success", `Status atualizado para "${target}".`);
  }

  async function handleSetHighlight(reason: string) {
    if (!Number.isFinite(highlightDays) || highlightDays < 1 || highlightDays > 365) {
      throw new Error("Informe um período entre 1 e 365 dias.");
    }
    await adminApi.ads.setHighlight(d!.id, highlightDays, reason || undefined);
    setDialog({ type: "none" });
    await refreshAll();
    showFlash("success", `Destaque concedido por ${highlightDays} dia(s).`);
  }

  async function handleClearHighlight(reason: string) {
    await adminApi.ads.clearHighlight(d!.id, reason || undefined);
    setDialog({ type: "none" });
    await refreshAll();
    showFlash("success", "Destaque removido.");
  }

  async function handleSetPriority(reason: string) {
    if (!Number.isFinite(priorityVal) || priorityVal < 0 || priorityVal > 100) {
      throw new Error("Prioridade deve estar entre 0 e 100.");
    }
    await adminApi.ads.setPriority(d!.id, priorityVal, reason || undefined);
    setDialog({ type: "none" });
    await refreshAll();
    showFlash("success", `Prioridade ajustada para ${priorityVal}.`);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/anuncios")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-cnc-text">{d.title}</h1>
          <p className="text-xs text-cnc-muted">
            #{d.id} · {d.city}/{d.state} · {d.brand} {d.model} {d.year}
          </p>
        </div>
        <AdminStatusBadge status={d.status} />
      </div>

      {flash && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            flash.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-cnc-danger/40 bg-cnc-danger/10 text-cnc-danger"
          }`}
        >
          {flash.text}
        </div>
      )}

      {/* Info + Actions Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-cnc-text">Informações do Anúncio</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <InfoRow label="Preço" value={money(d.price)} />
            <InfoRow label="Plano" value={d.plan || "—"} />
            <InfoRow label="Prioridade" value={String(d.priority)} />
            <InfoRow
              label="Destaque até"
              value={d.highlight_until ? fmtDate(d.highlight_until) : "Sem destaque"}
            />
            <InfoRow label="Combustível" value={d.fuel_type || "—"} />
            <InfoRow label="Câmbio" value={d.transmission || "—"} />
            <InfoRow label="Carroceria" value={d.body_type || "—"} />
            <InfoRow
              label="Km"
              value={d.mileage ? d.mileage.toLocaleString("pt-BR") + " km" : "—"}
            />
            <InfoRow label="Slug" value={d.slug || "—"} />
            <InfoRow label="Criado" value={fmtDate(d.created_at)} />
            <InfoRow label="Atualizado" value={fmtDate(d.updated_at)} />
            {d.blocked_reason && <InfoRow label="Motivo bloqueio" value={d.blocked_reason} />}
          </div>

          {d.description && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted mb-1">
                Descrição
              </p>
              <p className="text-xs text-cnc-text leading-relaxed whitespace-pre-wrap">
                {d.description}
              </p>
            </div>
          )}

          {/* Advertiser Info */}
          <div className="border-t border-cnc-line pt-3">
            <h3 className="text-xs font-bold text-cnc-text mb-2">Anunciante</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
              <InfoRow label="Nome" value={d.advertiser_name} />
              <InfoRow label="Email" value={d.advertiser_email || "—"} />
              <InfoRow label="Status" value={d.advertiser_status || "—"} />
              <InfoRow label="ID" value={String(d.advertiser_id)} />
            </div>
          </div>
        </div>

        {/* Sidebar: Actions + Metrics */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Ações</h2>
            <div className="flex flex-wrap gap-2">
              {d.status !== "active" && (
                <ActionBtn
                  label="Ativar"
                  color="bg-cnc-success text-white"
                  onClick={() => setDialog({ type: "status", target: "active" })}
                />
              )}
              {d.status !== "paused" && d.status !== "blocked" && (
                <ActionBtn
                  label="Pausar"
                  color="bg-cnc-warning text-white"
                  onClick={() => setDialog({ type: "status", target: "paused" })}
                />
              )}
              {d.status !== "blocked" && (
                <ActionBtn
                  label="Bloquear"
                  color="bg-cnc-danger text-white"
                  onClick={() => setDialog({ type: "status", target: "blocked" })}
                />
              )}
              {d.status === "blocked" && (
                <ActionBtn
                  label="Desbloquear"
                  color="bg-cnc-success text-white"
                  onClick={() => setDialog({ type: "status", target: "active" })}
                />
              )}
              <ActionBtn
                label="Destacar"
                color="bg-purple-600 text-white"
                onClick={() => {
                  setHighlightDays(7);
                  setDialog({ type: "highlight" });
                }}
              />
              {hasActiveHighlight && (
                <ActionBtn
                  label="Remover destaque"
                  color="bg-cnc-muted text-white"
                  onClick={() => setDialog({ type: "clearHighlight" })}
                />
              )}
              <ActionBtn
                label="Prioridade"
                color="bg-indigo-600 text-white"
                onClick={() => {
                  setPriorityVal(d.priority);
                  setDialog({ type: "priority" });
                }}
              />
            </div>
          </div>

          {/* Metrics */}
          <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Métricas</h2>
            {metrics.loading ? (
              <p className="text-xs text-cnc-muted">Carregando…</p>
            ) : m ? (
              <div className="grid grid-cols-2 gap-3">
                <MetricBox label="Views" value={m.views} />
                <MetricBox label="Clicks" value={m.clicks} />
                <MetricBox label="Leads" value={m.leads} />
                <MetricBox label="CTR" value={`${(m.ctr * 100).toFixed(1)}%`} />
              </div>
            ) : (
              <p className="text-xs text-cnc-muted-soft">Sem métricas disponíveis</p>
            )}
          </div>

          {/* Events */}
          <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Eventos Recentes</h2>
            {evts.length === 0 ? (
              <p className="text-xs text-cnc-muted-soft">Nenhum evento registrado</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {evts.slice(0, 20).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="font-medium text-cnc-text">{e.event_type}</span>
                    <span className="text-cnc-muted-soft">{fmtDate(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {dialog.type === "status" &&
        (() => {
          const cfg = STATUS_DIALOG_CONFIG[dialog.target];
          const sensitive = SENSITIVE_STATUS.includes(dialog.target);
          const target = dialog.target;
          return (
            <AdminActionDialog
              open
              title={cfg.title}
              description={`Anúncio #${d.id} — ${d.title}`}
              confirmLabel={cfg.confirmLabel}
              confirmColor={cfg.confirmColor}
              showReason
              requireReason={sensitive}
              reasonPlaceholder={
                sensitive ? "Motivo (será registrado na auditoria)" : "Motivo (opcional)"
              }
              onConfirm={(reason) => handleStatusChange(target, reason)}
              onCancel={() => setDialog({ type: "none" })}
            />
          );
        })()}

      {dialog.type === "highlight" && (
        <AdminActionDialog
          open
          title="Destacar anúncio?"
          description={`Anúncio #${d.id} ficará em destaque pelo período abaixo.`}
          confirmLabel="Destacar"
          confirmColor="warning"
          showReason
          reasonPlaceholder="Motivo (opcional — ex.: cortesia, ajuste comercial)"
          extra={
            <label className="block text-xs font-medium text-cnc-muted">
              <span className="mb-1 block">Dias de destaque (1–365)</span>
              <input
                type="number"
                min={1}
                max={365}
                value={highlightDays}
                onChange={(e) => setHighlightDays(Number(e.target.value))}
                className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </label>
          }
          onConfirm={handleSetHighlight}
          onCancel={() => setDialog({ type: "none" })}
        />
      )}

      {dialog.type === "clearHighlight" && (
        <AdminActionDialog
          open
          title="Remover destaque?"
          description={`Anúncio #${d.id} perderá o destaque imediatamente.`}
          confirmLabel="Remover destaque"
          confirmColor="warning"
          showReason
          requireReason
          reasonPlaceholder="Motivo (será registrado na auditoria)"
          onConfirm={handleClearHighlight}
          onCancel={() => setDialog({ type: "none" })}
        />
      )}

      {dialog.type === "priority" && (
        <AdminActionDialog
          open
          title="Ajustar prioridade?"
          description={`Anúncio #${d.id} — prioridade atual: ${d.priority}.`}
          confirmLabel="Salvar"
          confirmColor="primary"
          showReason
          reasonPlaceholder="Motivo (opcional)"
          extra={
            <label className="block text-xs font-medium text-cnc-muted">
              <span className="mb-1 block">Prioridade (0–100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={priorityVal}
                onChange={(e) => setPriorityVal(Number(e.target.value))}
                className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </label>
          }
          onConfirm={handleSetPriority}
          onCancel={() => setDialog({ type: "none" })}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">
        {label}
      </span>
      <p className="text-cnc-text font-medium">{value}</p>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-cnc-bg p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">{label}</p>
      <p className="text-lg font-extrabold text-cnc-text">
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${color}`}
    >
      {label}
    </button>
  );
}
