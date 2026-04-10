import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-6xl font-bold text-blue-600">404</h1>
      <h2 className="mt-4 text-2xl font-semibold text-gray-900">
        Página não encontrada
      </h2>
      <p className="mt-2 max-w-md text-gray-500">
        A página que você procura não existe ou foi movida. Verifique o endereço
        ou volte para a página inicial.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/"
          className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Página inicial
        </Link>
        <Link
          href="/comprar"
          className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          Ver anúncios
        </Link>
      </div>
    </div>
  );
}
