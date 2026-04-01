"use client";

import { useMemo, useState } from "react";
import {
  formatBrazilianDocument,
  isValidBrazilianDocument,
  onlyDigits,
  type BrazilianDocumentType,
} from "@/lib/validation/document";

type Props = {
  onCompleted: () => void;
};

export default function CompleteProfileGate({ onCompleted }: Props) {
  const [docType, setDocType] = useState<BrazilianDocumentType>("cpf");
  const [doc, setDoc] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const docOk = useMemo(() => isValidBrazilianDocument(doc, docType), [doc, docType]);
  const canSubmit = docOk && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          document_type: docType,
          document_number: onlyDigits(doc),
          ...(displayName.trim() ? { name: displayName.trim() } : {}),
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : typeof data.message === "string"
              ? data.message
              : "Não foi possível validar o documento."
        );
      }

      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.06)] md:p-8">
      <p className="text-sm font-semibold text-[#6b7280]">Primeiro anúncio</p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-[#0f172a]">
        Complete seu cadastro para anunciar
      </h1>
      <p className="mt-3 text-sm leading-7 text-[#64748b]">
        Informe CPF ou CNPJ válido. Você só precisa fazer isso uma vez; depois os dados ficam
        salvos na sua conta.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#33405A]">Nome completo</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Como aparecerá nos anúncios"
            className="h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
          />
        </label>

        <div>
          <span className="mb-2 block text-sm font-semibold text-[#33405A]">Tipo</span>
          <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#F3F6FB] p-1">
            <button
              type="button"
              onClick={() => {
                setDocType("cpf");
                setDoc("");
              }}
              className={`inline-flex h-[46px] items-center justify-center rounded-[12px] text-[14px] font-bold transition ${
                docType === "cpf" ? "bg-white text-[#1D2440] shadow-sm" : "text-[#778199]"
              }`}
            >
              Pessoa física (CPF)
            </button>
            <button
              type="button"
              onClick={() => {
                setDocType("cnpj");
                setDoc("");
              }}
              className={`inline-flex h-[46px] items-center justify-center rounded-[12px] text-[14px] font-bold transition ${
                docType === "cnpj" ? "bg-white text-[#1D2440] shadow-sm" : "text-[#778199]"
              }`}
            >
              Lojista (CNPJ)
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-[#33405A]">
            {docType === "cpf" ? "CPF" : "CNPJ"}
          </span>
          <input
            type="text"
            value={doc}
            onChange={(e) => setDoc(formatBrazilianDocument(e.target.value, docType))}
            placeholder={docType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
            className="h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
          />
          {doc ? (
            <p
              className={`mt-2 text-[13px] font-semibold ${
                docOk ? "text-[#15803D]" : "text-[#C2410C]"
              }`}
            >
              {docOk ? `${docType.toUpperCase()} válido` : `${docType.toUpperCase()} inválido`}
            </p>
          ) : null}
        </label>

        {error ? (
          <div className="rounded-[16px] border border-[#F4C7C3] bg-[#FFF4F3] px-4 py-3 text-[14px] font-medium text-[#B42318]">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-[52px] w-full items-center justify-center rounded-[16px] bg-[#1F66E5] px-6 text-[16px] font-extrabold text-white transition hover:bg-[#1758CC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Validando..." : "Salvar e continuar"}
        </button>
      </form>
    </div>
  );
}
