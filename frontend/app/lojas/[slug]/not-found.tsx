import Link from "next/link";

import { SiteBottomNav } from "@/components/shell/SiteBottomNav";

/**
 * Segment-level 404 da rota `/lojas/[slug]`. Disparado por
 * `notFound()` em `generateMetadata` (mesma estratégia do
 * `/veiculo/[slug]/page.tsx` — comita HTTP 404 real em Next 14.2).
 *
 * Briefing 2026-05-25 (Lojas Públicas): mantém empty state honesto.
 * Mobile-first: H1 menor no celular, CTA com altura mínima 44px
 * (touch target), padding bottom reserva espaço para SiteBottomNav.
 */
export default function DealerNotFound() {
  return (
    <>
      <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col items-center justify-center px-4 pb-24 pt-10 text-center sm:px-6 sm:pb-16 sm:pt-16">
        <h1 className="text-xl font-extrabold tracking-tight text-cnc-text-strong sm:text-2xl md:text-3xl">
          Loja não encontrada
        </h1>
        <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-cnc-muted sm:text-[14.5px]">
          Esta loja não está disponível no momento, ou o endereço pode ter mudado. Que tal explorar
          nossas ofertas?
        </p>
        <Link
          href="/comprar"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-strong"
        >
          Ver carros disponíveis
        </Link>
      </main>
      <SiteBottomNav />
    </>
  );
}
