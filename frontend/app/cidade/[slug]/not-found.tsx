import Link from "next/link";

export default function CityNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-4 text-3xl font-extrabold text-[#1e293b]">Cidade não encontrada</h1>
      <p className="mb-8 text-lg text-[#64748b]">
        A cidade que você procura ainda não está cadastrada no Carros na Cidade.
        Estamos expandindo nossa cobertura para mais de 5.500 municípios brasileiros.
      </p>
      <div className="flex gap-4">
        <Link
          href="/anuncios"
          className="rounded-xl bg-[#0e62d8] px-6 py-3 font-bold text-white transition hover:bg-[#0b4fad]"
        >
          Ver todos os anúncios
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-[#d1d9e6] px-6 py-3 font-bold text-[#334155] transition hover:bg-[#f8fafc]"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
