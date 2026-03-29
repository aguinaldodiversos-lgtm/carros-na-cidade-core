/**
 * Busca de cidades no BFF — única função usada pelo modal e pelo seletor do header.
 */

export type ApiCityRow = {
  id?: number;
  name?: string;
  slug?: string;
  state?: string;
  demand_score?: number;
};

export async function searchCitiesClient(
  q: string,
  uf: string,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<ApiCityRow[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];

  const sp = new URLSearchParams({
    q: trimmed,
    uf: uf || "SP",
    limit: String(options?.limit ?? 20),
  });

  try {
    const res = await fetch(`/api/cities/search?${sp.toString()}`, {
      signal: options?.signal,
      cache: "no-store",
    });
    const json = (await res.json()) as { success?: boolean; data?: ApiCityRow[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}
