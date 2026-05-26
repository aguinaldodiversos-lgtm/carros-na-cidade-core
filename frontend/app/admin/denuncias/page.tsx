"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  type ReportRow,
  type ReportsSummary,
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";

const LIMIT = 30;

const STATUS_OPTIONS = [
  { value: "new", label: REPORT_STATUS_LABEL.new },
  { value: "in_review", label: REPORT_STATUS_LABEL.in_review },
  { value: "resolved", label: REPORT_STATUS_LABEL.resolved },
  { value: "dismissed", label: REPORT_STATUS_LABEL.dismissed },
];

const REASON_OPTIONS = Object.entries(REPORT_REASON_LABEL).map(([value, label]) => ({
  value,
  label,
}));

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

export default function AdminDenuncias() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const list = useAdminFetch(() => adminApi.reports.list(buildParams()), [offset, activeFilters]);
  const summary = useAdminFetch<{ ok: boolean; data: ReportsSummary }>(
    () => adminApi.reports.summary(),
    []
  );

  const rows = (list.data?.data ?? []) as ReportRow[];
  const total = list.data?.total ?? 0;
  const counts = summary.data?.data?.counts ?? { new: 0, in_review: 0, resolved: 0, dismissed: 0 };

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
      <header>
        <h1 className="text-lg font-bold text-cnc-text">Denúncias</h1>
        <p className="mt-1 text-xs text-cnc-muted">
          Fila de triagem de anúncios reportados por compradores. Cada denúncia pode levar a ações
          no anúncio relacionado.
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminKpiCard label="Abertas" value={counts.new} color="#dc2626" />
        <AdminKpiCard label="Em análise" value={counts.in_review} color="#d97706" />
        <AdminKpiCard label="Resolvidas" value={counts.resolved} color="#059669" />
        <AdminKpiCard label="Rejeitadas" value={counts.dismissed} color="#4b5563" />
      </div>

      <AdminFiltersBar
        filters={[
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          { key: "reason", label: "Motivo", type: "select", options: REASON_OPTIONS },
          { key: "q", label: "Busca", type: "text", placeholder: "Título, descrição ou anunciante" },
          { key: "ad_id", label: "ID do anúncio", type: "text", placeholder: "Ex.: 83" },
          { key: "from", label: "De (YYYY-MM-DD)", type: "text", placeholder: "2026-05-01" },
          { key: "to", label: "Até (YYYY-MM-DD)", type: "text", placeholder: "2026-05-31" },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      {list.loading ? (
        <AdminLoadingState message="Carregando denúncias…" />
      ) : list.error ? (
        <AdminErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhuma denúncia encontrada com os filtros atuais." />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <Th>ID</Th>
                  <Th>Status</Th>
                  <Th>Motivo</Th>
                  <Th>Anúncio</Th>
                  <Th>Cidade</Th>
                  <Th>Anunciante</Th>
                  <Th>Data</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/admin/denuncias/${r.id}`)}
                    className="border-t border-cnc-line/60 cursor-pointer hover:bg-primary-soft/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{r.id}</td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 text-cnc-text">
                      {REPORT_REASON_LABEL[r.reason] ?? r.reason}
                    </td>
                    <td className="px-4 py-2.5 max-w-[260px] truncate text-cnc-text">
                      {r.ad_title ? (
                        <>
                          <span className="font-medium">{r.ad_title}</span>
                          <span className="ml-1 text-cnc-muted-soft">#{r.ad_id}</span>
                        </>
                      ) : (
                        <span className="text-cnc-muted-soft italic">
                          Anúncio removido (#{r.ad_id})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {r.ad_city && r.ad_state ? `${r.ad_city}/${r.ad_state}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{r.advertiser_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {fmtDate(r.created_at)}
                    </td>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  );
}
