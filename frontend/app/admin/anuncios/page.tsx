"use client";

import { useState, useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { adminApi, type AdRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import {
  isHighlightActive,
  ADMIN_PRIORITY_COLUMN_LABEL,
  ADMIN_PRIORITY_COLUMN_HINT,
} from "@/lib/admin/ads-display";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "paused", label: "Pausado" },
  { value: "blocked", label: "Bloqueado" },
  { value: "archived", label: "Arquivado" },
  { value: "deleted", label: "Deletado" },
];

const LIMIT = 30;

export default function AdminAnuncios() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const { data, loading, error, reload } = useAdminFetch(
    () => adminApi.ads.list(buildParams()),
    [offset, activeFilters]
  );

  const ads = (data?.data ?? []) as AdRow[];
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

  // Soft-delete de limpeza: seta status='deleted' via o endpoint existente
  // (PATCH /ads/:id/status). O anúncio some de TODAS as superfícies públicas
  // (todas as queries públicas filtram status='active') e da lista admin padrão.
  // Reversível pelo suporte (a linha é preservada). `stopPropagation` evita
  // abrir o detalhe ao clicar no botão.
  const handleDelete = useCallback(
    async (ad: AdRow, event: MouseEvent) => {
      event.stopPropagation();
      const ok = window.confirm(
        `Deletar o anúncio #${ad.id} "${ad.title}"?\n\n` +
          `Ele sai de todas as superfícies públicas e da lista ativa do admin. ` +
          `É um soft-delete (reversível pelo suporte via filtro status="deleted").`
      );
      if (!ok) return;
      setDeletingId(ad.id);
      try {
        await adminApi.ads.changeStatus(ad.id, "deleted", "Limpeza de anúncio de teste (admin)");
        reload();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Falha ao deletar o anúncio.");
      } finally {
        setDeletingId(null);
      }
    },
    [reload]
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-cnc-text">Anúncios</h1>

      <AdminFiltersBar
        filters={[
          { key: "search", label: "Busca", type: "text", placeholder: "ID ou título…" },
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          { key: "city", label: "Cidade", type: "text", placeholder: "Nome da cidade…" },
          {
            key: "advertiser",
            label: "Anunciante",
            type: "text",
            placeholder: "Nome do anunciante…",
          },
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
      ) : ads.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhum anúncio encontrado" />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Título
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Cidade
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Anunciante
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Preço
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Plano
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Destaque
                  </th>
                  <th
                    className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider"
                    title={ADMIN_PRIORITY_COLUMN_HINT}
                  >
                    {ADMIN_PRIORITY_COLUMN_LABEL}
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
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
                    <td className="px-4 py-2.5 text-cnc-muted">{ad.advertiser_name || "—"}</td>
                    <td className="px-4 py-2.5 font-semibold text-cnc-text">
                      {Number(ad.price).toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={ad.status} />
                    </td>
                    <td className="px-4 py-2.5 capitalize text-cnc-muted">{ad.plan || "—"}</td>
                    <td className="px-4 py-2.5 text-center">
                      {isHighlightActive(ad.highlight_until) ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
                          title={
                            ad.highlight_until
                              ? `Destaque ativo até ${new Date(ad.highlight_until).toLocaleString("pt-BR")}`
                              : "Destaque ativo"
                          }
                        >
                          ★ Destaque
                        </span>
                      ) : (
                        <span className="text-cnc-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">
                      {ad.priority}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {new Date(ad.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      {ad.status === "deleted" ? (
                        <span className="text-cnc-muted">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => handleDelete(ad, e)}
                          disabled={deletingId === ad.id}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                          title="Soft-delete: some de todas as superfícies públicas"
                        >
                          {deletingId === ad.id ? "Deletando…" : "Deletar"}
                        </button>
                      )}
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
