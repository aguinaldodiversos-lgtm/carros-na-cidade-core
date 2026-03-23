"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatBrazilianDocument,
  isValidBrazilianDocument,
  onlyDigits,
  type BrazilianDocumentType,
} from "@/lib/validation/document";

type RegisterFormState = {
  name: string;
  email: string;
  password: string;
  phone: string;
  city: string;
  documentType: BrazilianDocumentType;
  document: string;
  acceptTerms: boolean;
};

type SubmitState =
  | { tone: "idle"; message: string }
  | { tone: "success"; message: string }
  | { tone: "error"; message: string };

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value: string) {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export default function RegisterPageClient() {
  const router = useRouter();

  const [form, setForm] = useState<RegisterFormState>({
    name: "",
    email: "",
    password: "",
    phone: "",
    city: "",
    documentType: "cpf",
    document: "",
    acceptTerms: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>({
    tone: "idle",
    message: "",
  });

  const emailValid = useMemo(() => isValidEmail(form.email), [form.email]);
  const phoneValid = useMemo(() => isValidPhone(form.phone), [form.phone]);
  const documentValid = useMemo(
    () => isValidBrazilianDocument(form.document, form.documentType),
    [form.document, form.documentType]
  );

  const passwordValid = form.password.length >= 8;
  const canSubmit =
    form.name.trim().length >= 3 &&
    form.city.trim().length >= 2 &&
    emailValid &&
    passwordValid &&
    phoneValid &&
    documentValid &&
    form.acceptTerms;

  function updateField<K extends keyof RegisterFormState>(
    field: K,
    value: RegisterFormState[K]
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleDocumentTypeChange(type: BrazilianDocumentType) {
    setForm((current) => ({
      ...current,
      documentType: type,
      document: "",
    }));
    setSubmitState({ tone: "idle", message: "" });
  }

  function handleSubmitDocument() {
    return {
      type: form.documentType,
      value: onlyDigits(form.document),
      isValid: documentValid,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isSubmitting) {
      setSubmitState({
        tone: "error",
        message:
          "Preencha corretamente nome, e-mail, telefone, cidade e CPF/CNPJ válido para continuar.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitState({ tone: "idle", message: "" });

      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        phone: onlyDigits(form.phone) || undefined,
        city: form.city.trim() || undefined,
        document_type: form.documentType,
        document_number: documentValid ? onlyDigits(form.document) : undefined,
      };

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let errorMessage = "Não foi possível concluir o cadastro agora.";

        try {
          const errorPayload = (await response.json()) as {
            error?: string;
            message?: string;
          };

          errorMessage =
            errorPayload.message ||
            errorPayload.error ||
            errorMessage;
        } catch {
          // fallback silencioso
        }

        throw new Error(errorMessage);
      }

      const data = (await response.json()) as { redirect_to?: string };
      setSubmitState({
        tone: "success",
        message:
          "Cadastro realizado com sucesso. Redirecionando...",
      });

      setTimeout(() => {
        router.push(data.redirect_to ?? "/dashboard");
        router.refresh();
      }, 500);
    } catch (error) {
      setSubmitState({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Erro inesperado ao cadastrar.",
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
                Cadastro seguro
              </span>

              <h1 className="mt-4 text-[34px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#1D2440] md:text-[52px]">
                Crie sua conta para anunciar no Carros na Cidade
              </h1>

              <p className="mt-4 text-[18px] leading-8 text-[#5D667D] md:text-[20px]">
                Faça seu cadastro com validação de CPF ou CNPJ para aumentar a
                segurança da plataforma e reduzir fraudes no portal.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">
                  Documento validado
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  CPF ou CNPJ precisa ser matematicamente válido para seguir.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">
                  Perfil mais confiável
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  Dados mínimos para dar mais credibilidade aos anúncios.
                </p>
              </div>

              <div className="rounded-[20px] border border-[#E7EAF3] bg-[#FBFCFF] p-4">
                <div className="text-[14px] font-extrabold text-[#1D2440]">
                  Pronto para anunciar
                </div>
                <p className="mt-2 text-[14px] leading-6 text-[#6E748A]">
                  Depois do cadastro, o usuário já pode entrar e publicar.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-[24px] border border-[#E7EAF3] bg-[linear-gradient(135deg,#16326a_0%,#0d1a38_100%)] p-6 text-white">
              <h2 className="text-[24px] font-extrabold">
                Menos fraude, mais confiança no portal
              </h2>
              <p className="mt-3 text-[16px] leading-7 text-white/80">
                A validação de CPF/CNPJ no cadastro ajuda a filtrar perfis
                inconsistentes e melhora a qualidade geral dos anúncios.
              </p>
            </div>
          </div>

          <section className="rounded-[28px] border border-[#E5E9F2] bg-white p-6 shadow-[0_16px_36px_rgba(16,28,58,0.06)] md:p-8">
            <div className="mb-6">
              <h2 className="text-[30px] font-extrabold tracking-[-0.03em] text-[#1D2440]">
                Criar conta
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-[#6E748A]">
                Preencha os dados abaixo para continuar.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                  Nome completo
                </span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => updateField("name", event.target.value)}
                  placeholder="Digite seu nome completo"
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                  E-mail
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="voce@exemplo.com"
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                />
                {form.email && !emailValid ? (
                  <p className="mt-2 text-[13px] font-medium text-[#C2410C]">
                    Informe um e-mail válido.
                  </p>
                ) : null}
              </label>

              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                  Senha
                </span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                />
                {form.password && !passwordValid ? (
                  <p className="mt-2 text-[13px] font-medium text-[#C2410C]">
                    A senha deve ter no mínimo 8 caracteres.
                  </p>
                ) : null}
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                    Telefone
                  </span>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(event) =>
                      updateField("phone", formatPhone(event.target.value))
                    }
                    placeholder="(17) 99999-9999"
                    className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                  />
                  {form.phone && !phoneValid ? (
                    <p className="mt-2 text-[13px] font-medium text-[#C2410C]">
                      Informe um telefone com DDD válido.
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                    Cidade
                  </span>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(event) => updateField("city", event.target.value)}
                    placeholder="Ex.: São José do Rio Preto - SP"
                    className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                  />
                </label>
              </div>

              <div>
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                  Tipo de documento
                </span>

                <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-[#F3F6FB] p-1">
                  <button
                    type="button"
                    onClick={() => handleDocumentTypeChange("cpf")}
                    className={`inline-flex h-[46px] items-center justify-center rounded-[12px] text-[14px] font-bold transition ${
                      form.documentType === "cpf"
                        ? "bg-white text-[#1D2440] shadow-sm"
                        : "text-[#778199]"
                    }`}
                  >
                    Pessoa física (CPF)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDocumentTypeChange("cnpj")}
                    className={`inline-flex h-[46px] items-center justify-center rounded-[12px] text-[14px] font-bold transition ${
                      form.documentType === "cnpj"
                        ? "bg-white text-[#1D2440] shadow-sm"
                        : "text-[#778199]"
                    }`}
                  >
                    Pessoa jurídica (CNPJ)
                  </button>
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-[14px] font-semibold text-[#33405A]">
                  {form.documentType === "cpf" ? "CPF" : "CNPJ"}
                </span>
                <input
                  type="text"
                  value={form.document}
                  onChange={(event) =>
                    updateField(
                      "document",
                      formatBrazilianDocument(
                        event.target.value,
                        form.documentType
                      )
                    )
                  }
                  placeholder={
                    form.documentType === "cpf"
                      ? "000.000.000-00"
                      : "00.000.000/0000-00"
                  }
                  className="h-[54px] w-full rounded-[14px] border border-[#E5E9F2] bg-white px-4 text-[16px] text-[#1D2440] outline-none transition focus:border-[#1F66E5]"
                />

                {form.document ? (
                  <p
                    className={`mt-2 text-[13px] font-semibold ${
                      documentValid ? "text-[#15803D]" : "text-[#C2410C]"
                    }`}
                  >
                    {documentValid
                      ? `${form.documentType.toUpperCase()} válido`
                      : `${form.documentType.toUpperCase()} inválido`}
                  </p>
                ) : null}
              </label>

              <label className="flex items-start gap-3 rounded-[16px] border border-[#E7EAF3] bg-[#FBFCFF] px-4 py-4">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(event) =>
                    updateField("acceptTerms", event.target.checked)
                  }
                  className="mt-1 h-4 w-4 rounded border-[#CBD5E1]"
                />
                <span className="text-[14px] leading-6 text-[#5D667D]">
                  Declaro que os dados informados são verdadeiros e aceito os{" "}
                  <Link
                    href="/termos-de-uso"
                    className="font-bold text-[#1F66E5] hover:underline"
                  >
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
                <Link
                  href="/login"
                  className="font-bold text-[#1F66E5] hover:underline"
                >
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
