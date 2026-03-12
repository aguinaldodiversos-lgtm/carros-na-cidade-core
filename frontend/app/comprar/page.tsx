import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

function buildQueryString(searchParams: SearchParams) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) params.append(key, item);
      }
      continue;
    }

    params.set(key, value);
  }

  return params.toString();
}

type ComprarPageProps = {
  searchParams: SearchParams;
};

export default async function ComprarPage({ searchParams }: ComprarPageProps) {
  const queryString = buildQueryString(searchParams);
  redirect(queryString ? `/anuncios?${queryString}` : "/anuncios");
}
