"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  SUPPORT_STATUS_LABEL,
  type SupportSummary,
  type SupportTicketAdminRow,
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
  { value: "aberto", label: SUPPORT_STATUS_LABEL.aberto },
  { value: "em_andamento", label: SUPPORT_STATUS_LABEL.em_andamento },
  { value: "resolvido", label: SUPPORT_STATUS_LABEL.resolvido },
];

const ACCOUNT_LABEL: Record<string, string> = {
  CNPJ: "Lojista",
  CPF: "Particular",
  pending: "Incompleto",
};

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

export default function AdminChamados() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const list = useAdminFetch(() => adminApi.support.list(buildParams()), [offset, activeFilters]);
  const summary = useAdminFetch<{ ok: boolean; data: SupportSummary }>(
    () => adminApi.support.summary(),
    []
  );

  const rows = (list.data?.data ?? []) as SupportTicketAdminRow[];
  const total = list.data?.total ?? 0;
  const counts = summary.data?.data?.counts ?? { aberto: 0, em_andamento: 0, resolvido: 0 };

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
        <h1 className="text-lg font-bold text-cnc-text">Chamados</h1>
        <p className="mt-1 text-xs text-cnc-muted">
          Atendimento entre lojistas/particulares e a plataforma. Responda e mude o status; o
          usuário é avisado por e-mail.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <AdminKpiCard label="Abertos" value={counts.aberto} color="#2563eb" />
        <AdminKpiCard label="Em andamento" value={counts.em_andamento} color="#d97706" />
        <AdminKpiCard label="Resolvidos" value={counts.resolvido} color="#059669" />
      </div>

      <AdminFiltersBar
        filters={[
          { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
          {
            key: "q",
            label: "Busca",
            type: "text",
            placeholder: "Assunto, nome ou e-mail do autor",
          },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      {list.loading ? (
        <AdminLoadingState message="Carregando chamados…" />
      ) : list.error ? (
        <AdminErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhum chamado encontrado com os filtros atuais." />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <Th>ID</Th>
                  <Th>Status</Th>
                  <Th>Assunto</Th>
                  <Th>Autor</Th>
                  <Th>Categoria</Th>
                  <Th>Última atividade</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/admin/chamados/${r.id}`)}
                    className="border-t border-cnc-line/60 cursor-pointer hover:bg-primary-soft/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">
                      {r.status === "aberto" && (
                        <span
                          className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle"
                          title="Aguardando resposta"
                        />
                      )}
                      #{r.id}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2.5 max-w-[280px] truncate text-cnc-text font-medium">
                      {r.subject}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {r.user_name || r.user_email ? (
                        <div className="flex flex-col">
                          <span className="text-cnc-text">{r.user_name ?? "—"}</span>
                          <span className="text-[11px] text-cnc-muted-soft">
                            {ACCOUNT_LABEL[r.user_account_type] ?? r.user_account_type}
                            {r.user_email ? ` · ${r.user_email}` : ""}
                          </span>
                        </div>
                      ) : (
                        <span className="italic text-cnc-muted-soft">Conta removida</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{r.category ?? "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {fmtDate(r.last_message_at)}
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
