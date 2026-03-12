export interface PublicAdDetail {
  id: number | string;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | string | null;
  city?: string | null;
  state?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | string | null;
  mileage?: number | string | null;
  body_type?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  below_fipe?: boolean | null;
  highlight_until?: string | null;
  plan?: string | null;
  image_url?: string | null;
  images?: string[] | string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdDetailResponse {
  success: boolean;
  data: PublicAdDetail;
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

export async function fetchAdDetail(identifier: string): Promise<PublicAdDetail> {
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
