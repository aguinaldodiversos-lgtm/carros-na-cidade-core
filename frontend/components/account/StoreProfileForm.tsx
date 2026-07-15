"use client";

import { useState, type FormEvent } from "react";

import type { StoreProfile } from "@/lib/account/backend-account";

/**
 * Formulário "Dados da loja" (lojista). Edita advertisers.{name,email,whatsapp,
 * address}; documento (CPF/CNPJ, de users) é read-only. O WhatsApp é o campo
 * mais importante — é por ele que o comprador fala com a loja pelo anúncio;
 * quando vazio, mostramos um aviso forte de que os anúncios ficam sem contato.
 *
 * Salva via BFF PUT /api/account/store (escopado ao usuário do JWT no backend).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Espelha a validação do backend (store-profile.service.js). */
function normalizeBrPhoneOrNull(input: string): string | null {
  let digits = input.replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits;
}

function formatDocument(type: "CPF" | "CNPJ" | null, number: string): string {
  const d = number.replace(/\D/g, "");
  if ((type === "CNPJ" || d.length === 14) && d.length === 14) {
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if ((type === "CPF" || d.length === 11) && d.length === 11) {
    return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return number;
}

const INPUT_CLASS =
  "h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]";
const LABEL_CLASS = "mb-2 block text-sm font-semibold text-[#33405A]";

export default function StoreProfileForm({ initial }: { initial: StoreProfile }) {
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [address, setAddress] = useState(initial.address);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const nameOk = name.trim().length >= 2;
  const emailOk = email.trim() === "" || EMAIL_RE.test(email.trim());
  const whatsappTrimmed = whatsapp.trim();
  const whatsappOk = whatsappTrimmed === "" || normalizeBrPhoneOrNull(whatsappTrimmed) !== null;
  const whatsappEmpty = whatsappTrimmed === "";
  const canSubmit = nameOk && emailOk && whatsappOk && !submitting;

  const documentDisplay = initial.document.number
    ? formatDocument(initial.document.type, initial.document.number)
    : "";
  const documentLabel = initial.document.type ? `${initial.document.type} (CPF/CNPJ)` : "CPF/CNPJ";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/account/store", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: whatsappTrimmed,
          address: address.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        store?: StoreProfile;
      };
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível salvar os dados. Tente novamente."
        );
      }
      if (data.store) {
        setName(data.store.name);
        setEmail(data.store.email);
        setWhatsapp(data.store.whatsapp);
        setAddress(data.store.address);
      }
      setFeedback({ tone: "success", text: "Dados da loja salvos com sucesso." });
    } catch (err) {
      setFeedback({
        tone: "error",
        text: err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.06)] md:p-8"
    >
      {/* Aviso forte quando não há WhatsApp — o comprador fica sem canal de contato. */}
      {whatsappEmpty ? (
        <div className="rounded-[16px] border border-[#F5C878] bg-[#FFF8EC] px-4 py-3 text-[14px] font-medium text-[#8A5A00]">
          Seus anúncios estão <strong>sem WhatsApp cadastrado</strong>. É o principal canal de
          contato — sem ele, nenhum comprador consegue falar com você. Cadastre um número abaixo.
        </div>
      ) : null}

      {/* WhatsApp — campo mais importante, em destaque. */}
      <div className="rounded-[18px] border border-[#1F66E5]/30 bg-[#F5F9FF] p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#1F66E5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
            Principal
          </span>
          <span className="text-sm font-semibold text-[#33405A]">WhatsApp de contato</span>
        </div>
        <input
          type="tel"
          inputMode="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="DDD + número (ex.: 11 91234-5678)"
          autoComplete="tel"
          aria-label="WhatsApp de contato"
          className={INPUT_CLASS}
        />
        <p className="mt-2 text-[13px] text-[#475569]">
          É por este número que o comprador entra em contato pelo anúncio.
        </p>
        {!whatsappOk ? (
          <p className="mt-1 text-[13px] font-semibold text-[#C2410C]">
            Número inválido. Use DDD + número (ex.: 11 91234-5678).
          </p>
        ) : null}
      </div>

      <label className="block">
        <span className={LABEL_CLASS}>Nome da loja</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome que aparece nos seus anúncios"
          className={INPUT_CLASS}
        />
        {!nameOk ? (
          <p className="mt-2 text-[13px] font-semibold text-[#C2410C]">
            Informe o nome da loja (mínimo 2 caracteres).
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-[#64748b]">O comprador vê este nome no anúncio.</p>
        )}
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>E-mail de contato</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="contato@sualoja.com.br"
          autoComplete="email"
          className={INPUT_CLASS}
        />
        {!emailOk ? (
          <p className="mt-2 text-[13px] font-semibold text-[#C2410C]">E-mail inválido.</p>
        ) : null}
      </label>

      <label className="block">
        <span className={LABEL_CLASS}>Endereço</span>
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Rua, número, bairro, cidade"
          autoComplete="street-address"
          className={INPUT_CLASS}
        />
      </label>

      {/* Documento — READ-ONLY (identidade fiscal; correção só via suporte). */}
      <label className="block">
        <span className={LABEL_CLASS}>{documentLabel}</span>
        <input
          type="text"
          value={documentDisplay || "Não informado"}
          readOnly
          disabled
          aria-label="CPF ou CNPJ (somente leitura)"
          className="h-[52px] w-full cursor-not-allowed rounded-[14px] border border-[#E5E9F2] bg-[#F3F6FB] px-4 text-[16px] text-[#64748b] outline-none"
        />
        <p className="mt-2 text-[13px] text-[#64748b]">
          Documento não editável. Para corrigir, fale com o suporte.
        </p>
      </label>

      {feedback ? (
        <div
          className={
            feedback.tone === "success"
              ? "rounded-[16px] border border-[#A7E3C0] bg-[#F0FBF4] px-4 py-3 text-[14px] font-medium text-[#15803D]"
              : "rounded-[16px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-[14px] font-medium text-[#B42318]"
          }
        >
          {feedback.text}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#1F66E5] px-6 text-[16px] font-extrabold text-white transition hover:bg-[#1758CC] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Salvando..." : "Salvar dados da loja"}
      </button>
    </form>
  );
}
