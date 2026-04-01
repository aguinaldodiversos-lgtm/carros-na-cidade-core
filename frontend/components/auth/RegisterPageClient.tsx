"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type SubmitState =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
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

      const response = await fetch("/api/auth/register", {
        method: "POST",
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
            error?: string;
            message?: string;
          };

          errorMessage = errorPayload.message || errorPayload.error || errorMessage;
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
    <main className="bg-[#F5F7FB]">
      <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-start">
          <div className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.05)] md:p-8">
            <div className="max-w-2xl">
              <span className="inline-flex rounded-full bg-[#EEF4FF] px-3 py-1 text-[12px] font-extrabold text-[#1F66E5]">
                Cadastro rápido
              </span>

              <h1 className="mt-4 text-[34px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#1D2440] md:text-[52px]">
                Crie sua conta no Carros na Cidade
              </h1>

              <p className="mt-4 text-[18px] leading-8 text-[#5D667D] md:text-[20px]">
                Use apenas e-mail e senha. CPF, CNPJ e demais dados cadastrais serão solicitados ao
                publicar o primeiro anúncio, quando fizer sentido para você e para a segurança da
                plataforma.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">Menos atrito</div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  Entre no painel em segundos e explore a conta antes de anunciar.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">Dados no momento certo</div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  Documento e tipo PF/PJ na primeira publicação, com validação adequada.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">Conta segura</div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  Senha com requisitos mínimos e sessão protegida nas áreas logadas.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[24px] border border-[#E7EAF3] bg-[linear-gradient(135deg,#16326a_0%,#0d1a38_100%)] p-6 text-white">
              <h2 className="text-[24px] font-extrabold">Painel acessível desde o primeiro acesso</h2>
              <p className="mt-3 text-[16px] leading-7 text-white/80">
                Você pode navegar no painel mesmo sem ter preenchido CPF ou CNPJ. Quando for
                anunciar, orientamos o complemento cadastral passo a passo.
              </p>
            </div>
          </div>

          <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.06)] md:p-8">
            <div className="mb-6">
              <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#1D2440]">
                Criar conta
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-[#6E748A]">
                E-mail, senha e aceite dos termos.
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
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
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
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
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
                  className="mt-1 h-4 w-4 rounded border-[#CBD5E1]"
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
                >
                  {submitState.message}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit || isSubmitting}
                className="inline-flex h-[56px] w-full items-center justify-center rounded-[16px] bg-[#1F66E5] px-6 text-[17px] font-extrabold text-white transition hover:bg-[#1758CC] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Criando conta..." : "Criar minha conta"}
              </button>

              <p className="text-center text-[14px] text-[#6E748A]">
                Já tem cadastro?{" "}
                <Link href="/login" className="font-bold text-[#1F66E5] hover:underline">
                  Entrar na conta
                </Link>
              </p>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
