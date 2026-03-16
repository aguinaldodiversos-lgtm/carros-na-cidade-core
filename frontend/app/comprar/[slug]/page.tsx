import { redirect } from "next/navigation";

type PageProps = {
  params: {
    slug: string;
  };
};

export const revalidate = 60;

export default function LegacyVehicleDetailsRoute({ params }: PageProps) {
  redirect(`/veiculo/${params.slug}`);
}
