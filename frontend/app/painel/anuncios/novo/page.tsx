import NewAdPageClient from "@/components/painel/NewAdPageClient";

type PageProps = {
  searchParams?: {
    tipo?: string;
  };
};

export default function NovoAnuncioPage({ searchParams }: PageProps) {
  const initialType =
    searchParams?.tipo === "lojista" ? "lojista" : "particular";

  return <NewAdPageClient initialType={initialType} />;
}
