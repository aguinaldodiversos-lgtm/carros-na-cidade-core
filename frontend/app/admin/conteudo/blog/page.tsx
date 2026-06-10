"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  adminApi,
  BLOG_STATUS_LABEL,
  type BlogPostDto,
  type BlogPostStatus,
} from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";

/**
 * Conteúdo · Blog — listagem (Fase 4.2).
 *
 * Filtros: status + busca por título/slug. Ações rápidas por linha
 * (publicar/despublicar/arquivar/restaurar) com modal de reason
 * OBRIGATÓRIO — mesma UX das demais ações sensíveis do admin. Edição
 * completa em /admin/conteudo/blog/[id].
 */

const PAGE_SIZE = 20;

const STATUS_FILTERS: Array<{ value: "" | BlogPostStatus; label: string }> = [
  { value: "", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "published", label: "Publicado" },
  { value: "unpublished", label: "Despublicado" },
  { value: "archived", label: "Arquivado" },
];

const STATUS_BADGE: Record<BlogPostStatus, string> = {
  draft: "bg-cnc-line/40 text-cnc-muted",
  published: "bg-emerald-100 text-emerald-700",
  unpublished: "bg-amber-100 text-amber-800",
  archived: "bg-slate-200 text-slate-600",
};

const CATEGORY_LABEL: Record<string, string> = {
  compra: "Compra",
  venda: "Venda",
  manutencao: "Manutenção",
  mercado: "Mercado",
  financiamento: "Financiamento",
  cidades: "Cidades",
};

type QuickAction = {
  type: "publish" | "unpublish" | "archive" | "restore";
  post: BlogPostDto;
};

const QUICK_ACTION_META = {
  publish: {
    title: "Publicar post",
    confirmLabel: "Publicar",
    color: "primary" as const,
    description:
      "O post ficará visível em /blog imediatamente. A ação será registrada em admin_actions.",
  },
  unpublish: {
    title: "Despublicar post",
    confirmLabel: "Despublicar",
    color: "warning" as const,
    description:
      "O post sai do ar (público passa a receber 404). O conteúdo permanece salvo para republicação.",
  },
  archive: {
    title: "Arquivar post",
    confirmLabel: "Arquivar",
    color: "danger" as const,
    description: "O post sai do fluxo editorial e do ar. Para voltar, será preciso restaurá-lo.",
  },
  restore: {
    title: "Restaurar post",
    confirmLabel: "Restaurar para rascunho",
    color: "primary" as const,
    description: "O post arquivado volta como rascunho (não volta ao ar automaticamente).",
  },
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminBlogListPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPostDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"" | BlogPostStatus>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await adminApi.blog.list(params);
      setPosts(res.data || []);
      setTotal(res.total || 0);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar posts");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleQuickAction(reason: string) {
    if (!quickAction) return;
    const { type, post } = quickAction;
    const fn =
      type === "publish"
        ? adminApi.blog.publish
        : type === "unpublish"
          ? adminApi.blog.unpublish
          : type === "archive"
            ? adminApi.blog.archive
            : adminApi.blog.restore;
    await fn(post.id, reason);
    setQuickAction(null);
    setActionFeedback(
      `Post "${post.title}" — ${QUICK_ACTION_META[type].confirmLabel.toLowerCase()} concluído.`
    );
    await load();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading && posts.length === 0 && !loadError) {
    return <AdminLoadingState message="Carregando posts do blog…" />;
  }
  if (loadError && posts.length === 0) {
    return <AdminErrorState message={loadError} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Conteúdo · Blog</h1>
        <span className="rounded-full bg-cnc-line/40 px-2 py-0.5 text-[11px] font-semibold text-cnc-muted">
          {total} post{total === 1 ? "" : "s"}
        </span>
        <Link
          href="/admin/conteudo/blog/novo"
          className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong"
        >
          Novo post
        </Link>
      </div>

      {/* Filtros */}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSearch(searchInput.trim());
        }}
      >
        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(0);
            setStatusFilter(e.target.value as "" | BlogPostStatus);
          }}
          className="rounded-lg border border-cnc-line bg-white px-3 py-2 text-xs font-semibold text-cnc-text focus:border-primary focus:outline-none"
          aria-label="Filtrar por status"
        >
          {STATUS_FILTERS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar por título ou slug…"
          className="w-64 rounded-lg border border-cnc-line bg-white px-3 py-2 text-xs text-cnc-text focus:border-primary focus:outline-none"
          aria-label="Buscar por título ou slug"
        />
        <button
          type="submit"
          className="rounded-lg border border-cnc-line bg-white px-3 py-2 text-xs font-semibold text-cnc-text transition-colors hover:bg-cnc-bg"
        >
          Buscar
        </button>
        {(search || statusFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setStatusFilter("");
              setPage(0);
            }}
            className="text-xs font-semibold text-cnc-muted hover:text-cnc-text"
          >
            Limpar filtros
          </button>
        )}
      </form>

      {actionFeedback && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
        >
          {actionFeedback}
        </p>
      )}
      {loadError && (
        <p
          role="alert"
          className="rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
        >
          {loadError}
        </p>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-xl border border-cnc-line bg-white shadow-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-cnc-line text-[11px] uppercase tracking-wide text-cnc-muted">
              <th className="px-4 py-3 font-semibold">Título</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Categoria</th>
              <th className="px-4 py-3 font-semibold">Publicado em</th>
              <th className="px-4 py-3 font-semibold">Atualizado em</th>
              <th className="px-4 py-3 font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-cnc-muted">
                  Nenhum post encontrado{search || statusFilter ? " com esses filtros" : ""}.{" "}
                  <Link
                    href="/admin/conteudo/blog/novo"
                    className="font-semibold text-primary hover:underline"
                  >
                    Criar o primeiro post
                  </Link>
                </td>
              </tr>
            )}
            {posts.map((post) => (
              <tr
                key={post.id}
                className="border-b border-cnc-line/60 last:border-0 hover:bg-cnc-bg/40"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/conteudo/blog/${post.id}`}
                    className="font-semibold text-cnc-text hover:text-primary"
                  >
                    {post.title}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-cnc-muted-soft">/{post.slug}</p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[post.status]}`}
                  >
                    {BLOG_STATUS_LABEL[post.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-cnc-muted">
                  {post.category ? (CATEGORY_LABEL[post.category] ?? post.category) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-cnc-muted">
                  {formatDate(post.published_at)}
                </td>
                <td className="px-4 py-3 text-xs text-cnc-muted">{formatDate(post.updated_at)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => router.push(`/admin/conteudo/blog/${post.id}`)}
                      className="rounded-md border border-cnc-line bg-white px-2 py-1 text-[11px] font-semibold text-cnc-text hover:bg-cnc-bg"
                    >
                      Editar
                    </button>
                    {(post.status === "draft" || post.status === "unpublished") && (
                      <button
                        type="button"
                        onClick={() => setQuickAction({ type: "publish", post })}
                        className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Publicar
                      </button>
                    )}
                    {post.status === "published" && (
                      <button
                        type="button"
                        onClick={() => setQuickAction({ type: "unpublish", post })}
                        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                      >
                        Despublicar
                      </button>
                    )}
                    {post.status !== "archived" ? (
                      <button
                        type="button"
                        onClick={() => setQuickAction({ type: "archive", post })}
                        className="rounded-md border border-cnc-line bg-white px-2 py-1 text-[11px] font-semibold text-cnc-danger hover:bg-cnc-bg"
                      >
                        Arquivar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQuickAction({ type: "restore", post })}
                        className="rounded-md border border-cnc-line bg-white px-2 py-1 text-[11px] font-semibold text-cnc-text hover:bg-cnc-bg"
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-xs text-cnc-muted">
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-md border border-cnc-line bg-white px-3 py-1.5 font-semibold text-cnc-text disabled:opacity-50"
          >
            ← Anterior
          </button>
          <span>
            Página {page + 1} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-cnc-line bg-white px-3 py-1.5 font-semibold text-cnc-text disabled:opacity-50"
          >
            Próxima →
          </button>
        </div>
      )}

      <AdminActionDialog
        open={quickAction !== null}
        title={quickAction ? QUICK_ACTION_META[quickAction.type].title : ""}
        description={
          quickAction
            ? `"${quickAction.post.title}" — ${QUICK_ACTION_META[quickAction.type].description}`
            : undefined
        }
        confirmLabel={quickAction ? QUICK_ACTION_META[quickAction.type].confirmLabel : "Confirmar"}
        confirmColor={quickAction ? QUICK_ACTION_META[quickAction.type].color : "primary"}
        showReason
        requireReason
        reasonPlaceholder="Motivo (ex.: validação Fase 4.2, conteúdo desatualizado)"
        onConfirm={handleQuickAction}
        onCancel={() => setQuickAction(null)}
      />
    </div>
  );
}
