"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmColor?: "primary" | "danger" | "warning";
  showReason?: boolean;
  /** Quando true, exige motivo não-vazio antes de habilitar o confirm. */
  requireReason?: boolean;
  reasonPlaceholder?: string;
  /** Slot opcional para inputs adicionais (ex.: dias de destaque, prioridade). */
  extra?: ReactNode;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
  onCancel: () => void;
};

const colorMap = {
  primary: "bg-primary hover:bg-primary-strong",
  danger: "bg-cnc-danger hover:bg-red-700",
  warning: "bg-cnc-warning hover:bg-amber-700",
};

export function AdminActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  confirmColor = "primary",
  showReason = false,
  requireReason = false,
  reasonPlaceholder = "Motivo (opcional)",
  extra,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reseta estado ao abrir/fechar para evitar vazamento entre invocações.
  useEffect(() => {
    if (!open) {
      setReason("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  const trimmedReason = reason.trim();
  const reasonBlocked = requireReason && trimmedReason.length === 0;
  const disabled = busy || reasonBlocked;

  async function handle() {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(trimmedReason);
    } catch (err) {
      setBusy(false);
      const message =
        err instanceof Error && err.message ? err.message : "Não foi possível concluir a ação.";
      setError(message);
    }
  }

  function handleCancel() {
    if (busy) return;
    onCancel();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-action-dialog-title"
    >
      <div
        className="w-full max-w-md rounded-xl border border-cnc-line bg-white p-6 shadow-premium"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="admin-action-dialog-title" className="text-base font-bold text-cnc-text">
          {title}
        </h3>
        {description && <p className="mt-1 text-sm text-cnc-muted">{description}</p>}

        {extra && <div className="mt-3">{extra}</div>}

        {showReason && (
          <div className="mt-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                requireReason ? reasonPlaceholder.replace(/\s*\(opcional\)\s*$/i, "") : reasonPlaceholder
              }
              rows={3}
              maxLength={500}
              disabled={busy}
              aria-required={requireReason}
              aria-invalid={reasonBlocked || undefined}
              className="w-full rounded-lg border border-cnc-line px-3 py-2 text-sm text-cnc-text placeholder:text-cnc-muted-soft/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:bg-cnc-bg/60"
            />
            {requireReason && (
              <p className="mt-1 text-[11px] text-cnc-muted-soft">Motivo obrigatório.</p>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-cnc-danger/40 bg-cnc-danger/10 px-3 py-2 text-xs font-medium text-cnc-danger"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={disabled}
            aria-busy={busy}
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${colorMap[confirmColor]}`}
          >
            {busy ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
