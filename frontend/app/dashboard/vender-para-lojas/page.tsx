import type { Metadata } from "next";
import Link from "next/link";
import SaleRequestsList from "@/components/account/SaleRequestsList";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Vender para lojas",
  description: "Veículos que você enviou para as lojas avaliarem.",
  alternates: { canonical: "/dashboard/vender-para-lojas" },
};

export const dynamic = "force-dynamic";

/**
 * "Minhas solicitações" — a lista do dono.
 *
 * `requirePfDashboardSession` é conveniência de NAVEGAÇÃO (redireciona quem não
 * tem sessão de PF), não autorização. Quem recusa conta CNPJ é o backend, no
 * service, com 403 e código estável — o painel não é barreira nenhuma para quem
 * fala HTTP.
 */
export default async function VenderParaLojasPage() {
  await requirePfDashboardSession();

  return (
    <section>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">Vender para lojas</h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
            Cadastre o seu veículo para que as lojas da sua cidade possam avaliá-lo.
          </p>
        </div>

        <Link
          href="/dashboard/vender-para-lojas/nova"
          className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110"
          data-testid="sale-request-new-link"
        >
          Enviar meu carro
        </Link>
      </header>

      <SaleRequestsList />
    </section>
  );
}
