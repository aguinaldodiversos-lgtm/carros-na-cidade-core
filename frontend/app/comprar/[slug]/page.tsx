import AdDetailsPage from "@/components/ads/AdDetailsPage";
import { getAdDetails } from "@/lib/ads/get-ad-details";

export const revalidate = 60;

type PageProps = {
  params: {
    slug: string;
  };
};

export default async function VehicleDetailsRoute({ params }: PageProps) {
  const ad = await getAdDetails(params.slug);

  return <AdDetailsPage ad={ad} />;
}
