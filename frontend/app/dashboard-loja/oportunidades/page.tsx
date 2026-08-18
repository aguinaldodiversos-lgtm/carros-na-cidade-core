import type { Metadata } from "next";
import Link from "next/link";
import { requireLojistaDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Oportunidades",
  description: "Oportunidades de negócio para a sua loja.",
  alternates: { canonical: "/dashboard-loja/oportunidades" },
};

export const dynamic = "force-dynamic";

/**
 * Hub de oportunidades da loja.
 *
 * Existe como página própria — e não como atalho direto para "Compradores
 * ativos" — porque é onde a Fase 3 pendura "Veículos para comprar". Criar o hub
 * agora custa uma tela simples; criá-lo depois custaria mudar a navegação, o
 * item de menu e todos os `action_path` já gravados em notificações.
 *
 * O segundo card chegou na Fase 4.3, e é exatamente a vaga que o parágrafo acima
 * reservava. Nenhuma rota mudou de lugar, nenhum item de menu foi criado e
 * nenhum `action_path` gravado precisou ser reescrito — que era o custo que o
 * hub existia para evitar.
 *
 * Continuam valendo as duas regras do hub: um card por produto que EXISTE, e
 * nada de card desabilitado anunciando o que ainda não foi construído.
 */
export default async function OportunidadesHubPage() {
  await requireLojistaDashboardSession();

  return (
    <section data-testid="dealer-opportunities-hub">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-[#161f34] sm:text-2xl">Oportunidades</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#64748b]">
          Negócios que começam fora do seu estoque.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[#e8ecf4] bg-white p-5">
          <h2 className="text-base font-bold text-[#161f34]">Compradores ativos</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
            Veja pessoas da sua cidade que estão procurando veículos.
          </p>
          <Link
            href="/dashboard-loja/oportunidades/compradores"
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 sm:w-auto"
            data-testid="dealer-opportunities-buyers-link"
          >
            Ver compradores ativos
          </Link>
        </article>

        <article className="rounded-2xl border border-[#e8ecf4] bg-white p-5">
          <h2 className="text-base font-bold text-[#161f34]">Veículos para avaliação</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#64748b]">
            Veículos enviados por proprietários particulares para avaliação de compra.
          </p>
          <Link
            href="/dashboard-loja/oportunidades/veiculos"
            className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-sm font-bold text-white shadow-[0_8px_24px_rgba(14,98,216,0.25)] transition hover:brightness-110 sm:w-auto"
            data-testid="dealer-opportunities-vehicles-link"
          >
            Ver veículos
          </Link>
        </article>
      </div>
    </section>
  );
}
