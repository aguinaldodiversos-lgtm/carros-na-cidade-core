// frontend/components/vehicle/detail/VehicleMessageForm.tsx
"use client";

import { useState, type FormEvent } from "react";

import { trackAdEvent } from "@/lib/analytics/public-events";
import { submitVehicleLead } from "@/lib/leads/public-leads";

/**
 * Formulário "Enviar mensagem ao vendedor" (chat interno / lead). POSTa via
 * `submitVehicleLead` e registra o evento `lead`. Usado na coluna de contato
 * do detalhe do veículo (redesign detalhes.png).
 */
export default function VehicleMessageForm({
  vehicleId,
  vehicleName,
}: {
  vehicleId: string;
  vehicleName: string;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState(
    `Olá, vi seu anúncio do ${vehicleName} no Carros na Cidade e tenho interesse.`
  );
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

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
      await submitVehicleLead({ adId: vehicleId, buyerName: trimmedName, buyerPhone: trimmedPhone });
      trackAdEvent(vehicleId, "lead").catch(() => {});
      setFeedback({
        tone: "success",
        text: "Mensagem enviada! O anunciante vai entrar em contato em breve.",
      });
      setName("");
      setPhone("");
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
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Seu nome"
        autoComplete="name"
        className="h-11 w-full rounded-xl border border-cnc-line bg-white px-3 text-[14px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <input
        type="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Seu telefone"
        autoComplete="tel"
        className="h-11 w-full rounded-xl border border-cnc-line bg-white px-3 text-[14px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escreva sua mensagem"
        rows={3}
        className="w-full resize-none rounded-xl border border-cnc-line bg-white px-3 py-2 text-[14px] leading-snug outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-primary bg-white text-[14px] font-bold text-primary transition hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Enviando..." : "Enviar mensagem"}
      </button>
      {feedback ? (
        <p
          className={`text-[12.5px] ${
            feedback.tone === "success" ? "text-cnc-success" : "text-cnc-danger"
          }`}
        >
          {feedback.text}
        </p>
      ) : null}
    </form>
  );
}
