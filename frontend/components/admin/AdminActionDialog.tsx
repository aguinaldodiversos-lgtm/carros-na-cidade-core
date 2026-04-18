"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmColor?: "primary" | "danger" | "warning";
  showReason?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
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
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function handle() {
    setBusy(true);
    try {
      await onConfirm(reason);
    } finally {
      setBusy(false);
      setReason("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-cnc-line bg-white p-6 shadow-premium"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-cnc-text">{title}</h3>
        {description && <p className="mt-1 text-sm text-cnc-muted">{description}</p>}

        {showReason && (
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo (opcional)"
            rows={3}
            className="mt-3 w-full rounded-lg border border-cnc-line px-3 py-2 text-sm text-cnc-text placeholder:text-cnc-muted-soft/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-cnc-line px-4 py-2 text-xs font-semibold text-cnc-muted hover:bg-cnc-bg transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handle}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${colorMap[confirmColor]}`}
          >
            {busy ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
