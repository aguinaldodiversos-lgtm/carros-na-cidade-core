/**
 * Cliente do endpoint interno /api/revalidate (Fase 4.1).
 *
 * Chamado pelo BFF admin após PATCH /api/admin/home/hero ser aceito pelo
 * backend, garantindo que a Home pública pegue o conteúdo novo na próxima
 * navegação sem esperar o TTL de 60s do `cacheGet` do backend público.
 *
 * Falha-soft: erros não são propagados para o admin; logamos e seguimos.
 * O backup é o TTL de 60s do `cacheGet('public:home:hero')` + `revalidate:
 * 60` no `fetchHomeHero`.
 */
export async function triggerHomeHeroRevalidate(): Promise<void> {
  const baseUrl = resolveSelfBaseUrl();
  if (!baseUrl) {
    console.warn("[home-revalidate] baseUrl não resolvido — pulando revalidate");
    return;
  }
  const token = (process.env.REVALIDATE_TOKEN || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl}/api/revalidate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        paths: ["/"],
        tags: ["public-home-hero", "public-home"],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[home-revalidate] HTTP", res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

function resolveSelfBaseUrl(): string {
  // Em produção, NEXT_PUBLIC_SITE_URL ou VERCEL_URL/RENDER_EXTERNAL_URL.
  // Em dev/local, http://localhost:3000.
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
    "http://localhost:3000",
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim().replace(/\/+$/, "");
    }
  }
  return "";
}
