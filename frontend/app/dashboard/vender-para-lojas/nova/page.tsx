import type { Metadata } from "next";
import Link from "next/link";
import SaleRequestForm from "@/components/account/SaleRequestForm";
import { requirePfDashboardSession } from "@/lib/account/dashboard-session";

export const metadata: Metadata = {
  title: "Enviar meu carro para as lojas",
  description: "Preencha a ficha do seu veículo para as lojas da sua cidade avaliarem.",
  alternates: { canonical: "/dashboard/vender-para-lojas/nova" },
};

export const dynamic = "force-dynamic";

/**
 * Segmento estático `nova` convive com o dinâmico `[id]` porque o App Router
 * resolve o literal primeiro — `/vender-para-lojas/nova` nunca cai no detalhe.
 * Mesmo arranjo já usado por `minhas-procuras/nova`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O TÍTULO VIVE NO FORMULÁRIO, NÃO AQUI
 * ────────────────────────────────────────────────────────────────────────────
 * O `h1` e o subtítulo saíram desta página e passaram para `SaleRequestForm`
 * porque o cabeçalho da ficha carrega o INDICADOR DE PROGRESSO, e o progresso é
 * derivado do estado do formulário. Mantê-lo aqui exigiria elevar o estado da
 * ficha inteira para um componente cliente acima desta página — ou duplicar o
 * cálculo em dois lugares, que é o defeito que esta evolução existe para
 * eliminar.
 *
 * A página continua sendo o Server Component que exige a sessão PF.
 */
export default async function NovaSolicitacaoPage() {
  await requirePfDashboardSession();

  return (
    <section>
      <Link
        href="/dashboard/vender-para-lojas"
        className="text-sm font-semibold text-[#0e62d8] hover:underline"
      >
        ← Vender para lojas
      </Link>

      <div className="mt-3">
        <SaleRequestForm basePath="/dashboard" />
      </div>
    </section>
  );
}
