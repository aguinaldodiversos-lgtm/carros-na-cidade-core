"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type HeaderProps = {
  boxed?: boolean;
};

const navItems = [
  { label: "Anunciar", href: "/anunciar" },
  { label: "Favoritos", href: "/favoritos" },
  { label: "Planos", href: "/planos" },
];

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20.5s-7.25-4.35-7.25-10.1a4.2 4.2 0 0 1 7.25-2.7 4.2 4.2 0 0 1 7.25 2.7c0 5.75-7.25 10.1-7.25 10.1Z" />
    </svg>
  );
}

export default function Header({ boxed = false }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className={`${boxed ? "pt-3 md:pt-6" : "border-b border-[#e4e7f0] bg-white"} sticky top-0 z-40`}>
      <div className="mx-auto w-full max-w-7xl px-3 sm:px-4 md:px-6">
        <div
          className={`flex items-center justify-between px-2 ${
            boxed ? "h-[74px] rounded-2xl border border-[#e4e7f0] bg-white md:h-[86px]" : "h-[70px] md:h-[82px]"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-5">
            <Link href="/" className="relative block h-10 w-[154px] shrink-0 sm:h-11 sm:w-[188px]">
              <Image src="/images/logo.png" alt="Carros na Cidade" fill priority className="object-contain object-left" />
            </Link>
            <button type="button" className="hidden items-center gap-2 text-[16px] font-bold text-[#20273a] lg:inline-flex">
              Sao Paulo
              <svg viewBox="0 0 20 20" className="h-5 w-5 text-[#0e62d8]" fill="currentColor">
                <path d="m5 7 5 6 5-6H5Z" />
              </svg>
            </button>
          </div>

          <nav className="hidden items-center gap-6 text-[16px] font-semibold text-[#333d54] md:flex">
            <Link href="/anunciar" className="transition hover:text-[#0e62d8]">
              Anunciar
            </Link>
            <Link href="/favoritos" className="transition hover:text-[#0e62d8]">
              Favoritos
            </Link>
            <Link href="/favoritos" aria-label="Favoritos" className="text-[#4f5a74] transition hover:text-[#0e62d8]">
              <HeartIcon />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-6 text-[16px] font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              Entrar
            </Link>
          </nav>

          <button
            type="button"
            onClick={() => setMobileOpen((state) => !state)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe4ef] md:hidden"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-[#34405a]" fill="none" stroke="currentColor" strokeWidth="2">
              {mobileOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <div className="md:hidden">
            <div className="mt-2 rounded-2xl border border-[#dfe4ef] bg-white p-3 shadow-[0_12px_24px_rgba(16,28,58,0.12)]">
              <nav className="grid gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="inline-flex h-11 items-center rounded-xl px-3 text-[16px] font-semibold text-[#2c3853] hover:bg-[#f0f4fc]"
                  >
                    {item.label}
                  </Link>
                ))}
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="mt-1 inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-4 text-[16px] font-bold text-white"
                >
                  Entrar
                </Link>
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
