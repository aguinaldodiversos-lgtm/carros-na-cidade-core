import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 md:grid-cols-3 md:px-6">
        <div>
          <div className="text-lg font-extrabold text-zinc-900">Carros na Cidade</div>
          <p className="mt-2 text-sm text-zinc-500">
            Portal automotivo territorial com busca inteligente e páginas locais.
          </p>
        </div>

        <div className="text-sm">
          <div className="font-semibold text-zinc-900">Portal</div>
          <div className="mt-3 grid gap-2 text-zinc-600">
            <Link href="/anuncios" className="hover:text-zinc-900">Anúncios</Link>
            <Link href="/planos" className="hover:text-zinc-900">Planos</Link>
            <Link href="/tabela-fipe" className="hover:text-zinc-900">Tabela FIPE</Link>
          </div>
        </div>

        <div className="text-sm">
          <div className="font-semibold text-zinc-900">Conta</div>
          <div className="mt-3 grid gap-2 text-zinc-600">
            <Link href="/login" className="hover:text-zinc-900">Entrar</Link>
            <Link href="/recuperar-senha" className="hover:text-zinc-900">Recuperar senha</Link>
            <Link href="/dashboard" className="hover:text-zinc-900">Painel</Link>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 py-4 text-center text-xs text-zinc-500">
        © {new Date().getFullYear()} Carros na Cidade. Todos os direitos reservados.
      </div>
    </footer>
  );
}
