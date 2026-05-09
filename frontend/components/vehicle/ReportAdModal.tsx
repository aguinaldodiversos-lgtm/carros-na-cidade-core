"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

/**
 * Modal de denúncia de anúncio. Posta para o BFF
 * `/api/ads/[adId]/report`, que encaminha ao backend Express.
 *
 * Aceita anônimo. Backend faz rate limit por hash de IP. Layout testado
 * em mobile (full-screen sheet bottom) e desktop (modal centralizado).
 *
 * Princípios:
 *   - Motivo é OBRIGATÓRIO; descrição opcional (máx. 1000 chars).
 *   - NÃO coletamos nome/email/telefone — reduz PII e fricção.
 *   - Confirmação textual após sucesso, com auto-dismiss em 4s.
 *   - Erro do backend (rate limit/anúncio não existe) é exibido sem
 *     fechar o modal.
 */

type Reason =
  | "suspicious_price"
  | "incorrect_data"
  | "vehicle_does_not_exist"
  | "scam_or_advance_pay"
  | "fake_photos"
  | "other";

const REASON_OPTIONS: ReadonlyArray<{ value: Reason; label: string }> = [
  { value: "suspicious_price", label: "Preço suspeito" },
  { value: "incorrect_data", label: "Dados incorretos" },
  { value: "vehicle_does_not_exist", label: "Veículo não existe" },
  { value: "scam_or_advance_pay", label: "Golpe ou pedido de pagamento antecipado" },
  { value: "fake_photos", label: "Fotos falsas" },
  { value: "other", label: "Outro motivo" },
];

const DESCRIPTION_MAX_LENGTH = 1000;

type ReportAdModalProps = {
  open: boolean;
  onClose: () => void;
  adId: string;
  /** Apenas para o título do modal — backend não recebe. */
  vehicleName?: string;
};

export function ReportAdModal({ open, onClose, adId, vehicleName }: ReportAdModalProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState<Reason | "">("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reset state quando o modal abre — evita estado vazado entre aberturas.
  useEffect(() => {
    if (!open) return;
    setReason("");
    setDescription("");
    setError(null);
    setSuccess(null);
    setSubmitting(false);
  }, [open]);

  // ESC fecha — acessibilidade básica.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Auto-dismiss após sucesso (UX: usuário não fica preso na tela).
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => onClose(), 4000);
    return () => clearTimeout(t);
  }, [success, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!reason) {
      setError("Selecione um motivo para a denúncia.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/ads/${encodeURIComponent(adId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          description: description.trim() ? description.trim() : null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; error?: string }
        | null;

      if (!response.ok || payload?.success === false) {
        setError(
          payload?.error ||
            "Não foi possível enviar a denúncia agora. Tente novamente em instantes."
        );
        return;
      }

      setSuccess(
        payload?.message ||
          "Denúncia recebida. Nossa equipe vai revisar este anúncio. Obrigado por ajudar a manter o portal seguro."
      );
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 px-0 sm:items-center sm:px-4"
    >
      {/* Backdrop click fecha. */}
      <button
        type="button"
        aria-label="Fechar denúncia"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id={headingId}
              className="text-[16px] font-extrabold leading-tight text-slate-900"
            >
              Denunciar anúncio
            </h2>
            {vehicleName ? (
              <p className="mt-0.5 truncate text-[12.5px] text-slate-500">{vehicleName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
            aria-label="Fechar"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {success ? (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] leading-relaxed text-emerald-800"
            >
              {success}
            </div>
          ) : (
            <>
              <fieldset className="space-y-2" aria-required="true">
                <legend className="text-[13px] font-semibold text-slate-700">
                  Motivo da denúncia <span className="text-rose-600">*</span>
                </legend>
                <div className="space-y-1.5">
                  {REASON_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] transition ${
                        reason === opt.value
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={opt.value}
                        checked={reason === opt.value}
                        onChange={() => setReason(opt.value)}
                        className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-600"
                      />
                      <span className="text-slate-800">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block text-[13px] font-semibold text-slate-700">
                Detalhes (opcional)
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                  rows={3}
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  placeholder="Conte mais sobre o que aconteceu (opcional)."
                  className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] leading-snug text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <span className="mt-1 block text-right text-[11px] text-slate-400">
                  {description.length}/{DESCRIPTION_MAX_LENGTH}
                </span>
              </label>

              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800"
                >
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
                <button
                  type="submit"
                  disabled={submitting || !reason}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-700 px-5 text-[14px] font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {submitting ? "Enviando…" : "Enviar denúncia"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-[14px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
                >
                  Cancelar
                </button>
              </div>

              <p className="text-[11.5px] leading-relaxed text-slate-500">
                Sua denúncia é anônima para o anunciante. Não compartilhamos seu nome,
                e-mail ou telefone com ele. Usamos apenas para revisar o anúncio.
              </p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default ReportAdModal;
