export interface AdDetailResponse {
  success: boolean;
  data: any;
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

export async function fetchAdDetail(identifier: string) {
  const apiBase = getApiBaseUrl();

  const response = await fetch(
    `${apiBase}/api/ads/${encodeURIComponent(identifier)}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      next: {
        revalidate: 300,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar anúncio (${response.status})`);
  }

  const json = (await response.json()) as AdDetailResponse;

  if (!json.success || !json.data) {
    throw new Error("Payload inválido do anúncio");
  }

  return json.data;
}
