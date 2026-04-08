"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApi, type AdvRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "blocked", label: "Bloqueado" },
];

const LIMIT = 30;

export default function AdminAnunciantes() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const { data, loading, error, reload } = useAdminFetch(
    () => adminApi.advertisers.list(buildParams()),
    [offset, activeFilters]
  );

  const rows = (data?.data ?? []) as AdvRow[];
  const total = data?.total ?? 0;

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
      <h1 className="text-lg font-bold text-cnc-text">Anunciantes</h1>

      <AdminFiltersBar
        filters={[
          { key: "search", label: "Busca", type: "text", placeholder: "Nome, email ou documento…" },
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
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
          <AdminEmptyState message="Nenhum anunciante encontrado" />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Email</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Empresa</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Plano</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Anúncios</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((adv) => (
                  <tr
                    key={adv.id}
                    onClick={() => router.push(`/admin/anunciantes/${adv.id}`)}
                    className="border-t border-cnc-line/60 cursor-pointer hover:bg-primary-soft/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{adv.id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text">{adv.name}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">{adv.email}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">{adv.company_name || "—"}</td>
                    <td className="px-4 py-2.5 capitalize text-cnc-muted">{adv.plan || "—"}</td>
                    <td className="px-4 py-2.5 text-center font-semibold text-cnc-text">{adv.active_ads_count ?? adv.total_ads_count ?? "—"}</td>
                    <td className="px-4 py-2.5"><AdminStatusBadge status={adv.status} /></td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {new Date(adv.created_at).toLocaleDateString("pt-BR")}
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
