import Link from "next/link";

/**
 * Segment-level 404 da rota `/lojas/[slug]`. Disparado por
 * `notFound()` na page quando `fetchPublicDealer` devolve null
 * (loja inexistente, inativa ou bloqueada).
 *
 * Briefing 2026-05-25 (Lojas Públicas): mantém empty state honesto,
 * sem inventar lista vazia. Status HTTP é 404 real porque a
 * `dynamic = "force-dynamic"` na page comita o status antes da
 * renderização (mesma estratégia de `/veiculo/[slug]`).
 */
export default function DealerNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-cnc-text-strong sm:text-3xl">
        Loja não encontrada
      </h1>
      <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-cnc-muted">
        Esta loja não está disponível no momento, ou o endereço pode ter mudado. Que tal explorar
        nossas ofertas?
      </p>
      <Link
        href="/comprar"
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
      >
        Ver carros disponíveis
      </Link>
    </main>
  );
}
