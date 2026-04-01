"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type LoginResponse = {
  error?: string;
  redirect_to?: string;
};

type LoginFormProps = {
  next?: string;
};

export default function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      clearClientAuthArtifacts();

      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          next,
        }),
      });

      const payload = (await response.json()) as LoginResponse;
      if (!response.ok) {
        setError(payload.error ?? "Nao foi possivel autenticar.");
        setLoading(false);
        return;
      }

      setLoading(false);
      const destination = payload.redirect_to ?? "/dashboard";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Falha na conexao. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-md rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_4px_24px_rgba(16,25,45,0.08)] sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wide text-[#5a6884]">
          Acesso do anunciante
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[#1c253a]">Entrar</h1>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-[#37425d]">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="cnc-input"
            placeholder="voce@exemplo.com"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-[#37425d]">Senha</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="cnc-input"
            placeholder="******"
            required
          />
        </label>

        {error && (
          <p className="rounded-xl border border-[#f1c7cf] bg-[#fff2f5] px-3 py-2 text-sm text-[#bb2f47]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="cnc-btn-primary h-12 w-full text-base disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <div className="mt-5 grid gap-2 text-sm">
        <Link href="/recuperar-senha" className="font-semibold text-[#0e62d8] hover:text-[#0c4fb0]">
          Esqueci minha senha
        </Link>
        <Link href="/cadastro" className="font-semibold text-[#0e62d8] hover:text-[#0c4fb0]">
          Criar conta
        </Link>
      </div>
    </section>
  );
}
