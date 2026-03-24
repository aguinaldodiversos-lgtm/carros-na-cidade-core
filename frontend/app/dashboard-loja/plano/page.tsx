import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Plano e cobranças",
  description: "Planos e pagamentos.",
};

export default function LojaPlanoPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-extrabold text-[#0f172a]">Plano e cobranças</h1>
      <p className="text-sm text-[#64748b]">
        Veja os planos disponíveis e escolha o melhor para a operação da sua loja.
      </p>
      <Link
        href="/planos"
        className="inline-flex h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-6 text-sm font-bold text-white"
      >
        Ver planos
      </Link>
    </div>
  );
}
