"use client";

import { useState } from "react";
import Link from "next/link";

export default function ConfirmEmailPanel({ token }: { token: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const valid = /^[a-f0-9]{64}$/i.test(token);

  async function confirm() {
    if (!valid || status === "loading" || status === "success") return;
    setStatus("loading");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token }),
      });
      const result = (await response.json()) as { ok: boolean; message: string };
      setStatus(response.ok && result.ok ? "success" : "error");
      setMessage(result.message);
    } catch {
      setStatus("error");
      setMessage("Não foi possível confirmar o e-mail. Tente novamente.");
    }
  }

  return (
    <section className="mx-auto max-w-lg rounded-2xl border border-[#E0E6EF] bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-extrabold text-[#172646]">Confirmação de e-mail</h1>
      <p className="mt-3 text-sm text-[#475569]">
        Confirme que este endereço de e-mail pertence a você. A verificação é independente da
        averiguação do CNPJ e da loja física.
      </p>
      {!valid ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          Link inválido. Acesse os dados da sua conta para solicitar uma nova mensagem.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={status === "loading" || status === "success"}
          className="mt-6 min-h-11 rounded-xl bg-[#1763D6] px-5 text-sm font-bold text-white disabled:opacity-60"
        >
          {status === "loading"
            ? "Confirmando..."
            : status === "success"
              ? "Confirmado"
              : "Confirmar meu e-mail"}
        </button>
      )}
      {message ? (
        <p
          role="status"
          className={
            status === "success" ? "mt-4 text-sm text-emerald-800" : "mt-4 text-sm text-red-700"
          }
        >
          {message}
        </p>
      ) : null}
      <p className="mt-6 text-sm">
        <Link href="/dashboard-loja/dados" className="font-semibold text-[#1763D6] underline">
          Voltar aos dados da loja
        </Link>
      </p>
    </section>
  );
}
