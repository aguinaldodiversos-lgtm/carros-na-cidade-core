// frontend/components/shell/PublicFooter.tsx
import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="mt-10 border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 md:grid-cols-4 md:px-6">
        <div>
          <div className="text-base font-extrabold text-zinc-900">
            Carros na Cidade
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Portal de carros por cidade, com busca inteligente e páginas locais.
          </p>
        </div>

        <div>
          <div className="text-sm font-semibold text-zinc-900">Portal</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/anuncios">
                Anúncios
              </Link>
            </li>
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/planos">
                Planos
              </Link>
            </li>
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/blog">
                Notícias
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-zinc-900">Para lojistas</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/dashboard-loja">
                Painel da loja
              </Link>
            </li>
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/vender">
                Anunciar veículos
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="text-sm font-semibold text-zinc-900">Legal</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/termos">
                Termos
              </Link>
            </li>
            <li>
              <Link className="text-zinc-600 hover:text-zinc-900" href="/privacidade">
                Privacidade
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-zinc-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 text-xs text-zinc-500 md:px-6">
          <span>© {new Date().getFullYear()} Carros na Cidade</span>
          <span>Feito para SEO local em escala</span>
        </div>
      </div>
    </footer>
  );
}
