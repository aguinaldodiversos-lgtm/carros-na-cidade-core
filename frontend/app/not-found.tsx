import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Página não encontrada | Carros na Cidade",
  description: "A página que você está tentando acessar não existe ou foi removida.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-[#f4f6fa] px-4">
      <div className="w-full max-w-lg text-center">
        <p className="text-[80px] font-extrabold text-[#d4daea]">404</p>
        <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-[#1d2538]">
          Página não encontrada
        </h1>
        <p className="mt-3 text-[15px] leading-6 text-[#5c6881]">
          O endereço que você tentou acessar não existe ou foi removido.
          Verifique o link ou navegue pelo portal.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ir para a home
          </Link>
          <Link
            href="/comprar"
            className="inline-flex items-center justify-center rounded-xl border border-[#d4daea] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]"
          >
            Buscar veículos
          </Link>
        </div>
      </div>
    </main>
  );
}
