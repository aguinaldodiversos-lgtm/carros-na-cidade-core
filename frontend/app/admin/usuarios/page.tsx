"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { adminApi, type AdminUserRow } from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminAccountTypeBadge, AdminRoleBadge } from "@/components/admin/AdminAccountBadges";

/**
 * Admin U1 — TODAS as contas do portal.
 *
 * Esta tela responde "quem tem conta?", e não "quem tem loja?". Quem só se
 * cadastrou, quem publicou procura em Compradores Ativos e quem nunca anunciou
 * aparecem aqui — e não aparecem em /admin/anunciantes, que parte de
 * `advertisers` e por isso só enxerga quem já publicou o primeiro anúncio.
 *
 * NÃO há ações nesta tela. Suspender loja, conceder plano e moderar anúncio
 * continuam em /admin/anunciantes/[advertiserId]; duplicá-las aqui criaria duas
 * implementações da mesma regra comercial.
 */

// Espelha ACCOUNT_TYPE de src/shared/middlewares/dealer.middleware.js, que o
// backend reexporta por shared/account/account-type.js. Os valores são o
// contrato da querystring `?account_type=`.
const ACCOUNT_TYPE_OPTIONS = [
  { value: "CPF", label: "Pessoa física" },
  { value: "CNPJ", label: "Lojista / CNPJ" },
  { value: "pending", label: "Pendente" },
];

const ROLE_OPTIONS = [
  { value: "user", label: "Usuário" },
  { value: "admin", label: "Admin" },
];

const LIMIT = 30;

function fmtDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("pt-BR");
}

export default function AdminUsuarios() {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const { data, loading, error, reload } = useAdminFetch(
    () => adminApi.users.list(buildParams()),
    [offset, activeFilters]
  );

  const rows = (data?.data ?? []) as AdminUserRow[];
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
      <div>
        <h1 className="text-lg font-bold text-cnc-text">Usuários</h1>
        <p className="mt-0.5 text-xs text-cnc-muted">
          Todas as contas cadastradas, inclusive quem ainda não publicou anúncio.
        </p>
      </div>

      <AdminFiltersBar
        filters={[
          {
            key: "search",
            label: "Busca",
            type: "text",
            placeholder: "Nome, e-mail ou ID",
          },
          { key: "account_type", label: "Tipo", type: "select", options: ACCOUNT_TYPE_OPTIONS },
          { key: "role", label: "Papel", type: "select", options: ROLE_OPTIONS },
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
          <AdminEmptyState message="Nenhum usuário encontrado" />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  {["ID", "Nome", "Email", "Tipo", "Papel", "Plano", "Cadastro"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 font-semibold text-cnc-muted uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => router.push(`/admin/usuarios/${user.id}`)}
                    className="border-t border-cnc-line/60 cursor-pointer hover:bg-primary-soft/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{user.id}</td>
                    <td className="px-4 py-2.5 font-medium text-cnc-text">
                      <span className="flex items-center gap-1.5">
                        {user.name || "—"}
                        {/* Só aparece quando o bloqueio está VIGENTE: o backend
                            devolve locked_until=null para trava já vencida. */}
                        {user.locked_until && (
                          <span
                            title={`Bloqueio de segurança até ${fmtDate(user.locked_until)}`}
                            className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                          >
                            Bloqueio temporário
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      <span className="flex items-center gap-1.5">
                        {user.email || "—"}
                        {!user.email_verified && (
                          <span
                            title="E-mail não verificado"
                            className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600"
                          >
                            não verificado
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminAccountTypeBadge accountType={user.account_type} />
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminRoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{user.plan?.name || "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {fmtDate(user.created_at)}
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
