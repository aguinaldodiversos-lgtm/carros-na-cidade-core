import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

/** Rota legada: um único fluxo oficial em `/anunciar/novo`. */
export default function PainelNovoAnuncioRedirect({ searchParams }: PageProps) {
  const q = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string") {
        q.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => q.append(key, v));
      }
    }
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  redirect(`/anunciar/novo${suffix}`);
}
