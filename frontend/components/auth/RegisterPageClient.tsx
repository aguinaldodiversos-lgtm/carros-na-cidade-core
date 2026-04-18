"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { clearClientAuthArtifacts } from "@/lib/auth/client-session-reset";

type SubmitState =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function pickErrorMessage(payload: { error?: unknown; message?: unknown }): string | undefined {
  const e = payload.error;
  const m = payload.message;
  if (typeof e === "string" && e.trim()) return e;
  if (typeof m === "string" && m.trim()) return m;
  if (m && typeof m === "object" && "message" in m) {
    const nested = (m as { message?: unknown }).message;
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return undefined;
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-8 w-8" fill="none">
      <path
        d="M12 3 4 6v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V6l-8-3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m9 12 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-8 w-8" fill="none">
      <path
        d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 8a4 4 0 1 0 4 4h-4V8Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMegaphone() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-8 w-8" fill="none">
      <path
        d="M4 10v4a2 2 0 0 0 2 2h2l5 3v-12l-5 3H6a2 2 0 0 0-2 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M18 8a6 6 0 0 1 0 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function RegisterPageClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message: "",
  });

  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const passwordValid = password.length >= 6;
  const canSubmit = emailValid && passwordValid && acceptTerms;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isSubmitting) {
      setSubmitState({
        tone: "error",
        message: "Informe e-mail válido, senha (mínimo 6 caracteres) e aceite os termos.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitState({ tone: "idle", message: "" });

      clearClientAuthArtifacts();

      const response = await fetch("/api/auth/register", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Não foi possível concluir o cadastro agora.";

        try {
          const errorPayload = (await response.json()) as {
            error?: unknown;
            message?: unknown;
          };
          errorMessage = pickErrorMessage(errorPayload) ?? errorMessage;
        } catch {
          // fallback silencioso
        }

        throw new Error(errorMessage);
      }

      const data = (await response.json()) as { redirect_to?: string };
      setSubmitState({
        tone: "success",
        message: "Cadastro realizado com sucesso. Redirecionando...",
      });

      setTimeout(() => {
        router.push(data.redirect_to ?? "/dashboard");
        router.refresh();
      }, 500);
    } catch (error) {
      setSubmitState({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao cadastrar.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-[#F5F7FB]">
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-start lg:gap-12">
          <div className="max-w-2xl">
            <h1 className="text-[36px] font-extrabold leading-[1.08] tracking-[-0.03em] text-[#1D2440] md:text-[48px] lg:text-[52px]">
              Cadastre-se
              <br />
              <span className="text-[#1F66E5]">e anuncie com facilidade.</span>
            </h1>

            <p className="mt-5 text-[17px] leading-relaxed text-[#5D667D] md:text-[18px]">
              Encontre e venda veículos de forma simples e segura.
            </p>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              <div className="rounded-2xl border border-[#E7EAF3] bg-white/90 p-5 shadow-[0_8px_24px_rgba(16,28,58,0.04)]">
                <div className="text-[#1F66E5]">
                  <IconShield />
                </div>
                <div className="mt-3 text-[15px] font-extrabold text-[#1D2440]">
                  Segurança e Confiança
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#6E748A]">
                  Ambiente pensado para transações com mais transparência.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E7EAF3] bg-white/90 p-5 shadow-[0_8px_24px_rgba(16,28,58,0.04)]">
                <div className="text-[#1F66E5]">
                  <IconSpark />
                </div>
                <div className="mt-3 text-[15px] font-extrabold text-[#1D2440]">Praticidade</div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#6E748A]">
                  Fluxo direto para você começar rápido e sem complicação.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E7EAF3] bg-white/90 p-5 shadow-[0_8px_24px_rgba(16,28,58,0.04)]">
                <div className="text-[#1F66E5]">
                  <IconMegaphone />
                </div>
                <div className="mt-3 text-[15px] font-extrabold text-[#1D2440]">Publique Fácil</div>
                <p className="mt-2 text-[14px] leading-relaxed text-[#6E748A]">
                  Ferramentas claras para colocar seu veículo em destaque.
                </p>
              </div>
            </div>
          </div>

          <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_20px_48px_rgba(16,28,58,0.08)] md:p-8">
            <div className="mb-6">
              <h2 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#1D2440] md:text-[28px]">
                Criar sua conta
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-[#6E748A]">
                Use seu e-mail e defina uma senha para acessar o painel.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">E-mail</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="voce@exemplo.com"
                  autoComplete="email"
                  className="h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] focus:ring-2 focus:ring-[#1F66E5]/20"
                />
                {email && !emailValid ? (
                  <p className="mt-2 text-[13px] font-medium text-[#C2410C]">
                    Informe um e-mail válido.
                  </p>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  className="h-[52px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5] focus:ring-2 focus:ring-[#1F66E5]/20"
                />
                {password && !passwordValid ? (
                  <p className="mt-2 text-[13px] font-medium text-[#C2410C]">
                    A senha deve ter no mínimo 6 caracteres.
                  </p>
                ) : null}
              </label>

              <label className="flex items-start gap-3 rounded-[16px] border border-[#E7EAF3] bg-[#FBFCFF] px-4 py-4">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(event) => setAcceptTerms(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-[#CBD5E1] text-[#1F66E5] focus:ring-[#1F66E5]"
                />
                <span className="text-[14px] leading-6 text-[#5D667D]">
                  Declaro que aceito os{" "}
                  <Link href="/termos-de-uso" className="font-bold text-[#1F66E5] hover:underline">
                    Termos de uso
                  </Link>{" "}
                  e a{" "}
                  <Link
                    href="/politica-de-privacidade"
                    className="font-bold text-[#1F66E5] hover:underline"
                  >
                    Política de privacidade
                  </Link>
                  .
                </span>
              </label>

              {submitState.tone !== "idle" ? (
                <div
                  className={`rounded-[16px] border px-4 py-3 text-[14px] font-medium ${
                    submitState.tone === "success"
                      ? "border-[#BBE7C8] bg-[#EEF9F1] text-[#166534]"
                      : "border-[#F4C7C3] bg-[#FFF4F3] text-[#B42318]"
                  }`}
                  role="status"
                >
                  {submitState.message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className="inline-flex h-[54px] w-full items-center justify-center rounded-[16px] bg-[#1F66E5] px-6 text-[17px] font-extrabold text-white transition hover:bg-[#1758CC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Cadastrando..." : "Cadastrar"}
              </button>

              <p className="text-center text-[14px] text-[#6E748A]">
                Já tem conta?{" "}
                <Link href="/login" className="font-bold text-[#1F66E5] hover:underline">
                  Entrar
                </Link>
              </p>
            </form>
          </section>
        </div>
      </section>
    </div>
  );
}
