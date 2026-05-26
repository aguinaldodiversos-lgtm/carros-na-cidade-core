"use client";

import { useCallback, useState } from "react";
import {
  adminApi,
  type SeoOverview,
  type SeoPublicationRow,
  type SeoSitemapEntry,
  type SeoSitemapSummary,
  type SeoIssue,
} from "@/lib/admin/api";
import { useAdminFetch } from "@/lib/admin/useAdmin";
import { AdminKpiCard } from "@/components/admin/AdminKpiCard";
import { AdminFiltersBar } from "@/components/admin/AdminFiltersBar";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

type Tab = "overview" | "publications" | "sitemaps" | "issues";

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

export default function AdminSeoHub() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-lg font-bold text-cnc-text">SEO e Sitemaps</h1>
        <p className="mt-1 text-xs text-cnc-muted">
          Visibilidade e controle sobre <code>seo_publications</code>,{" "}
          <code>seo_cluster_plans</code> e sitemaps territoriais. Mudanças sensíveis registram em{" "}
          <code>admin_actions</code>.
        </p>
      </header>

      <nav className="flex items-center gap-1 border-b border-cnc-line">
        <TabBtn current={tab} value="overview" onClick={() => setTab("overview")}>
          Visão geral
        </TabBtn>
        <TabBtn current={tab} value="publications" onClick={() => setTab("publications")}>
          Publicações
        </TabBtn>
        <TabBtn current={tab} value="sitemaps" onClick={() => setTab("sitemaps")}>
          Sitemaps
        </TabBtn>
        <TabBtn current={tab} value="issues" onClick={() => setTab("issues")}>
          Problemas
        </TabBtn>
      </nav>

      {tab === "overview" && <OverviewTab />}
      {tab === "publications" && <PublicationsTab />}
      {tab === "sitemaps" && <SitemapsTab />}
      {tab === "issues" && <IssuesTab />}
    </div>
  );
}

function TabBtn({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-cnc-muted hover:text-cnc-text"
      }`}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Visão geral
// ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const overview = useAdminFetch<{ ok: boolean; data: SeoOverview }>(
    () => adminApi.seo.overview(),
    []
  );

  if (overview.loading) return <AdminLoadingState message="Carregando overview…" />;
  if (overview.error) return <AdminErrorState message={overview.error} onRetry={overview.reload} />;

  const d = overview.data?.data;
  if (!d) return <AdminEmptyState message="Sem dados de SEO." />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AdminKpiCard label="Publicações totais" value={d.publications.total} />
        <AdminKpiCard label="Indexáveis" value={d.publications.indexable} color="#059669" />
        <AdminKpiCard
          label="Com erro"
          value={d.publications.with_error}
          color={d.publications.with_error > 0 ? "#dc2626" : undefined}
        />
        <AdminKpiCard
          label="Sitemaps vazios"
          value={d.sitemaps.empty_buckets}
          color={d.sitemaps.empty_buckets > 0 ? "#d97706" : undefined}
        />
        <AdminKpiCard label="Cidades com anúncios" value={d.coverage.cities_with_active_ads} />
        <AdminKpiCard label="UFs ativas" value={d.coverage.active_states} />
        <AdminKpiCard label="Clusters elegíveis (sitemap)" value={d.clusters.sitemap_eligible} />
        <AdminKpiCard label="Publicações planejadas" value={d.publications.planned} />
      </div>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Última atualização">
          <Info label="Publicações" value={fmtDate(d.publications.last_update)} />
          <Info label="Cluster plans" value={fmtDate(d.clusters.last_update)} />
        </Card>
        <Card title="Cobertura territorial">
          <Info label="UFs com anúncios ativos" value={String(d.coverage.active_states)} />
          <Info label="Cidades com anúncios" value={String(d.coverage.cities_with_active_ads)} />
          <Info label="Sitemaps detectados" value={`${d.sitemaps.detected_buckets} / ${d.sitemaps.total_buckets}`} />
        </Card>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Publicações
// ─────────────────────────────────────────────────────────────
const LIMIT = 30;

function PublicationsTab() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<SeoPublicationRow | null>(null);
  const [flash, setFlash] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const buildParams = useCallback(
    () => ({ limit: LIMIT, offset, ...activeFilters }),
    [offset, activeFilters]
  );

  const list = useAdminFetch(() => adminApi.seo.publications(buildParams()), [offset, activeFilters]);

  const rows = (list.data?.data ?? []) as SeoPublicationRow[];
  const total = list.data?.total ?? 0;

  function handleSearch() {
    setOffset(0);
    setActiveFilters({ ...filters });
  }
  function handleClear() {
    setFilters({});
    setActiveFilters({});
    setOffset(0);
  }

  function showFlash(kind: "success" | "error", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash((c) => (c?.text === text ? null : c)), 4000);
  }

  async function handleToggleIndexable(row: SeoPublicationRow, reason: string) {
    try {
      await adminApi.seo.updatePublication(row.id, { is_indexable: !row.is_indexable }, reason);
      setSelected(null);
      await list.reload();
      showFlash(
        "success",
        `Publicação #${row.id} ${row.is_indexable ? "noindex" : "indexável"}.`
      );
    } catch (err) {
      showFlash("error", err instanceof Error ? err.message : "Falha ao atualizar.");
    }
  }

  return (
    <div className="space-y-4">
      <AdminFiltersBar
        filters={[
          {
            key: "status",
            label: "Status",
            type: "select",
            options: [
              { value: "published", label: "Published" },
              { value: "planned", label: "Planned" },
              { value: "draft", label: "Draft" },
              { value: "archived", label: "Archived" },
            ],
          },
          {
            key: "is_indexable",
            label: "Indexável",
            type: "select",
            options: [
              { value: "true", label: "Sim" },
              { value: "false", label: "Não" },
            ],
          },
          { key: "uf", label: "UF", type: "text", placeholder: "SP" },
          { key: "city", label: "Cidade (slug)", type: "text", placeholder: "sao-paulo-sp" },
          { key: "q", label: "Busca (path/title)", type: "text", placeholder: "Texto…" },
          {
            key: "has_error",
            label: "Com erro",
            type: "select",
            options: [{ value: "true", label: "Apenas com erro" }],
          },
        ]}
        values={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onClear={handleClear}
      />

      {flash && (
        <div
          role="status"
          className={`rounded-lg border px-3 py-2 text-xs font-medium ${
            flash.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
              : "border-cnc-danger/40 bg-cnc-danger/10 text-cnc-danger"
          }`}
        >
          {flash.text}
        </div>
      )}

      {list.loading ? (
        <AdminLoadingState message="Carregando publicações…" />
      ) : list.error ? (
        <AdminErrorState message={list.error} onRetry={list.reload} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card">
          <AdminEmptyState message="Nenhuma publicação encontrada com esses filtros." />
        </div>
      ) : (
        <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-cnc-bg/50 border-b border-cnc-line">
                  <Th>ID</Th>
                  <Th>Path</Th>
                  <Th>Tipo</Th>
                  <Th>Cidade/UF</Th>
                  <Th>Status</Th>
                  <Th>Indexável</Th>
                  <Th>Health</Th>
                  <Th>Conteúdo</Th>
                  <Th>Atualizado</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-cnc-line/60">
                    <td className="px-4 py-2.5 font-mono text-cnc-muted">#{r.id}</td>
                    <td className="px-4 py-2.5 font-mono text-cnc-text max-w-[280px] truncate">
                      <a
                        href={r.path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {r.path}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{r.publication_type ?? "—"}</td>
                    <td className="px-4 py-2.5 text-cnc-muted">
                      {r.city_name && r.city_state ? `${r.city_name}/${r.city_state}` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <AdminStatusBadge status={r.status ?? "—"} />
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          r.is_indexable
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {r.is_indexable ? "INDEX" : "NOINDEX"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted">{r.health_status ?? "—"}</td>
                    <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">
                      {r.content_length}
                    </td>
                    <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                      {fmtDate(r.updated_at)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {r.is_indexable ? "→ Noindex" : "→ Indexar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination total={total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </div>
      )}

      {selected && (
        <AdminActionDialog
          open
          title={selected.is_indexable ? "Marcar como noindex?" : "Marcar como indexável?"}
          description={`Publicação #${selected.id} — ${selected.path}`}
          confirmLabel={selected.is_indexable ? "Marcar noindex" : "Marcar indexável"}
          confirmColor={selected.is_indexable ? "warning" : "primary"}
          showReason
          requireReason
          reasonPlaceholder="Motivo (registrado em admin_actions)"
          onConfirm={(reason) => handleToggleIndexable(selected, reason)}
          onCancel={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sitemaps
// ─────────────────────────────────────────────────────────────
function SitemapsTab() {
  const sm = useAdminFetch<{
    ok: boolean;
    data: SeoSitemapEntry[];
    summary: SeoSitemapSummary;
  }>(() => adminApi.seo.sitemaps(), []);

  if (sm.loading) return <AdminLoadingState message="Carregando sitemaps…" />;
  if (sm.error) return <AdminErrorState message={sm.error} onRetry={sm.reload} />;

  const entries = sm.data?.data ?? [];
  const summary = sm.data?.summary ?? { total: 0, empty: 0, total_eligible_urls: 0 };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <AdminKpiCard label="Sitemaps" value={summary.total} />
        <AdminKpiCard
          label="Vazios"
          value={summary.empty}
          color={summary.empty > 0 ? "#dc2626" : "#059669"}
        />
        <AdminKpiCard label="URLs elegíveis" value={summary.total_eligible_urls} />
      </div>

      <div className="rounded-xl border border-cnc-line bg-white shadow-card overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-cnc-bg/50 border-b border-cnc-line">
              <Th>Nome</Th>
              <Th>URL</Th>
              <Th>Tipo</Th>
              <Th>URLs elegíveis</Th>
              <Th>Status</Th>
              <Th>Última atualização</Th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name} className="border-t border-cnc-line/60">
                <td className="px-4 py-2.5 font-medium text-cnc-text">{e.name}</td>
                <td className="px-4 py-2.5 font-mono text-cnc-muted">
                  <a
                    href={e.url.replace("[state]", "sp")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {e.url}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-cnc-muted">{e.type}</td>
                <td className="px-4 py-2.5 text-center font-mono text-cnc-muted">
                  {e.eligible_urls ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      e.empty
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {e.empty ? "VAZIO" : "OK"}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-cnc-muted whitespace-nowrap">
                  {fmtDate(e.last_update)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Problemas
// ─────────────────────────────────────────────────────────────
const SEVERITY_COLOR: Record<SeoIssue["severity"], string> = {
  critical: "bg-cnc-danger/10 border-cnc-danger/40 text-cnc-danger",
  high: "bg-amber-50 border-amber-300 text-amber-800",
  medium: "bg-cnc-bg border-cnc-line text-cnc-text",
  low: "bg-emerald-50 border-emerald-200 text-emerald-800",
};
const SEVERITY_LABEL: Record<SeoIssue["severity"], string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
};

function IssuesTab() {
  const data = useAdminFetch<{ ok: boolean; data: SeoIssue[] }>(() => adminApi.seo.issues(), []);

  if (data.loading) return <AdminLoadingState message="Carregando problemas…" />;
  if (data.error) return <AdminErrorState message={data.error} onRetry={data.reload} />;

  const issues = data.data?.data ?? [];
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-cnc-line bg-white shadow-card">
        <AdminEmptyState message="Nenhum problema detectado." />
      </div>
    );
  }

  // ordena: critical, high, medium, low
  const order: SeoIssue["severity"][] = ["critical", "high", "medium", "low"];
  const sorted = [...issues].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  );

  const counts = order.reduce<Record<string, number>>((acc, s) => {
    acc[s] = sorted.filter((i) => i.severity === s).length;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <AdminKpiCard label="Crítico" value={counts.critical} color="#dc2626" />
        <AdminKpiCard label="Alto" value={counts.high} color="#d97706" />
        <AdminKpiCard label="Médio" value={counts.medium} />
        <AdminKpiCard label="Baixo" value={counts.low} color="#059669" />
      </div>

      <ul className="space-y-2">
        {sorted.map((issue, idx) => (
          <li
            key={idx}
            className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_COLOR[issue.severity]}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-bold uppercase tracking-wider">
                {SEVERITY_LABEL[issue.severity]}
              </span>
              <span className="font-semibold">{issue.title}</span>
              {issue.path && (
                <a
                  href={issue.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono opacity-80 hover:underline"
                >
                  {issue.path}
                </a>
              )}
            </div>
            <p className="mt-1 opacity-80">{issue.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers visuais
// ─────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card space-y-3">
      <h2 className="text-sm font-bold text-cnc-text">{title}</h2>
      <div className="space-y-2 text-xs">{children}</div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-cnc-line/50 pb-1 last:border-0">
      <span className="text-cnc-muted">{label}</span>
      <span className="font-medium text-cnc-text">{value}</span>
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
