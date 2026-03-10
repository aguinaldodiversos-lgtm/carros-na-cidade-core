"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { label: "Comprar", href: "/anuncios" },
  { label: "Vender", href: "/vender" },
  { label: "Planos", href: "/planos" },
  { label: "Tabela FIPE", href: "/tabela-fipe" },
  { label: "Financiar", href: "/financiar" },
  { label: "Notícias", href: "/noticias" },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e4e7f0] bg-white/95 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4">
        <div className="flex h-[74px] items-center justify-between gap-4">
          <Link href="/" className="relative block h-10 w-[170px] shrink-0 sm:w-[190px]">
            <Image src="/images/logo.png" alt="Carros na Cidade" fill priority className="object-contain object-left" />
          </Link>

          <nav className="hidden items-center gap-5 lg:flex">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-bold transition ${active ? "text-[#0e62d8]" : "text-[#33405d] hover:text-[#0e62d8]"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 sm:flex">
            <Link href="/entrar" className="rounded-xl border border-[#d7ddeb] px-4 py-2 text-sm font-bold text-[#28344f]">Entrar</Link>
            <Link href="/entrar?next=/painel" className="rounded-xl border border-[#d7ddeb] px-4 py-2 text-sm font-bold text-[#28344f]">Sou lojista</Link>
            <Link href="/vender" className="rounded-xl bg-[#0e62d8] px-4 py-2 text-sm font-extrabold text-white">Anunciar</Link>
          </div>

          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d7ddeb] lg:hidden"
          >
            <span className="text-xl text-[#33405d]">☰</span>
          </button>
        </div>

        {open && (
          <div className="pb-4 lg:hidden">
            <nav className="grid gap-2 rounded-2xl border border-[#dfe4ef] bg-white p-3">
              {links.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-sm font-bold text-[#33405d] hover:bg-[#f3f7ff]">
                  {link.label}
                </Link>
              ))}
              <Link href="/entrar" onClick={() => setOpen(false)} className="rounded-xl border border-[#d7ddeb] px-3 py-2 text-center text-sm font-bold text-[#28344f]">Entrar</Link>
              <Link href="/entrar?next=/painel" onClick={() => setOpen(false)} className="rounded-xl border border-[#d7ddeb] px-3 py-2 text-center text-sm font-bold text-[#28344f]">Sou lojista</Link>
              <Link href="/vender" onClick={() => setOpen(false)} className="rounded-xl bg-[#0e62d8] px-3 py-2 text-center text-sm font-extrabold text-white">Anunciar</Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
