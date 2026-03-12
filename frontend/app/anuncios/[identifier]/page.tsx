import { permanentRedirect } from "next/navigation";
import { fetchAdDetail } from "../../../lib/ads/ad-detail";

interface AdDetailPageProps {
  params: {
    identifier: string;
  };
}

export default async function AdDetailPage({ params }: AdDetailPageProps) {
  const ad = await fetchAdDetail(params.identifier);
  permanentRedirect(`/veiculo/${ad.slug || ad.id}`);
}
