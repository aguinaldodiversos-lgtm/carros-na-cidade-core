import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { fetchAdDetail } from "../../../lib/ads/ad-detail";

interface AdDetailPageProps {
  params: {
    identifier: string;
  };
}

// `force-dynamic` (NÃO `revalidate`) — empiricamente verificado em
// produção 2026-05-24 com Next 14.2.35: `revalidate=N` + segment-level
// `not-found.tsx` continua devolvendo HTTP 200 quando `notFound()` é
// chamado (soft-404). Já `force-dynamic` + `notFound()` em
// `generateMetadata` comita HTTP 404 real — comportamento confirmado
// nas rotas irmãs `/carros-em/[slug]` e `/carros-usados/regiao/[slug]`,
// que mantiveram `force-dynamic`. Esta rota não pode ser ISR enquanto
// o Next 14.2 apresentar esse soft-404 (rota é alias para
// /veiculo/[slug] e precisa do mesmo contrato de status).
export const dynamic = "force-dynamic";

/**
 * Comita HTTP 404 ANTES do Page rodar quando o anúncio não existe.
 *
 * Next 14.2.35: `notFound()` chamado só no Page renderiza o body do
 * not-found.tsx mas comita HTTP 200. A correção do briefing 2026-05-24
 * exige status 404 real. Chamar `notFound()` aqui força o Next a
 * comitar o status code antes do redirect. O segment-level
 * `not-found.tsx` cuida do body + status code juntos.
 */
export async function generateMetadata({ params }: AdDetailPageProps): Promise<Metadata> {
  const ad = await fetchAdDetail(params.identifier);
  if (!ad) notFound();
  return {
    // Esta rota só redireciona — metadata real vive em /veiculo/[slug].
    // robots: noindex evita Googlebot indexar o alias.
    robots: { index: false, follow: true },
  };
}

export default async function AdDetailPage({ params }: AdDetailPageProps) {
  const ad = await fetchAdDetail(params.identifier);
  if (!ad) notFound();
  permanentRedirect(`/veiculo/${ad.slug || ad.id}`);
}
