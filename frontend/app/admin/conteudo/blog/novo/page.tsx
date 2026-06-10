"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { adminApi, type BlogCategoryId } from "@/lib/admin/api";

/**
 * Conteúdo · Blog — novo post (Fase 4.2).
 *
 * Formulário mínimo: título (obrigatório), slug (opcional — derivado do
 * título) e categoria. Cria o post como DRAFT e redireciona para o editor
 * completo, onde o admin preenche conteúdo, SEO e capa antes de publicar.
 */

const CATEGORIES: Array<{ value: "" | BlogCategoryId; label: string }> = [
  { value: "", label: "Sem categoria" },
  { value: "compra", label: "Compra" },
  { value: "venda", label: "Venda" },
  { value: "manutencao", label: "Manutenção" },
  { value: "mercado", label: "Mercado" },
  { value: "financiamento", label: "Financiamento" },
  { value: "cidades", label: "Cidades" },
];

/** Espelha o slugify do backend (admin-blog.service.js) para preview. */
function slugifyPreview(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function AdminBlogNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState<"" | BlogCategoryId>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugPreview = useMemo(
    () => (slug.trim() ? slugifyPreview(slug) : slugifyPreview(title)),
    [slug, title]
  );

  const titleOk = title.trim().length >= 5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titleOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.blog.create({
        title: title.trim(),
        ...(slug.trim() ? { slug: slugPreview } : {}),
        ...(category ? { category } : {}),
      });
      router.push(`/admin/conteudo/blog/${res.data.id}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Erro ao criar post");
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-cnc-text">Conteúdo · Blog — Novo post</h1>
        <Link
          href="/admin/conteudo/blog"
          className="ml-auto text-xs font-semibold text-cnc-muted hover:text-cnc-text"
        >
          ← Voltar para a lista
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-cnc-line bg-white p-5 shadow-card"
      >
        <p className="rounded-md border border-cnc-line/60 bg-cnc-bg/40 px-3 py-2 text-[11px] leading-snug text-cnc-muted">
          O post é criado como <strong>rascunho</strong> — nada aparece no site público até você
          publicar. Conteúdo, capa e SEO são preenchidos na próxima tela.
        </p>

        <div>
          <label htmlFor="title" className="mb-1 block text-xs font-semibold text-cnc-text">
            Título do post (obrigatório)
          </label>
          <input
            id="title"
            type="text"
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Como comprar um carro usado com segurança"
            className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
            autoFocus
          />
          {!titleOk && title.trim().length > 0 && (
            <p className="mt-1 text-[11px] text-cnc-danger">Mínimo de 5 caracteres.</p>
          )}
        </div>

        <div>
          <label htmlFor="slug" className="mb-1 block text-xs font-semibold text-cnc-text">
            Slug (opcional — gerado do título)
          </label>
          <input
            id="slug"
            type="text"
            maxLength={180}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="como-comprar-carro-usado-com-seguranca"
            className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
          />
          {slugPreview && (
            <p className="mt-1 text-[11px] text-cnc-muted-soft">
              URL pública: <code className="text-cnc-text">/blog/{slugPreview}</code>
            </p>
          )}
        </div>

        <div>
          <label htmlFor="category" className="mb-1 block text-xs font-semibold text-cnc-text">
            Categoria
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as "" | BlogCategoryId)}
            className="w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-sm text-cnc-text focus:border-primary focus:outline-none"
          >
            {CATEGORIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
          >
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!titleOk || busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-strong disabled:opacity-50"
          >
            {busy ? "Criando…" : "Criar rascunho"}
          </button>
          <Link
            href="/admin/conteudo/blog"
            className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted transition-colors hover:bg-cnc-bg"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
