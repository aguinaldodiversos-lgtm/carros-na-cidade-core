"use client";

import { useState, useCallback } from "react";
import { adminApi, type PaymentRow, type PaymentSummary } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";

function money(n: number | string | undefined | null) {
  const v = typeof n === "string" ? parseFloat(n) : n;
  if (v == null || isNaN(v)) return "R$ 0,00";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | undefined | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; }
}

const STATUS_OPTIONS = [
  { value: "approved", label: "Aprovado" },
  { value: "pending", label: "Pendente" },
  { value: "rejected", label: "Rejeitado" },
  { value: "canceled", label: "Cancelado" },
  { value: "refunded", label: "Estornado" },
];

const CONTEXT_OPTIONS = [
  { value: "plan", label: "Plano" },
  { value: "boost", label: "Impulsionamento" },
];

const LIMIT = 30;

export default function AdminPagamentos() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const { data, loading, error, reload } = useAdminFetch(
    () => adminApi.payments.list(buildParams()),
    [offset, activeFilters]
  );

  const summary = useAdminFetch<{ ok: boolean; data: PaymentSummary }>(
    () => adminApi.payments.summary(30),
    []
  );

  const rows = (data?.data ?? []) as PaymentRow[];
  const total = data?.total ?? 0;
  const s = summary.data?.data;

  function handleSearch() {
    setOffset(0);
    setActiveFilters({ ...filters });
  }

  function handleClear() {
    setFilters({});
    setActiveFilters({});
    setOffset(0);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-cnc-text">Pagamentos</h1>

      {/* Summary KPIs */}
      {s && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AdminKpiCard label="Aprovados" value={String(s.approved_count)} subtitle={money(s.total_approved_amount)} color="#0f9f6e" />
          <AdminKpiCard label="Pendentes" value={String(s.pending_count)} subtitle={money(s.total_pending_amount)} color="#d18a12" />
          <AdminKpiCard label="Rejeitados" value={String(s.rejected_count)} color="#d14343" />
          <AdminKpiCard label="Cancelados" value={String(s.canceled_count)} color="#5d667d" />
        </div>
      )}

      <AdminFiltersBar
        filters={[
          { key: "search", label: "Busca", type: "text", placeholder: "ID, nome ou email…" },
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          { key: "context", label: "Contexto", type: "select", options: CONTEXT_OPTIONS },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      {loading ? (
        <AdminLoadingState />
      ) : error ? (
        <AdminErrorState message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhum pagamento encontrado" />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Usuário</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Contexto</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-cnc-line/60 hover:bg-cnc-bg/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{p.id}</td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-cnc-text">{p.user_name || p.user_email || "—"}</span>
                      {p.user_email && p.user_name && (
                        <span className="block text-[11px] text-cnc-muted-soft">{p.user_email}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-cnc-text">{money(p.amount)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${p.context === "plan" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                        {p.context === "plan" ? "Plano" : p.context === "boost" ? "Boost" : p.context}
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><AdminStatusBadge status={p.status} /></td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">{fmtDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </div>
      )}
    </div>
  );
}
