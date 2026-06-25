"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { adminApi, type AdvDetail, type AdRow, type PlanRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Espelha GRANT_REASON_TYPES/LABELS do backend (advertiser-plan-grant.constants.js).
const REASON_OPTIONS = [
  { value: "trial", label: "Teste grátis" },
  { value: "courtesy", label: "Cortesia comercial" },
  { value: "gift", label: "Brinde" },
  { value: "retention", label: "Retenção de cliente" },
  { value: "correction", label: "Correção administrativa" },
  { value: "negotiation", label: "Negociação manual" },
  { value: "other", label: "Outro" },
];

// Presets de duração (4 meses = 120 dias é o teto do backend).
const DURATION_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "1 mês" },
  { value: "60", label: "2 meses" },
  { value: "90", label: "3 meses" },
  { value: "120", label: "4 meses" },
  { value: "custom", label: "Personalizado" },
];

const inputCls =
  "w-full rounded-lg border border-cnc-line px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

type DialogState =
  | { type: "none" }
  | { type: "status"; target: string }
  | { type: "assignPlan" }
  | { type: "revokePlan" };

export default function AdminAnuncianteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const adv = useAdminFetch<{ ok: boolean; data: AdvDetail }>(
    () => adminApi.advertisers.get(id),
    [id]
  );
  const ads = useAdminFetch<{ ok: boolean; data: AdRow[] }>(
    () => adminApi.advertisers.ads(id),
    [id]
  );
  const plans = useAdminFetch<{ ok: boolean; data: PlanRow[] }>(
    () => adminApi.plans.list({ include_inactive: false }),
    []
  );

  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Estado do formulário de concessão de plano.
  const [grantPlanId, setGrantPlanId] = useState("");
  const [durationPreset, setDurationPreset] = useState("30");
  const [customDays, setCustomDays] = useState(30);
  const [reasonType, setReasonType] = useState("trial");

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((c) => (c?.text === text ? null : c)), 4000);
  }

  if (adv.loading) return <AdminLoadingState message="Carregando anunciante…" />;
  if (adv.error) return <AdminErrorState message={adv.error} onRetry={adv.reload} />;

  const d = adv.data?.data;
  if (!d) return <AdminEmptyState message="Anunciante não encontrado" />;

  const advAds = ads.data?.data ?? [];
  const accountType = (d.document_type || "").toUpperCase() === "CNPJ" ? "CNPJ" : "CPF";
  const availablePlans = (plans.data?.data ?? []).filter((p) => p.type === accountType);
  const resolvedDays = durationPreset === "custom" ? customDays : Number(durationPreset);

  async function handleStatusChange(reason: string) {
    if (dialog.type !== "status") return;
    await adminApi.advertisers.changeStatus(d!.id, dialog.target, reason || undefined);
    setDialog({ type: "none" });
    showFlash("success", `Status atualizado para "${dialog.target}".`);
    adv.reload();
  }

  async function handleAssignPlan(reasonNote: string) {
    if (!grantPlanId) throw new Error("Selecione um plano.");
    if (!Number.isInteger(resolvedDays) || resolvedDays < 1 || resolvedDays > 120) {
      throw new Error("Duração inválida (1 a 120 dias).");
    }
    const res = await adminApi.advertisers.grantPlan(d!.id, {
      plan_id: grantPlanId,
      duration_days: resolvedDays,
      reason_type: reasonType,
      reason_note: reasonNote,
    });
    setDialog({ type: "none" });
    showFlash(
      "success",
      `Plano ${res.data?.plan_name ?? ""} atribuído por ${resolvedDays} dias.`.replace("  ", " ")
    );
    adv.reload();
  }

  async function handleRevokePlan(reason: string) {
    await adminApi.advertisers.revokePlan(d!.id, reason);
    setDialog({ type: "none" });
    showFlash("success", "Plano concedido revogado.");
    adv.reload();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/anunciantes")}
          className="rounded-lg border border-cnc-line px-3 py-1.5 text-xs font-medium text-cnc-muted hover:bg-cnc-bg transition-colors"
        >
          ← Voltar
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-cnc-text">{d.name}</h1>
          <p className="text-xs text-cnc-muted">
            #{d.id} · {d.email}
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
        {/* Main Info */}
        <div className="lg:col-span-2 rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-4">
          <h2 className="text-sm font-bold text-cnc-text">Dados do Anunciante</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            <InfoRow label="Nome" value={d.name} />
            <InfoRow label="Email" value={d.email} />
            <InfoRow label="Telefone" value={d.phone || "—"} />
            <InfoRow label="Empresa" value={d.company_name || "—"} />
            <InfoRow label="Plano atual" value={d.effective_plan_name || d.plan || "—"} />
            <InfoRow label="Origem do plano" value={d.plan_origin_label || "—"} />
            <InfoRow label="Documento" value={d.document_type?.toUpperCase() || "—"} />
            <InfoRow label="Cadastro" value={fmtDate(d.created_at)} />
            <InfoRow label="Atualização" value={fmtDate(d.updated_at)} />
            {d.status_reason && <InfoRow label="Motivo do status" value={d.status_reason} />}
          </div>

          {/* Concessão manual ativa */}
          {d.plan_grant && (
            <div className="rounded-lg border border-primary-soft bg-primary-soft/40 p-3 text-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-primary-strong">
                  Plano concedido — {d.plan_grant.reason_label}
                </span>
                {typeof d.plan_grant.days_remaining === "number" && (
                  <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-primary-strong">
                    {d.plan_grant.days_remaining} dias restantes
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <InfoRow label="Início" value={fmtDate(d.plan_grant.starts_at)} />
                <InfoRow label="Expira em" value={fmtDate(d.plan_grant.expires_at)} />
                <InfoRow
                  label="Concedido por"
                  value={d.plan_grant.granted_by_name || d.plan_grant.granted_by_admin_id || "—"}
                />
                <InfoRow label="Motivo" value={d.plan_grant.reason_note || d.plan_grant.reason_label} />
              </div>
            </div>
          )}

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
                <ActionBtn
                  label="Reativar"
                  color="bg-cnc-success text-white"
                  onClick={() => setDialog({ type: "status", target: "active" })}
                />
              )}
              {d.status !== "suspended" && d.status !== "blocked" && (
                <ActionBtn
                  label="Suspender"
                  color="bg-cnc-warning text-white"
                  onClick={() => setDialog({ type: "status", target: "suspended" })}
                />
              )}
              {d.status !== "blocked" && (
                <ActionBtn
                  label="Bloquear"
                  color="bg-cnc-danger text-white"
                  onClick={() => setDialog({ type: "status", target: "blocked" })}
                />
              )}
              <ActionBtn
                label="Atribuir plano"
                color="bg-primary text-white"
                onClick={() => {
                  setGrantPlanId("");
                  setDurationPreset("30");
                  setCustomDays(30);
                  setReasonType("trial");
                  setDialog({ type: "assignPlan" });
                }}
              />
              {d.plan_grant && (
                <ActionBtn
                  label="Revogar plano"
                  color="border border-cnc-line bg-white text-cnc-muted hover:bg-cnc-bg"
                  onClick={() => setDialog({ type: "revokePlan" })}
                />
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
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    Título
                  </th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    Cidade
                  </th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    Preço
                  </th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2 font-semibold text-cnc-muted uppercase tracking-wider">
                    Data
                  </th>
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
                    <td className="px-4 py-2.5 font-medium text-cnc-text max-w-[220px] truncate">
                      {ad.title}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {ad.city}/{ad.state}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-cnc-text">{money(ad.price)}</td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={ad.status} />
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{fmtDate(ad.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog: status */}
      <AdminActionDialog
        open={dialog.type === "status"}
        title={`Alterar status para "${dialog.type === "status" ? dialog.target : ""}"?`}
        description={`Anunciante #${d.id} — ${d.name}`}
        confirmLabel="Confirmar"
        confirmColor={
          dialog.type === "status" && dialog.target === "blocked" ? "danger" : "primary"
        }
        showReason
        onConfirm={handleStatusChange}
        onCancel={() => setDialog({ type: "none" })}
      />

      {/* Dialog: atribuir plano */}
      {dialog.type === "assignPlan" && (
        <AdminActionDialog
          open
          title="Atribuir plano ao anunciante"
          description={`Anunciante #${d.id} — ${d.name}`}
          confirmLabel="Confirmar atribuição"
          confirmColor="primary"
          showReason
          requireReason
          reasonPlaceholder="Observação (obrigatória) — ex.: Teste gratuito de 3 meses para lojista parceiro da região de Atibaia."
          extra={
            <div className="space-y-3">
              <label className="block text-xs font-medium text-cnc-muted">
                <span className="mb-1 block">Plano</span>
                <select
                  value={grantPlanId}
                  onChange={(e) => setGrantPlanId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione um plano…</option>
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {Number(p.price) > 0 ? ` · ${money(p.price)}` : " · Grátis"}
                    </option>
                  ))}
                </select>
                {availablePlans.length === 0 && (
                  <span className="mt-1 block text-[11px] text-cnc-danger">
                    Nenhum plano ativo compatível com o documento ({accountType}).
                  </span>
                )}
              </label>

              <label className="block text-xs font-medium text-cnc-muted">
                <span className="mb-1 block">Duração</span>
                <select
                  value={durationPreset}
                  onChange={(e) => setDurationPreset(e.target.value)}
                  className={inputCls}
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              {durationPreset === "custom" && (
                <label className="block text-xs font-medium text-cnc-muted">
                  <span className="mb-1 block">Dias (1–120)</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={customDays}
                    onChange={(e) => setCustomDays(Number(e.target.value))}
                    className={inputCls}
                  />
                </label>
              )}

              <label className="block text-xs font-medium text-cnc-muted">
                <span className="mb-1 block">Motivo</span>
                <select
                  value={reasonType}
                  onChange={(e) => setReasonType(e.target.value)}
                  className={inputCls}
                >
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <p className="rounded-md border border-cnc-line bg-cnc-bg/60 px-3 py-2 text-[11px] text-cnc-muted">
                Esta ação não gera cobrança. O plano será ativado manualmente até a data de
                expiração informada.
              </p>
            </div>
          }
          onConfirm={handleAssignPlan}
          onCancel={() => setDialog({ type: "none" })}
        />
      )}

      {/* Dialog: revogar plano concedido */}
      {dialog.type === "revokePlan" && (
        <AdminActionDialog
          open
          title="Revogar plano concedido?"
          description={`Anunciante #${d.id} — ${d.name}. O plano voltará ao gratuito (ou ao pago vigente).`}
          confirmLabel="Revogar"
          confirmColor="danger"
          showReason
          requireReason
          reasonPlaceholder="Motivo da revogação (obrigatório)"
          onConfirm={handleRevokePlan}
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

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-cnc-bg p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cnc-muted">{label}</p>
      <p className="text-lg font-extrabold text-cnc-text">{value}</p>
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
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${color}`}
    >
      {label}
    </button>
  );
}
