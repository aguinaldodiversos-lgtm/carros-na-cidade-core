import { notFound, permanentRedirect } from "next/navigation";
import { fetchAdDetail } from "../../../lib/ads/ad-detail";

interface AdDetailPageProps {
  params: {
    identifier: string;
  };
}

export const dynamic = "force-dynamic";

export default async function AdDetailPage({ params }: AdDetailPageProps) {
  const ad = await fetchAdDetail(params.identifier);
  if (!ad) notFound();
  permanentRedirect(`/veiculo/${ad.slug || ad.id}`);
}
