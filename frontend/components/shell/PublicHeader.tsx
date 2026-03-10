// frontend/components/shell/PublicHeader.tsx
import Link from "next/link";

const NAV_LINKS = [
  { href: "/comprar", label: "Comprar" },
  { href: "/vender", label: "Vender" },
  { href: "/planos", label: "Planos" },
  { href: "/tabela-fipe", label: "Tabela FIPE" },
  { href: "/simulador-financiamento", label: "Financiar" },
  { href: "/blog", label: "Notícias" },
];

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
        {/* Logo + marca */}
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
            🚗
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold text-zinc-900">
              Carros na Cidade
            </div>
            <div className="text-xs text-zinc-500">Portal automotivo</div>
          </div>
        </Link>

        {/* “Cidade” (por enquanto simples) */}
        <div className="hidden items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 md:flex">
          <span className="text-zinc-500">📍</span>
          <span className="font-medium">São Paulo</span>
          <span className="text-zinc-400">▾</span>
        </div>

        {/* Links */}
        <nav className="ml-auto hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-zinc-700 transition hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Ações */}
        <div className="ml-auto flex items-center gap-2 lg:ml-6">
          <Link
            href="/favoritos"
            className="hidden rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 md:inline-flex"
          >
            ♥ Favoritos
          </Link>

          <Link
            href="/login"
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Entrar
          </Link>
        </div>
      </div>
    </header>
  );
}
