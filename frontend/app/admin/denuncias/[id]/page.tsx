"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminApi,
  type ReportDetail,
  type ReportStatus,
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString("pt-BR", {
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

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || Number.isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type ReportStatusTarget = Exclude<ReportStatus, "new">; // o admin só transiciona DE 'new', não PARA 'new'

type DialogState =
  | { type: "none" }
  | { type: "report_status"; target: ReportStatusTarget }
  | { type: "ad_status"; target: "paused" | "blocked" | "active" };

const REPORT_STATUS_DIALOG: Record<
  ReportStatusTarget,
  { title: string; confirmLabel: string; confirmColor: "primary" | "danger" | "warning"; requireReason: boolean }
> = {
  in_review: {
    title: "Marcar denúncia como 'Em análise'?",
    confirmLabel: "Marcar em análise",
    confirmColor: "primary",
    requireReason: false,
  },
  resolved: {
    title: "Resolver denúncia?",
    confirmLabel: "Resolver",
    confirmColor: "primary",
    requireReason: true,
  },
  dismissed: {
    title: "Rejeitar denúncia?",
    confirmLabel: "Rejeitar",
    confirmColor: "warning",
    requireReason: true,
  },
};

const AD_STATUS_DIALOG: Record<
  "paused" | "blocked" | "active",
  { title: string; confirmLabel: string; confirmColor: "primary" | "danger" | "warning"; requireReason: boolean }
> = {
  paused: {
    title: "Pausar anúncio relacionado?",
    confirmLabel: "Pausar anúncio",
    confirmColor: "warning",
    requireReason: true,
  },
  blocked: {
    title: "Bloquear anúncio relacionado?",
    confirmLabel: "Bloquear anúncio",
    confirmColor: "danger",
    requireReason: true,
  },
  active: {
    title: "Reativar anúncio?",
    confirmLabel: "Reativar",
    confirmColor: "primary",
    requireReason: false,
  },
};

export default function AdminDenunciaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const report = useAdminFetch<{ ok: boolean; data: ReportDetail }>(
    () => adminApi.reports.get(id),
    [id]
  );

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (report.loading) return <AdminLoadingState message="Carregando denúncia…" />;
  if (report.error) return <AdminErrorState message={report.error} onRetry={report.reload} />;

  const d = report.data?.data;
  if (!d) return <AdminEmptyState message="Denúncia não encontrada" />;

  const adRemoved = !d.ad_title; // LEFT JOIN devolve null se ad foi deletado/some
  const reasonLabel = REPORT_REASON_LABEL[d.reason] ?? d.reason;

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((c) => (c?.text === text ? null : c)), 4000);
  }

  async function handleReportStatus(target: ReportStatusTarget, reason: string) {
    await adminApi.reports.changeStatus(d!.id, target, reason || undefined);
    setDialog({ type: "none" });
    await report.reload();
    showFlash("success", `Denúncia marcada como "${REPORT_STATUS_LABEL[target]}".`);
  }

  async function handleAdStatus(target: "paused" | "blocked" | "active", reason: string) {
    if (!d!.ad_id) throw new Error("Anúncio não disponível.");
    await adminApi.ads.changeStatus(d!.ad_id, target, reason || undefined);
    setDialog({ type: "none" });
    await report.reload();
    showFlash("success", `Anúncio #${d!.ad_id} atualizado para "${target}".`);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/admin/denuncias")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-cnc-text">Denúncia #{d.id}</h1>
          <p className="text-xs text-cnc-muted">
            Recebida em {fmtDate(d.created_at)} · Última atualização {fmtDate(d.updated_at)}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna principal: denúncia + anúncio */}
        <div className="lg:col-span-2 space-y-4">
          {/* Detalhe da denúncia */}
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-cnc-text">Denúncia</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
              <Info label="Motivo" value={reasonLabel} />
              <Info label="Status" value={REPORT_STATUS_LABEL[d.status] ?? d.status} />
              <Info
                label="Denunciante"
                value={d.reporter_user_id ? `User #${d.reporter_user_id}` : "Anônimo"}
              />
              <Info label="Anúncio reportado" value={`#${d.ad_id}`} />
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
            {!d.description && (
              <p className="text-[11px] text-cnc-muted-soft italic">
                Denunciante não enviou descrição livre.
              </p>
            )}
          </section>

          {/* Anúncio relacionado */}
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-cnc-text">Anúncio relacionado</h2>
              {!adRemoved && (
                <Link
                  href={`/admin/anuncios/${d.ad_id}`}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Abrir detalhe →
                </Link>
              )}
            </div>
            {adRemoved ? (
              <p className="text-xs text-cnc-muted-soft italic">
                Anúncio #{d.ad_id} não está mais disponível (provavelmente removido). Ações sobre o
                anúncio ficam desabilitadas.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-cnc-text">{d.ad_title}</span>
                  <AdminStatusBadge status={d.ad_status ?? "—"} />
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <Info label="Marca/Modelo/Ano" value={`${d.ad_brand ?? "—"} ${d.ad_model ?? ""} ${d.ad_year ?? ""}`.trim()} />
                  <Info label="Preço" value={money(d.ad_price)} />
                  <Info
                    label="Cidade"
                    value={d.ad_city && d.ad_state ? `${d.ad_city}/${d.ad_state}` : "—"}
                  />
                  <Info label="Prioridade" value={String(d.ad_priority ?? "—")} />
                  <Info label="Destaque até" value={fmtDate(d.ad_highlight_until)} />
                  {d.ad_blocked_reason && (
                    <Info label="Motivo do bloqueio" value={d.ad_blocked_reason} />
                  )}
                </div>
                <div className="border-t border-cnc-line pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted mb-2">
                    Anunciante
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <Info label="Nome" value={d.advertiser_name ?? "—"} />
                    <Info label="Email" value={d.advertiser_email ?? "—"} />
                    <Info label="Status" value={d.advertiser_status ?? "—"} />
                    <Info label="ID" value={d.advertiser_id ? `#${d.advertiser_id}` : "—"} />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Histórico admin_actions */}
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
            <h2 className="text-sm font-bold text-cnc-text">Histórico administrativo</h2>
            {d.history.length === 0 ? (
              <p className="text-xs text-cnc-muted-soft italic">
                Nenhuma ação administrativa registrada para esta denúncia ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {d.history.map((h) => (
                  <li
                    key={h.id}
                    className="rounded-lg border border-cnc-line/60 bg-cnc-bg/30 px-3 py-2 text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-cnc-text">{h.action}</span>
                      <span className="text-cnc-muted-soft">{fmtDate(h.created_at)}</span>
                      <span className="text-cnc-muted">
                        por {h.admin_name ?? h.admin_email ?? `admin #${h.admin_user_id}`}
                      </span>
                    </div>
                    {h.reason && (
                      <p className="mt-1 text-cnc-text leading-relaxed">Motivo: {h.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Sidebar: ações */}
        <div className="space-y-4">
          {/* Ações na denúncia */}
          <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Ações na denúncia</h2>
            <div className="flex flex-wrap gap-2">
              {d.status !== "in_review" && d.status !== "resolved" && d.status !== "dismissed" && (
                <ActionBtn
                  label="Marcar em análise"
                  color="bg-cnc-warning text-white"
                  onClick={() => setDialog({ type: "report_status", target: "in_review" })}
                />
              )}
              {d.status !== "resolved" && (
                <ActionBtn
                  label="Resolver"
                  color="bg-cnc-success text-white"
                  onClick={() => setDialog({ type: "report_status", target: "resolved" })}
                />
              )}
              {d.status !== "dismissed" && (
                <ActionBtn
                  label="Rejeitar"
                  color="bg-cnc-muted text-white"
                  onClick={() => setDialog({ type: "report_status", target: "dismissed" })}
                />
              )}
            </div>
          </section>

          {/* Ações no anúncio relacionado */}
          {!adRemoved && (
            <section className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
              <h2 className="text-sm font-bold text-cnc-text mb-3">Ações no anúncio</h2>
              <p className="text-[11px] text-cnc-muted-soft mb-3">
                Reusa os endpoints de admin/anuncios. Todas as ações exigem motivo e ficam registradas
                em admin_actions (target_type=ad).
              </p>
              <div className="flex flex-wrap gap-2">
                {d.ad_status !== "paused" && d.ad_status !== "blocked" && (
                  <ActionBtn
                    label="Pausar anúncio"
                    color="bg-cnc-warning text-white"
                    onClick={() => setDialog({ type: "ad_status", target: "paused" })}
                  />
                )}
                {d.ad_status !== "blocked" && (
                  <ActionBtn
                    label="Bloquear anúncio"
                    color="bg-cnc-danger text-white"
                    onClick={() => setDialog({ type: "ad_status", target: "blocked" })}
                  />
                )}
                {d.ad_status === "blocked" && (
                  <ActionBtn
                    label="Reativar anúncio"
                    color="bg-cnc-success text-white"
                    onClick={() => setDialog({ type: "ad_status", target: "active" })}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {dialog.type === "report_status" &&
        (() => {
          const cfg = REPORT_STATUS_DIALOG[dialog.target];
          const target = dialog.target;
          return (
            <AdminActionDialog
              open
              title={cfg.title}
              description={`Denúncia #${d.id} — ${reasonLabel}`}
              confirmLabel={cfg.confirmLabel}
              confirmColor={cfg.confirmColor}
              showReason
              requireReason={cfg.requireReason}
              reasonPlaceholder={
                cfg.requireReason
                  ? "Motivo (será registrado em admin_actions)"
                  : "Observação (opcional)"
              }
              onConfirm={(reason) => handleReportStatus(target, reason)}
              onCancel={() => setDialog({ type: "none" })}
            />
          );
        })()}

      {dialog.type === "ad_status" &&
        (() => {
          const cfg = AD_STATUS_DIALOG[dialog.target];
          const target = dialog.target;
          return (
            <AdminActionDialog
              open
              title={cfg.title}
              description={`Anúncio #${d.ad_id} — ${d.ad_title ?? ""}`}
              confirmLabel={cfg.confirmLabel}
              confirmColor={cfg.confirmColor}
              showReason
              requireReason={cfg.requireReason}
              reasonPlaceholder={
                cfg.requireReason
                  ? "Motivo (registrado em admin_actions, target=ad)"
                  : "Observação (opcional)"
              }
              onConfirm={(reason) => handleAdStatus(target, reason)}
              onCancel={() => setDialog({ type: "none" })}
            />
          );
        })()}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">
        {label}
      </span>
      <p className="text-cnc-text font-medium">{value}</p>
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
