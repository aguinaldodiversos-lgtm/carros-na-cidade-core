import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "E-mail confirmado! | Carros na Cidade",
  description: "Seu e-mail foi confirmado com sucesso. Acesse o portal Carros na Cidade.",
  robots: { index: false },
};

export default function EmailConfirmadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f6fa] px-4">
      <div className="w-full max-w-md rounded-3xl border border-[#dfe4ef] bg-white p-8 text-center shadow-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#dcf5e8]">
          <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-[#1a7a45]">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="mt-5 text-[24px] font-extrabold text-[#1d2538]">
          E-mail confirmado!
        </h1>
        <p className="mt-2 text-[15px] leading-6 text-[#5c6881]">
          Sua conta foi verificada com sucesso. Agora você pode acessar o portal completo.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-6 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Acessar minha conta
          </Link>
          <Link
            href="/"
            className="text-[14px] font-semibold text-[#6b7488] transition hover:text-[#0e62d8]"
          >
            Ir para a página inicial
          </Link>
        </div>
      </div>
    </main>
  );
}
