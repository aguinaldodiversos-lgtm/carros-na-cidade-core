import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { fetchAdDetail } from "../../../lib/ads/ad-detail";

interface AdDetailPageProps {
  params: {
    identifier: string;
  };
}

// `revalidate` (NÃO `force-dynamic`) — Next 14.2 não comita HTTP 404
// em resposta streamed mesmo com `notFound()`. Com `revalidate` +
// segment-level `not-found.tsx`, a resposta é não-streamed e o status
// 404 é commitado corretamente. Rota é só alias/redirect para
// /veiculo/[slug]; 60s de cache não tem impacto visível.
export const revalidate = 60;

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
