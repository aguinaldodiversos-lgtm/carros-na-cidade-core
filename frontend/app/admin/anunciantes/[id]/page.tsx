"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi, type AdvDetail, type AdRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; }
}

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type DialogState = { type: "none" } | { type: "status"; target: string };

export default function AdminAnuncianteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const adv = useAdminFetch<{ ok: boolean; data: AdvDetail }>(() => adminApi.advertisers.get(id), [id]);
  const ads = useAdminFetch<{ ok: boolean; data: AdRow[] }>(() => adminApi.advertisers.ads(id), [id]);

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });

  if (adv.loading) return <AdminLoadingState message="Carregando anunciante…" />;
  if (adv.error) return <AdminErrorState message={adv.error} onRetry={adv.reload} />;

  const d = adv.data?.data;
  if (!d) return <AdminEmptyState message="Anunciante não encontrado" />;

  const advAds = ads.data?.data ?? [];

  async function handleStatusChange(reason: string) {
    if (dialog.type !== "status") return;
    await adminApi.advertisers.changeStatus(d!.id, dialog.target, reason || undefined);
    setDialog({ type: "none" });
    adv.reload();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/admin/anunciantes")} className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors">
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-cnc-text">{d.name}</h1>
          <p className="text-xs text-cnc-muted">#{d.id} · {d.email}</p>
        </div>
        <AdminStatusBadge status={d.status} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main Info */}
        <div className="lg:col-span-2 rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-cnc-text">Dados do Anunciante</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <InfoRow label="Nome" value={d.name} />
            <InfoRow label="Email" value={d.email} />
            <InfoRow label="Telefone" value={d.phone || "—"} />
            <InfoRow label="Empresa" value={d.company_name || "—"} />
            <InfoRow label="Plano" value={d.plan || "—"} />
            <InfoRow label="Documento" value={d.document_type?.toUpperCase() || "—"} />
            <InfoRow label="Cadastro" value={fmtDate(d.created_at)} />
            <InfoRow label="Atualização" value={fmtDate(d.updated_at)} />
            {d.status_reason && <InfoRow label="Motivo do status" value={d.status_reason} />}
          </div>

          {/* User info */}
          {(d.user_name || d.user_email) && (
            <div className="border-t border-cnc-line pt-3">
              <h3 className="text-xs font-bold text-cnc-text mb-2">Usuário vinculado</h3>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                <InfoRow label="Nome" value={d.user_name || "—"} />
                <InfoRow label="Email" value={d.user_email || "—"} />
                <InfoRow label="Plano" value={d.user_plan || "—"} />
                <InfoRow label="Role" value={d.user_role || "—"} />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Actions */}
        <div className="space-y-4">
          <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-3">Ações</h2>
            <div className="flex flex-wrap gap-2">
              {d.status !== "active" && (
                <ActionBtn label="Reativar" color="bg-cnc-success text-white" onClick={() => setDialog({ type: "status", target: "active" })} />
              )}
              {d.status !== "suspended" && d.status !== "blocked" && (
                <ActionBtn label="Suspender" color="bg-cnc-warning text-white" onClick={() => setDialog({ type: "status", target: "suspended" })} />
              )}
              {d.status !== "blocked" && (
                <ActionBtn label="Bloquear" color="bg-cnc-danger text-white" onClick={() => setDialog({ type: "status", target: "blocked" })} />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text mb-2">Resumo</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatBox label="Ativos" value={d.active_ads_count ?? 0} />
              <StatBox label="Total" value={d.total_ads_count ?? 0} />
            </div>
          </div>
        </div>
      </div>

      {/* Linked Ads */}
      <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-cnc-text">Anúncios vinculados</h2>
        </div>
        {ads.loading ? (
          <AdminLoadingState />
        ) : advAds.length === 0 ? (
          <AdminEmptyState message="Nenhum anúncio vinculado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-t border-cnc-line">
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Título</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Cidade</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Preço</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {advAds.map((ad) => (
                  <tr
                    key={ad.id}
                    onClick={() => router.push(`/admin/anuncios/${ad.id}`)}
                    className="border-t border-cnc-line/60 cursor-pointer hover:bg-primary-soft/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{ad.id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[220px] truncate">{ad.title}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">{ad.city}/{ad.state}</td>
                    <td className="px-4 py-2.5 font-semibold text-cnc-text">{money(ad.price)}</td>
                    <td className="px-4 py-2.5"><AdminStatusBadge status={ad.status} /></td>
                    <td className="px-4 py-2.5 text-cnc-muted">{fmtDate(ad.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog */}
      <AdminActionDialog
        open={dialog.type === "status"}
        title={`Alterar status para "${dialog.type === "status" ? dialog.target : ""}"?`}
        description={`Anunciante #${d.id} — ${d.name}`}
        confirmLabel="Confirmar"
        confirmColor={dialog.type === "status" && dialog.target === "blocked" ? "danger" : "primary"}
        showReason
        onConfirm={handleStatusChange}
        onCancel={() => setDialog({ type: "none" })}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">{label}</span>
      <p className="text-cnc-text font-medium">{value}</p>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-cnc-bg p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">{label}</p>
      <p className="text-lg font-extrabold text-cnc-text">{value}</p>
    </div>
  );
}

function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${color}`}>
      {label}
    </button>
  );
}
