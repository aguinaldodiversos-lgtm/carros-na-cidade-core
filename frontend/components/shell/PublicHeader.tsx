"use client";

import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        <Link href="/" className="text-lg font-extrabold text-zinc-900">
          Carros na Cidade
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-semibold text-zinc-700 md:flex">
          <Link href="/comprar" className="hover:text-zinc-900">Comprar</Link>
          <Link href="/vender" className="hover:text-zinc-900">Vender</Link>
          <Link href="/planos" className="hover:text-zinc-900">Planos</Link>
          <Link href="/tabela-fipe" className="hover:text-zinc-900">Tabela FIPE</Link>
          <Link href="/simulador-financiamento" className="hover:text-zinc-900">Financiar</Link>
          <Link href="/blog" className="hover:text-zinc-900">Notícias</Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Entrar
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Sou lojista
          </Link>
          <Link
            href="/vender"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Anunciar
          </Link>
        </div>
      </div>
    </header>
  );
}
