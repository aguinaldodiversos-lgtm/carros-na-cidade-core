import Link from "next/link";

/**
 * Segment-level not-found.tsx — mesmo workaround do Next 14.2.35 aplicado
 * em /veiculo/[slug]. Esta rota (/anuncios/[identifier]) é redirect 308
 * para /veiculo/[slug]; quando o anúncio não existe, o redirect não pode
 * acontecer e chamamos `notFound()` — o segment-level not-found garante
 * HTTP 404 real (em vez de 200 + global not-found body).
 *
 * NÃO fazer fetch aqui. NÃO recriar fallback fake.
 */
export default function AnuncioNotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#eef5ff] text-[#0e62d8]">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
      </div>

      <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">
        Veículo não encontrado
      </h1>

      <p className="mt-3 max-w-md text-[14.5px] leading-relaxed text-slate-600">
        Este anúncio pode ter sido removido pelo anunciante, expirado, ou está
        temporariamente indisponível. Não conseguimos exibir os dados deste
        veículo.
      </p>

      <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
        <Link
          href="/comprar/estado/sp"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#0e62d8] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#0a52b8]"
        >
          Ver carros em São Paulo
        </Link>
        <Link
          href="/anunciar"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[#0e62d8] bg-white px-5 text-[13.5px] font-bold text-[#0e62d8] transition hover:bg-[#eef5ff]"
        >
          Anunciar um veículo
        </Link>
      </div>
    </div>
  );
}
