"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";

import {
  buildImageMarkdown,
  buildLinkMarkdown,
  clearFormatting,
  CTA_SNIPPET,
  FAQ_SNIPPET,
  HR_SNIPPET,
  insertBlock,
  prefixLines,
  TABLE_SNIPPET,
  uppercaseSelection,
  wrapSelection,
  type EditorSelection,
} from "@/lib/blog/markdown-toolbar-actions";
import { isSafeImageSrc } from "@/lib/blog/markdown";

/**
 * Toolbar editorial do Blog (Fase 4.2.2).
 *
 * Opera sobre a SELEÇÃO do <textarea> de Markdown e só insere marcação
 * Markdown segura (sem HTML livre). As transformações são puras
 * (markdown-toolbar-actions) — aqui só aplicamos no textarea e restauramos a
 * seleção (flushSync garante o valor no DOM antes do setSelectionRange).
 *
 * Imagens: por URL ou upload (R2). Alt OBRIGATÓRIO antes de inserir.
 */

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

const INPUT_CLASS =
  "w-full rounded-lg border border-cnc-line bg-white px-3 py-2 text-[13px] text-cnc-text focus:border-primary focus:outline-none";

type Props = {
  textareaRef: RefObject<HTMLTextAreaElement>;
  onChange: (next: string) => void;
  /** Upload de imagem no meio do texto → devolve a URL pública (R2). */
  onUploadImage?: (file: File) => Promise<string>;
  disabled?: boolean;
};

export function MarkdownToolbar({ textareaRef, onChange, onUploadImage, disabled }: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const savedSelection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  /** Aplica uma transformação pura no textarea e restaura a seleção. */
  function apply(fn: (s: EditorSelection) => EditorSelection) {
    const ta = textareaRef.current;
    if (!ta || disabled) return;
    const next = fn({
      value: ta.value,
      selectionStart: ta.selectionStart,
      selectionEnd: ta.selectionEnd,
    });
    flushSync(() => onChange(next.value));
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(next.selectionStart, next.selectionEnd);
    }
  }

  /** Insere um texto cru (link/imagem) na seleção SALVA ao abrir o modal. */
  function insertAtSavedSelection(snippet: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { start, end } = savedSelection.current;
    apply(() => insertBlock({ value: ta.value, selectionStart: start, selectionEnd: end }, snippet));
  }

  function rememberSelection() {
    const ta = textareaRef.current;
    if (ta) savedSelection.current = { start: ta.selectionStart, end: ta.selectionEnd };
  }

  function openLink() {
    rememberSelection();
    setLinkOpen(true);
  }
  function openImage() {
    rememberSelection();
    setImageOpen(true);
  }

  return (
    <div className="rounded-lg border border-cnc-line bg-cnc-bg/40">
      <div
        role="toolbar"
        aria-label="Ferramentas de formatação"
        className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1"
      >
        <ToolButton title="Negrito (**texto**)" onClick={() => apply((s) => wrapSelection(s, "**", "**", "texto em negrito"))} disabled={disabled}>
          <span className="font-extrabold">B</span>
        </ToolButton>
        <ToolButton title="Itálico (*texto*)" onClick={() => apply((s) => wrapSelection(s, "*", "*", "texto em itálico"))} disabled={disabled}>
          <span className="italic">I</span>
        </ToolButton>

        <Divider />

        <ToolButton title="Título H2 (##)" onClick={() => apply((s) => prefixLines(s, () => "## ", "Título da seção"))} disabled={disabled}>
          H2
        </ToolButton>
        <ToolButton title="Subtítulo H3 (###)" onClick={() => apply((s) => prefixLines(s, () => "### ", "Subtítulo"))} disabled={disabled}>
          H3
        </ToolButton>

        <Divider />

        <ToolButton title="Lista com bullets" onClick={() => apply((s) => prefixLines(s, () => "- ", "item da lista"))} disabled={disabled}>
          • Lista
        </ToolButton>
        <ToolButton title="Lista numerada" onClick={() => apply((s) => prefixLines(s, (i) => `${i + 1}. `, "item da lista"))} disabled={disabled}>
          1. Lista
        </ToolButton>
        <ToolButton title="Citação (>)" onClick={() => apply((s) => prefixLines(s, () => "> ", "texto citado"))} disabled={disabled}>
          ❝ Citação
        </ToolButton>

        <Divider />

        <ToolButton title="Link" onClick={openLink} disabled={disabled}>
          🔗 Link
        </ToolButton>
        <ToolButton title="Imagem (URL ou upload)" onClick={openImage} disabled={disabled}>
          🖼 Imagem
        </ToolButton>
        <ToolButton title="Separador horizontal" onClick={() => apply((s) => insertBlock(s, HR_SNIPPET))} disabled={disabled}>
          — HR
        </ToolButton>

        <Divider />

        <ToolButton title="Transformar seleção em MAIÚSCULAS" onClick={() => apply(uppercaseSelection)} disabled={disabled}>
          AA
        </ToolButton>
        <ToolButton title="Limpar formatação da seleção" onClick={() => apply(clearFormatting)} disabled={disabled}>
          ⌫ Limpar
        </ToolButton>

        <Divider />

        <ToolButton title="Inserir bloco de FAQ" onClick={() => apply((s) => insertBlock(s, FAQ_SNIPPET))} disabled={disabled}>
          FAQ
        </ToolButton>
        <ToolButton title="Inserir CTA interno" onClick={() => apply((s) => insertBlock(s, CTA_SNIPPET))} disabled={disabled}>
          CTA
        </ToolButton>
        <ToolButton title="Inserir tabela simples" onClick={() => apply((s) => insertBlock(s, TABLE_SNIPPET))} disabled={disabled}>
          Tabela
        </ToolButton>
      </div>

      {linkOpen && (
        <LinkModal
          onCancel={() => setLinkOpen(false)}
          onInsert={(text, url) => {
            insertAtSavedSelection(buildLinkMarkdown(text, url));
            setLinkOpen(false);
          }}
        />
      )}

      {imageOpen && (
        <ImageModal
          accept={IMAGE_ACCEPT}
          onUploadImage={onUploadImage}
          onCancel={() => setImageOpen(false)}
          onInsert={(alt, url) => {
            insertAtSavedSelection(buildImageMarkdown(alt, url));
            setImageOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ToolButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md border border-transparent px-2 py-1 text-[12px] font-semibold text-cnc-text transition-colors hover:border-cnc-line hover:bg-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-cnc-line" />;
}

// ── Modal de link ────────────────────────────────────────────────────────────

function LinkModal({
  onCancel,
  onInsert,
}: {
  onCancel: () => void;
  onInsert: (text: string, url: string) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const valid = isSafeImageSrc(url.trim());

  return (
    <ModalShell title="Inserir link" onCancel={onCancel}>
      <FieldRow label="Texto do link (opcional)">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ver carros disponíveis"
          className={INPUT_CLASS}
        />
      </FieldRow>
      <FieldRow label="URL (https://… ou caminho interno /comprar)">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="/comprar"
          className={INPUT_CLASS}
        />
      </FieldRow>
      {url.trim() && !valid && (
        <p className="text-[11px] font-medium text-cnc-danger">
          URL inválida — use http(s):// ou um caminho interno começando com “/”.
        </p>
      )}
      <ModalActions
        confirmLabel="Inserir link"
        confirmDisabled={!valid}
        onCancel={onCancel}
        onConfirm={() => onInsert(text.trim(), url.trim())}
      />
    </ModalShell>
  );
}

// ── Modal de imagem (URL ou upload; alt obrigatório) ─────────────────────────

function ImageModal({
  accept,
  onUploadImage,
  onCancel,
  onInsert,
}: {
  accept: string;
  onUploadImage?: (file: File) => Promise<string>;
  onCancel: () => void;
  onInsert: (alt: string, url: string) => void;
}) {
  const [mode, setMode] = useState<"url" | "upload">(onUploadImage ? "upload" : "url");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const altOk = alt.trim().length > 0;
  const urlOk = isSafeImageSrc(url.trim());
  const canInsert = altOk && urlOk && !busy;

  async function handleFile(file: File) {
    if (!onUploadImage) return;
    setBusy(true);
    setError(null);
    try {
      const publicUrl = await onUploadImage(file);
      setUrl(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload da imagem.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Inserir imagem no conteúdo" onCancel={onCancel}>
      {onUploadImage && (
        <div className="flex gap-2">
          {(["upload", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                mode === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-cnc-line bg-white text-cnc-muted hover:bg-cnc-bg"
              }`}
            >
              {m === "upload" ? "Upload" : "Por URL"}
            </button>
          ))}
        </div>
      )}

      {mode === "upload" && onUploadImage ? (
        <FieldRow label="Arquivo (JPG/PNG/WebP/HEIC até 8 MB — convertido para WebP)">
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full rounded-md border border-dashed border-cnc-line bg-white px-3 py-3 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg disabled:opacity-50"
            >
              {busy ? "Enviando…" : url ? "Trocar imagem" : "Selecionar imagem"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" className="max-h-40 w-full rounded-md object-contain" />
            )}
          </div>
        </FieldRow>
      ) : (
        <FieldRow label="URL da imagem (https://…)">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://cdn.exemplo.com/imagem.webp"
            className={INPUT_CLASS}
          />
        </FieldRow>
      )}

      {url.trim() && !urlOk && (
        <p className="text-[11px] font-medium text-cnc-danger">
          URL inválida — use http(s):// ou caminho interno. data:/javascript: são bloqueados.
        </p>
      )}

      <FieldRow label="Texto alternativo (alt) — obrigatório">
        <input
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          maxLength={240}
          placeholder="Descreva a imagem (ex.: SUV branco estacionado na rua)"
          className={INPUT_CLASS}
        />
      </FieldRow>
      {!altOk && (
        <p className="text-[11px] text-cnc-muted-soft">
          O alt descreve a imagem para leitores de tela e para o Google. Sem alt não dá para
          inserir.
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-cnc-danger">
          {error}
        </p>
      )}

      <ModalActions
        confirmLabel="Inserir imagem"
        confirmDisabled={!canInsert}
        onCancel={onCancel}
        onConfirm={() => onInsert(alt.trim(), url.trim())}
      />
    </ModalShell>
  );
}

// ── Primitivos de modal ──────────────────────────────────────────────────────

function ModalShell({
  title,
  onCancel,
  children,
}: {
  title: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md space-y-3 rounded-xl border border-cnc-line bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-cnc-text">{title}</h3>        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-cnc-text">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({
  confirmLabel,
  confirmDisabled,
  onCancel,
  onConfirm,
}: {
  confirmLabel: string;
  confirmDisabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-cnc-line px-3 py-1.5 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-strong disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

export default MarkdownToolbar;
