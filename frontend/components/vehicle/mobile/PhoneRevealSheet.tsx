// frontend/components/vehicle/mobile/PhoneRevealSheet.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";

import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";
import { formatPhoneDisplay } from "@/lib/vehicle/detail-utils";

/**
 * Bottom sheet acionado pelo botão "Ver telefone".
 *
 * Espelha a UX do mockup:
 *   1. Mostra o número formatado.
 *   2. Botão "Copiar número".
 *   3. Botão "Ligar agora" (anchor tel:).
 *   4. Mini-formulário (Nome / Telefone / Mensagem) para o visitante
 *      que prefere mensagem ao invés de WhatsApp/ligação.
 *
 * Nada de navegação para outra página; o sheet abre/fecha in-place,
 * com backdrop escuro, foco-trap leve e fechamento por Esc.
 */

type PhoneRevealSheetProps = {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  /** Telefone do anunciante (formatado ou apenas dígitos). */
  sellerPhone: string;
};

export default function PhoneRevealSheet({
  open,
  onClose,
  vehicleId,
  vehicleName,
  sellerPhone,
}: PhoneRevealSheetProps) {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const display = formatPhoneDisplay(sellerPhone) || sellerPhone || "Não informado";
  const telHref = sellerPhone ? `tel:${sellerPhone.replace(/\D/g, "")}` : null;

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setFeedback(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(sellerPhone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackAdEvent(vehicleId, "click").catch(() => {});
    } catch {
      setFeedback({ tone: "error", text: "Não foi possível copiar. Selecione manualmente." });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName || !trimmedPhone) {
      setFeedback({ tone: "error", text: "Preencha nome e telefone para enviar." });
      return;
    }
    setSubmitting(true);
    setFeedback(null);
    try {
      await submitVehicleLead({
        adId: vehicleId,
        buyerName: trimmedName,
        buyerPhone: trimmedPhone,
      });
      trackAdEvent(vehicleId, "lead").catch(() => {});
      setFeedback({
        tone: "success",
        text: "Mensagem enviada! O anunciante vai entrar em contato.",
      });
      setName("");
      setPhone("");
      setMessage("");
    } catch (err) {
      const text =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível enviar a mensagem. Tente novamente.";
      setFeedback({ tone: "error", text });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Telefone do anunciante ${vehicleName}`}
      className="fixed inset-0 z-[60] flex items-end bg-black/55 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl">
        {/* drag handle */}
        <div className="flex justify-center pt-2.5">
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-extrabold leading-tight text-slate-900">
              Telefone do anunciante
            </h2>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Mencione o anúncio ao entrar em contato.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-5 pb-5 pt-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Número
            </p>
            <p className="mt-0.5 text-[20px] font-extrabold tabular-nums text-slate-900">
              {display}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!sellerPhone}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-[14px] font-bold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {copied ? "Copiado!" : "Copiar número"}
            </button>
            <a
              href={telHref ?? "#"}
              aria-disabled={!telHref}
              onClick={(e) => {
                if (!telHref) e.preventDefault();
                else trackAdEvent(vehicleId, "click").catch(() => {});
              }}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0e62d8] text-[14px] font-bold text-white transition hover:bg-[#0a52b8] ${
                telHref ? "" : "pointer-events-none opacity-50"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8 9.91a16 16 0 0 0 6 6l1.27-1.36a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
              </svg>
              Ligar agora
            </a>
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-2 rounded-2xl border border-slate-200 p-4"
          >
            <p className="text-[12.5px] font-semibold text-slate-700">
              Ou peça para o anunciante entrar em contato:
            </p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
            />
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Seu telefone"
              autoComplete="tel"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Escreva sua mensagem (opcional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-[14px] outline-none transition focus:border-[#0e62d8] focus:ring-2 focus:ring-[#0e62d8]/20"
            />
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0e62d8] text-[14px] font-bold text-white transition hover:bg-[#0a52b8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Enviando..." : "Enviar mensagem"}
            </button>
            {feedback ? (
              <p
                className={`text-[12.5px] ${
                  feedback.tone === "success" ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {feedback.text}
              </p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
