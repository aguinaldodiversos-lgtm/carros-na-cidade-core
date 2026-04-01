"use client";

import { FormEvent, useState } from "react";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export default function RecoverPasswordPanel() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loadingRecovery, setLoadingRecovery] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const requestRecovery = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadingRecovery) return;

    setLoadingRecovery(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setError(payload.error ?? "Nao foi possivel iniciar a recuperacao.");
        setLoadingRecovery(false);
        return;
      }
      setNotice(payload.message ?? "Verifique seu email para continuar.");
      setLoadingRecovery(false);
    } catch {
      setError("Falha na conexao.");
      setLoadingRecovery(false);
    }
  };

  const resetAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadingReset) return;

    setLoadingReset(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: newPassword,
        }),
      });
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok) {
        setError(payload.error ?? "Nao foi possivel redefinir a senha.");
        setLoadingReset(false);
        return;
      }
      setNotice("Senha redefinida com sucesso.");
      setLoadingReset(false);
    } catch {
      setError("Falha na conexao.");
      setLoadingReset(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-xl space-y-5 rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_4px_22px_rgba(15,24,44,0.08)] sm:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-[#5f6983]">
          Recuperacao de senha
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[#1d2538]">Recuperar acesso</h1>
      </div>

      <form
        onSubmit={requestRecovery}
        className="space-y-3 rounded-xl border border-[#e2e7f1] bg-[#f8fafe] p-4"
      >
        <h2 className="text-base font-extrabold text-[#1d2538]">Solicitar link</h2>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Seu email"
          className="cnc-input"
          required
        />
        <button
          type="submit"
          disabled={loadingRecovery}
          className="cnc-btn-primary h-11 w-full text-base disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loadingRecovery ? "Enviando..." : "Enviar link"}
        </button>
      </form>

      <form
        onSubmit={resetAccess}
        className="space-y-3 rounded-xl border border-[#e2e7f1] bg-[#f8fafe] p-4"
      >
        <h2 className="text-base font-extrabold text-[#1d2538]">Redefinir senha</h2>
        <input
          type="text"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="Token recebido"
          className="cnc-input"
          required
        />
        <input
          type="password"
          minLength={8}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          placeholder="Nova senha"
          className="cnc-input"
          required
        />
        <button
          type="submit"
          disabled={loadingReset}
          className="cnc-btn-primary h-11 w-full text-base disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loadingReset ? "Atualizando..." : "Salvar nova senha"}
        </button>
      </form>

      {notice && (
        <p className="rounded-xl border border-[#cfe8d9] bg-[#eefaf2] px-3 py-2 text-sm text-[#247046]">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]">
          {error}
        </p>
      )}
    </section>
  );
}
