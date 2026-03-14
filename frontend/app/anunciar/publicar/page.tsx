import SellPublishFlowClient from "@/components/sell/SellPublishFlowClient";

type PageProps = {
  searchParams?: {
    tipo?: string;
  };
};

export default function SellPublishPage({ searchParams }: PageProps) {
  const tipo =
    searchParams?.tipo === "lojista" || searchParams?.tipo === "particular"
      ? searchParams.tipo
      : "particular";

  return <SellPublishFlowClient initialType={tipo} />;
}
