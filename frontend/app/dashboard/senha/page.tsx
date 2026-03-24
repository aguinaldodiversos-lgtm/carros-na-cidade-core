import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trocar senha",
  description: "Segurança da conta.",
};

export default function SenhaPfPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-[#0f172a]">Trocar senha</h1>
      <p className="text-sm text-[#64748b]">
        Para redefinir sua senha com segurança, utilize o fluxo de recuperação por e-mail.
      </p>
      <Link
        href="/recuperar-senha"
        className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-6 text-sm font-bold text-white"
      >
        Abrir recuperação de senha
      </Link>
    </div>
  );
}
