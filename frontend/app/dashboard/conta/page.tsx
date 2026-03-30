import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dados pessoais",
  description: "Informações da sua conta.",
};

export default function ContaPfPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0f172a]">Dados pessoais</h1>
        <p className="mt-2 text-sm text-[#64748b]">
          Em breve você poderá atualizar nome, telefone e documentos por aqui. Por enquanto, use o
          suporte se precisar alterar dados sensíveis.
        </p>
      </div>
      <div className="rounded-2xl border border-[#e8ecf4] bg-white p-6 shadow-sm">
        <p className="text-sm text-[#475569]">
          Preferiu alterar a senha?{" "}
          <Link href="/recuperar-senha" className="font-bold text-[#0e62d8] hover:underline">
            Recuperar senha
          </Link>
        </p>
      </div>
    </div>
  );
}
