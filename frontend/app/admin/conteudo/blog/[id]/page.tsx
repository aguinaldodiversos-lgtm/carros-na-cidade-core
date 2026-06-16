"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  adminApi,
  BLOG_STATUS_LABEL,
  type BlogCategoryId,
  type BlogPostDto,
  type BlogPostPatch,
} from "@/lib/admin/api";
import { AdminLoadingState } from "@/components/admin/AdminLoadingState";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { AdminActionDialog } from "@/components/admin/AdminActionDialog";
import { MarkdownContent } from "@/lib/blog/markdown";
import { MarkdownToolbar } from "@/components/admin/blog/MarkdownToolbar";
import { analyzeBlogContent } from "@/lib/blog/content-analysis";

/**
 * Conteúdo · Blog — editor de post (Fase 4.2).
 *
 * Modelo de estado (mesmo padrão do editor de banners da Home):
 *   - server: snapshot do backend (referência de "limpo")
 *   - draft: o que o admin está editando
 *   - dirty: derivado (draft != server)
 *
 * Fluxos:
 *   - Salvar: PATCH de campos. Rascunho salva direto (sem reason);
 *     post PUBLICADO exige reason (modal) porque muda o que está no ar.
 *   - Publicar / Despublicar / Arquivar / Restaurar: endpoints dedicados,
 *     reason SEMPRE obrigatório, auditoria em admin_actions.
 *   - Publicar fica bloqueado enquanto houver alterações não salvas ou
 *     pendências (checklist espelha as validações do backend).
 */

type Draft = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image_url: string | null;
  cover_image_alt: string;
  category: "" | BlogCategoryId;
  tagsText: string;
  meta_title: string;
  meta_description: string;
  canonical_url: string;
  og_image_url: string;
  is_indexable: boolean;
};

type DialogKind = "save" | "publish" | "unpublish" | "archive" | "restore";

const CATEGORIES: Array<{ value: "" | BlogCategoryId; label: string }> = [
  { value: "", label: "Sem categoria" },
  { value: "compra", label: "Compra" },
  { value: "venda", label: "Venda" },
  { value: "manutencao", label: "Manutenção" },
  { value: "mercado", label: "Mercado" },
  { value: "financiamento", label: "Financiamento" },
  { value: "cidades", label: "Cidades" },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-cnc-line/40 text-cnc-muted",
  published: "bg-emerald-100 text-emerald-700",
  unpublished: "bg-amber-100 text-amber-800",
  archived: "bg-slate-200 text-slate-600",
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Slug terminando em "-<uf>" colide com as URLs de hub por cidade
// (/blog/sao-paulo-sp). Aviso, não bloqueio — o admin decide.
const UF_SUFFIX_RE =
  /-(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)$/;

function asString(v: string | null | undefined): string {
  return typeof v === "string" ? v : "";
}

function toDraft(p: BlogPostDto): Draft {
  return {
    title: asString(p.title),
    slug: asString(p.slug),
    excerpt: asString(p.excerpt),
    content: asString(p.content),
    cover_image_url: p.cover_image_url ?? null,
    cover_image_alt: asString(p.cover_image_alt),
    category: (p.category ?? "") as "" | BlogCategoryId,
    tagsText: (p.tags || []).join(", "),
    meta_title: asString(p.meta_title),
    meta_description: asString(p.meta_description),
    canonical_url: asString(p.canonical_url),
    og_image_url: asString(p.og_image_url),
    is_indexable: p.is_indexable,
  };
}

function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const t = raw.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

function isDirty(server: BlogPostDto | null, draft: Draft | null): boolean {
  if (!server || !draft) return false;
  return (
    draft.title !== asString(server.title) ||
    draft.slug !== asString(server.slug) ||
    draft.excerpt !== asString(server.excerpt) ||
    draft.content !== asString(server.content) ||
    draft.cover_image_url !== (server.cover_image_url ?? null) ||
    draft.cover_image_alt !== asString(server.cover_image_alt) ||
    draft.category !== ((server.category ?? "") as string) ||
    JSON.stringify(parseTags(draft.tagsText)) !== JSON.stringify(server.tags || []) ||
    draft.meta_title !== asString(server.meta_title) ||
    draft.meta_description !== asString(server.meta_description) ||
    draft.canonical_url !== asString(server.canonical_url) ||
    draft.og_image_url !== asString(server.og_image_url) ||
    draft.is_indexable !== server.is_indexable
  );
}

function buildPatch(server: BlogPostDto, draft: Draft): BlogPostPatch {
  const patch: BlogPostPatch = {};
  if (draft.title !== asString(server.title)) patch.title = draft.title.trim();
  if (draft.slug !== asString(server.slug)) patch.slug = draft.slug.trim();
  if (draft.excerpt !== asString(server.excerpt)) patch.excerpt = draft.excerpt.trim() || null;
  if (draft.content !== asString(server.content)) patch.content = draft.content || null;
  if (draft.cover_image_url !== (server.cover_image_url ?? null))
    patch.cover_image_url = draft.cover_image_url;
  if (draft.cover_image_alt !== asString(server.cover_image_alt))
    patch.cover_image_alt = draft.cover_image_alt.trim() || null;
  if (draft.category !== ((server.category ?? "") as string))
    patch.category = draft.category || null;
  if (JSON.stringify(parseTags(draft.tagsText)) !== JSON.stringify(server.tags || []))
    patch.tags = parseTags(draft.tagsText);
  if (draft.meta_title !== asString(server.meta_title))
    patch.meta_title = draft.meta_title.trim() || null;
  if (draft.meta_description !== asString(server.meta_description))
    patch.meta_description = draft.meta_description.trim() || null;
  if (draft.canonical_url !== asString(server.canonical_url))
    patch.canonical_url = draft.canonical_url.trim() || null;
  if (draft.og_image_url !== asString(server.og_image_url))
    patch.og_image_url = draft.og_image_url.trim() || null;
  if (draft.is_indexable !== server.is_indexable) patch.is_indexable = draft.is_indexable;
  return patch;
}

/** Pendências para publicar — espelha assertPublishable do backend. */
function publishProblems(draft: Draft): string[] {
  const problems: string[] = [];
  if (draft.title.trim().length < 5) problems.push("Título com pelo menos 5 caracteres");
  if (!SLUG_RE.test(draft.slug.trim())) {
    problems.push("Slug válido (minúsculas, números e hífens)");
  }
  const excerpt = draft.excerpt.trim();
  if (!excerpt) problems.push("Resumo (excerpt) preenchido");
  else if (excerpt.length > 240) problems.push("Resumo com no máximo 240 caracteres");
  if (draft.content.trim().length < 300) {
    problems.push(`Conteúdo com pelo menos 300 caracteres (atual: ${draft.content.trim().length})`);
  }
  if (draft.cover_image_url && !draft.cover_image_alt.trim()) {
    problems.push("Texto alternativo (alt) da imagem de capa");
  }
  return problems;
}

/** Avisos de SEO — não bloqueiam publicação (Fase 4.2 §8). */
function seoWarnings(draft: Draft): string[] {
  const warnings: string[] = [];
  const metaTitle = draft.meta_title.trim() || draft.title.trim();
  if (metaTitle.length > 60)
    warnings.push(`Meta title com ${metaTitle.length} caracteres (ideal ≤ 60)`);
  const metaDesc = draft.meta_description.trim() || draft.excerpt.trim();
  if (!metaDesc) warnings.push("Sem meta description (fallback vazio — preencha o resumo)");
  else if (metaDesc.length > 160) {
    warnings.push(`Meta description com ${metaDesc.length} caracteres (ideal ≤ 160)`);
  }
  if (!draft.cover_image_url)
    warnings.push("Sem imagem de capa (usa fallback no card e no Open Graph)");
  if (UF_SUFFIX_RE.test(draft.slug.trim())) {
    warnings.push(
      "Slug termina com sigla de estado (ex.: -sp) — pode colidir com a URL do hub da cidade /blog/<cidade-uf>"
    );
  }
  return warnings;
}

const DIALOG_META: Record<
  DialogKind,
  { title: string; confirm: string; color: "primary" | "danger" | "warning"; description: string }
> = {
  save: {
    title: "Salvar alterações em post publicado",
    confirm: "Salvar e atualizar no ar",
    color: "primary",
    description:
      "Este post está PUBLICADO — as alterações vão ao ar imediatamente. Motivo obrigatório (auditoria).",
  },
  publish: {
    title: "Publicar post",
    confirm: "Publicar",
    color: "primary",
    description: "O post ficará visível em /blog imediatamente e será registrado em admin_actions.",
  },
  unpublish: {
    title: "Despublicar post",
    confirm: "Despublicar",
    color: "warning",
    description:
      "O post sai do ar (público recebe 404). O conteúdo permanece salvo para republicação.",
  },
  archive: {
    title: "Arquivar post",
    confirm: "Arquivar",
    color: "danger",
    description: "O post sai do fluxo editorial e do ar. Para voltar, use Restaurar.",
  },
  restore: {
    title: "Restaurar post",
    confirm: "Restaurar para rascunho",
    color: "primary",
    description: "O post arquivado volta como rascunho (não volta ao ar automaticamente).",
  },
};

export default function AdminBlogEditPage({ params }: { params: { id: string } }) {
  const postId = params.id;

  const [server, setServer] = useState<BlogPostDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [tab, setTab] = useState<"editar" | "preview">("editar");

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await adminApi.blog.get(postId);
      setServer(res.data);
      setDraft(toDraft(res.data));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Erro ao carregar post");
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => isDirty(server, draft), [server, draft]);
  const problems = useMemo(() => (draft ? publishProblems(draft) : []), [draft]);
  const warnings = useMemo(() => (draft ? seoWarnings(draft) : []), [draft]);
  const contentStats = useMemo(() => analyzeBlogContent(draft?.content || ""), [draft?.content]);

  function patchDraft(partial: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...partial } : prev));
    if (saveStatus !== "idle") setSaveStatus("idle");
    if (saveError) setSaveError(null);
  }

  function applyServer(updated: BlogPostDto) {
    setServer(updated);
    setDraft(toDraft(updated));
  }

  async function doSave(reason?: string) {
    if (!server || !draft) return;
    const patch = buildPatch(server, draft);
    if (Object.keys(patch).length === 0) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await adminApi.blog.update(server.id, patch, reason);
      applyServer(res.data);
      setSaveStatus("saved");
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar");
      throw err;
    }
  }

  async function handleSaveClick() {
    if (!server) return;
    if (server.status === "published") {
      setDialog("save");
      return;
    }
    try {
      await doSave();
    } catch {
      // erro já refletido em saveError
    }
  }

  async function handleDialogConfirm(reason: string) {
    if (!server) return;
    if (dialog === "save") {
      await doSave(reason);
      setDialog(null);
      return;
    }
    const fn =
      dialog === "publish"
        ? adminApi.blog.publish
        : dialog === "unpublish"
          ? adminApi.blog.unpublish
          : dialog === "archive"
            ? adminApi.blog.archive
            : adminApi.blog.restore;
    const res = await fn(server.id, reason);
    applyServer(res.data);
    setDialog(null);
    setSaveStatus("idle");
  }

  async function handleCoverUpload(file: File) {
    if (!server) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const res = await adminApi.blog.uploadCover(server.id, file);
      patchDraft({ cover_image_url: res.data.url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha no upload");
    } finally {
      setUploadBusy(false);
    }
  }

  /** Upload de imagem no meio do conteúdo — devolve a URL pública (R2). */
  async function handleContentImageUpload(file: File): Promise<string> {
    if (!server) throw new Error("Salve o post antes de enviar imagens.");
    const res = await adminApi.blog.uploadContentImage(server.id, file);
    return res.data.url;
  }

  if (loading) return <AdminLoadingState message="Carregando post…" />;
  if (loadError || !server || !draft) {
    return (
      <AdminErrorState message={loadError || "Post não encontrado."} onRetry={() => void load()} />
    );
  }

  const publicUrl = `/blog/${server.slug}`;
  const excerptLen = draft.excerpt.trim().length;
  const metaTitleLen = (draft.meta_title.trim() || draft.title.trim()).length;
  const metaDescLen = (draft.meta_description.trim() || draft.excerpt.trim()).length;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Conteúdo · Blog — Editar post</h1>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[server.status]}`}
        >
          {BLOG_STATUS_LABEL[server.status]}
        </span>
        <span className="text-[11px] text-cnc-muted-soft">
          v{server.version} · atualizado em {new Date(server.updated_at).toLocaleString("pt-BR")}
          {server.published_at &&
            ` · publicado em ${new Date(server.published_at).toLocaleString("pt-BR")}`}
        </span>
        <Link
          href="/admin/conteudo/blog"
          className="ml-auto text-xs font-semibold text-cnc-muted hover:text-cnc-text"
        >
          ← Voltar para a lista
        </Link>
      </div>

      {server.status === "published" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
          Post no ar:{" "}
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-bold underline">
            {publicUrl}
          </a>{" "}
          — alterações salvas aqui vão ao ar imediatamente (com motivo).
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Coluna principal */}
        <div className="space-y-4">
          {/* Tabs editar/preview */}
          <div className="flex gap-2" role="tablist" aria-label="Modo de edição">
            {(["editar", "preview"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  tab === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-cnc-line bg-white text-cnc-text hover:bg-cnc-bg"
                }`}
              >
                {t === "editar" ? "Editar" : "Pré-visualizar"}
              </button>
            ))}
          </div>

          {tab === "editar" ? (
            <div className="space-y-4 rounded-xl border border-cnc-line bg-white p-5 shadow-card">
              <Field id="title" label="Título" hint="Mínimo 5 caracteres. Vira o H1 do post.">
                <input
                  id="title"
                  type="text"
                  maxLength={180}
                  value={draft.title}
                  onChange={(e) => patchDraft({ title: e.target.value })}
                  className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                />
              </Field>

              <Field
                id="slug"
                label="Slug"
                hint={`URL pública: /blog/${draft.slug || "<slug>"} — minúsculas, números e hífens.`}
              >
                <input
                  id="slug"
                  type="text"
                  maxLength={180}
                  value={draft.slug}
                  onChange={(e) => patchDraft({ slug: e.target.value })}
                  className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 font-mono text-sm text-cnc-text focus:border-primary focus:outline-none"
                />
              </Field>

              <Field
                id="excerpt"
                label={`Resumo (excerpt) — ${excerptLen}/240`}
                hint="Aparece nos cards do blog e é o fallback da meta description."
              >
                <textarea
                  id="excerpt"
                  rows={2}
                  maxLength={240}
                  value={draft.excerpt}
                  onChange={(e) => patchDraft({ excerpt: e.target.value })}
                  className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="category" label="Categoria">
                  <select
                    id="category"
                    value={draft.category}
                    onChange={(e) =>
                      patchDraft({ category: e.target.value as "" | BlogCategoryId })
                    }
                    className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                  >
                    {CATEGORIES.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="tags" label="Tags" hint="Separe por vírgula (máx. 12).">
                  <input
                    id="tags"
                    type="text"
                    value={draft.tagsText}
                    onChange={(e) => patchDraft({ tagsText: e.target.value })}
                    placeholder="carros usados, vistoria, documentação"
                    className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                  />
                </Field>
              </div>

              {/* Capa */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-cnc-text">
                  Imagem de capa
                </label>
                <p className="mb-1.5 text-[11px] text-cnc-muted-soft">
                  JPG/PNG/WebP/HEIC até 8 MB — convertida para WebP no upload. Recomendada para
                  publicação (cards + Open Graph).
                </p>
                <div className="rounded-lg border border-dashed border-cnc-line bg-cnc-bg/40 p-3">
                  {draft.cover_image_url ? (
                    <div className="space-y-2">
                      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-cnc-line/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={draft.cover_image_url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => coverInputRef.current?.click()}
                          disabled={uploadBusy}
                          className="rounded-md border border-cnc-line bg-white px-2.5 py-1 text-[11px] font-semibold text-cnc-text hover:bg-cnc-bg disabled:opacity-50"
                        >
                          {uploadBusy ? "Enviando…" : "Trocar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchDraft({ cover_image_url: null })}
                          disabled={uploadBusy}
                          className="rounded-md border border-cnc-line bg-white px-2.5 py-1 text-[11px] font-semibold text-cnc-danger hover:bg-cnc-bg disabled:opacity-50"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadBusy}
                      className="w-full rounded-md border border-cnc-line bg-white px-3 py-6 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg disabled:opacity-50"
                    >
                      {uploadBusy ? "Enviando…" : "Selecionar imagem de capa"}
                    </button>
                  )}
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleCoverUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
                {uploadError && (
                  <p
                    role="alert"
                    className="mt-2 rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
                  >
                    {uploadError}
                  </p>
                )}
              </div>

              <Field
                id="cover_image_alt"
                label="Texto alternativo da capa (obrigatório quando há imagem)"
                hint="Lido por leitores de tela e usado pelo Google Imagens."
              >
                <input
                  id="cover_image_alt"
                  type="text"
                  maxLength={240}
                  value={draft.cover_image_alt}
                  onChange={(e) => patchDraft({ cover_image_alt: e.target.value })}
                  className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                />
              </Field>

              <Field
                id="content"
                label={`Conteúdo (Markdown) — ${draft.content.trim().length} caracteres · ${contentStats.words} palavra(s) · ~${contentStats.readingMinutes} min de leitura`}
                hint="Use a barra de ferramentas para formatar. Suporta ## subtítulo, ### subtítulo, - listas, 1. listas, **negrito**, *itálico*, > citação, [links](/comprar), ![imagem](url), --- separador e tabelas. HTML livre e links javascript:/data: são bloqueados."
              >
                <div className="space-y-2">
                  <MarkdownToolbar
                    textareaRef={contentRef}
                    onChange={(next) => patchDraft({ content: next })}
                    onUploadImage={handleContentImageUpload}
                    disabled={uploadBusy}
                  />
                  <textarea
                    ref={contentRef}
                    id="content"
                    rows={18}
                    value={draft.content}
                    onChange={(e) => patchDraft({ content: e.target.value })}
                    className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-cnc-text focus:border-primary focus:outline-none"
                  />
                  {contentStats.warnings.length > 0 && (
                    <ul className="space-y-1 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-800">
                      {contentStats.warnings.map((w) => (
                        <li key={w}>• {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>

              {/* SEO */}
              <details className="rounded-lg border border-cnc-line/60 bg-cnc-bg/30" open>
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-cnc-text">
                  SEO (meta title, meta description, canonical, indexação)
                </summary>
                <div className="space-y-3 border-t border-cnc-line/60 p-3">
                  <Field
                    id="meta_title"
                    label={`Meta title — efetivo: ${metaTitleLen}/60`}
                    hint="Vazio = usa o título do post."
                  >
                    <input
                      id="meta_title"
                      type="text"
                      maxLength={70}
                      value={draft.meta_title}
                      onChange={(e) => patchDraft({ meta_title: e.target.value })}
                      className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                    />
                  </Field>
                  <Field
                    id="meta_description"
                    label={`Meta description — efetiva: ${metaDescLen}/160`}
                    hint="Vazia = usa o resumo (excerpt)."
                  >
                    <textarea
                      id="meta_description"
                      rows={2}
                      maxLength={200}
                      value={draft.meta_description}
                      onChange={(e) => patchDraft({ meta_description: e.target.value })}
                      className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                    />
                  </Field>
                  <Field
                    id="canonical_url"
                    label="Canonical URL (opcional)"
                    hint={`Vazia = canonical padrão /blog/${draft.slug || "<slug>"}. Use apenas se este conteúdo for republicação de outra URL.`}
                  >
                    <input
                      id="canonical_url"
                      type="text"
                      maxLength={500}
                      value={draft.canonical_url}
                      onChange={(e) => patchDraft({ canonical_url: e.target.value })}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                    />
                  </Field>
                  <Field
                    id="og_image_url"
                    label="Imagem Open Graph (opcional)"
                    hint="Vazia = usa a imagem de capa."
                  >
                    <input
                      id="og_image_url"
                      type="text"
                      maxLength={500}
                      value={draft.og_image_url}
                      onChange={(e) => patchDraft({ og_image_url: e.target.value })}
                      placeholder="https://…"
                      className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
                    />
                  </Field>
                  <div className="flex items-center gap-3 rounded-lg border border-cnc-line/60 bg-white px-3 py-2.5">
                    <input
                      id="is_indexable"
                      type="checkbox"
                      checked={draft.is_indexable}
                      onChange={(e) => patchDraft({ is_indexable: e.target.checked })}
                      className="h-4 w-4 rounded border-cnc-line text-primary"
                    />
                    <label htmlFor="is_indexable" className="text-xs font-semibold text-cnc-text">
                      Indexável (robots index/follow quando publicado)
                    </label>
                  </div>
                </div>
              </details>
            </div>
          ) : (
            /* Preview */
            <div className="rounded-xl border border-cnc-line bg-white p-5 shadow-card">
              <p className="mb-4 rounded-md border border-cnc-line/60 bg-cnc-bg/40 px-3 py-2 text-[11px] text-cnc-muted">
                Pré-visualização aproximada de como o post aparece em {`/blog/${draft.slug}`}.
              </p>
              <article>
                {draft.category && (
                  <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">
                    {CATEGORIES.find((c) => c.value === draft.category)?.label || draft.category}
                  </span>
                )}
                <h1 className="mt-2.5 text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong">
                  {draft.title || <span className="text-cnc-muted-soft">Sem título…</span>}
                </h1>
                {draft.excerpt && (
                  <p className="mt-2 text-[15px] leading-relaxed text-cnc-muted">{draft.excerpt}</p>
                )}
                {draft.cover_image_url && (
                  <div className="relative mt-4 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-cnc-bg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={draft.cover_image_url}
                      alt={draft.cover_image_alt}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
                {draft.content.trim() ? (
                  <MarkdownContent content={draft.content} className="mt-5" />
                ) : (
                  <p className="mt-5 text-sm text-cnc-muted-soft">Sem conteúdo ainda.</p>
                )}
              </article>
            </div>
          )}
        </div>

        {/* Coluna lateral — ações + checklist */}
        <aside className="space-y-4">
          <div className="space-y-3 rounded-xl border border-cnc-line bg-white p-4 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text">Ações</h2>

            <button
              type="button"
              onClick={() => void handleSaveClick()}
              disabled={!dirty || saveStatus === "saving" || uploadBusy}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
            >
              {saveStatus === "saving"
                ? "Salvando…"
                : server.status === "published"
                  ? "Salvar e atualizar no ar"
                  : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (server) setDraft(toDraft(server));
                setSaveStatus("idle");
                setSaveError(null);
              }}
              disabled={!dirty || saveStatus === "saving"}
              className="w-full rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted transition-colors hover:bg-cnc-bg disabled:opacity-50"
            >
              Descartar alterações
            </button>

            <hr className="border-cnc-line/60" />

            {(server.status === "draft" || server.status === "unpublished") && (
              <>
                <button
                  type="button"
                  onClick={() => setDialog("publish")}
                  disabled={dirty || problems.length > 0 || saveStatus === "saving"}
                  className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  Publicar
                </button>
                {dirty && (
                  <p className="text-[11px] text-amber-700">
                    Salve as alterações antes de publicar.
                  </p>
                )}
              </>
            )}
            {server.status === "published" && (
              <button
                type="button"
                onClick={() => setDialog("unpublish")}
                disabled={saveStatus === "saving"}
                className="w-full rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                Despublicar
              </button>
            )}
            {server.status !== "archived" ? (
              <button
                type="button"
                onClick={() => setDialog("archive")}
                disabled={saveStatus === "saving"}
                className="w-full rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-danger transition-colors hover:bg-cnc-bg disabled:opacity-50"
              >
                Arquivar post
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDialog("restore")}
                disabled={saveStatus === "saving"}
                className="w-full rounded-lg border border-cnc-line px-4 py-2 text-sm font-semibold text-cnc-text transition-colors hover:bg-cnc-bg disabled:opacity-50"
              >
                Restaurar post
              </button>
            )}

            {saveStatus === "saved" && (
              <p
                role="status"
                aria-live="polite"
                className="text-xs font-semibold text-emerald-700"
              >
                Alterações salvas.
              </p>
            )}
            {saveStatus === "error" && saveError && (
              <p role="alert" className="text-xs font-semibold text-cnc-danger">
                {saveError}
              </p>
            )}
          </div>

          {/* Checklist de publicação */}
          <div className="space-y-2 rounded-xl border border-cnc-line bg-white p-4 shadow-card">
            <h2 className="text-sm font-bold text-cnc-text">Checklist de publicação</h2>
            {problems.length === 0 ? (
              <p className="text-xs font-semibold text-emerald-700">
                ✓ Pronto para publicar — todos os campos obrigatórios preenchidos.
              </p>
            ) : (
              <ul className="space-y-1 text-xs text-cnc-danger">
                {problems.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <>
                <h3 className="pt-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Avisos de SEO (não bloqueiam)
                </h3>
                <ul className="space-y-1 text-xs text-amber-800">
                  {warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-cnc-muted-soft">
            Publicar/despublicar/arquivar exigem motivo e ficam registrados em admin_actions. Após
            publicar, o blog público é revalidado automaticamente (até ~60s para refletir em todas
            as camadas de cache).
          </p>
        </aside>
      </div>

      <AdminActionDialog
        open={dialog !== null}
        title={dialog ? DIALOG_META[dialog].title : ""}
        description={dialog ? DIALOG_META[dialog].description : undefined}
        confirmLabel={dialog ? DIALOG_META[dialog].confirm : "Confirmar"}
        confirmColor={dialog ? DIALOG_META[dialog].color : "primary"}
        showReason
        requireReason
        reasonPlaceholder="Motivo (ex.: validação Fase 4.2 — publicação inicial do blog)"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-cnc-text">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-cnc-muted-soft">{hint}</p>}
    </div>
  );
}
