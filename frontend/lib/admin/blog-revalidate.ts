/**
 * Cliente do endpoint interno /api/revalidate para o Blog (Fase 4.2).
 *
 * Chamado pelo BFF admin após mutações aceitas pelo backend que mudam o
 * que o público vê (publish/unpublish/archive/restore e PATCH em post
 * published), garantindo que /blog e os posts individuais reflitam o
 * conteúdo novo sem esperar o TTL.
 *
 * Falha-soft (mesma política do home-revalidate): erros não bloqueiam a
 * ação do admin; logamos e seguimos. O backup é o TTL de 60s do
 * `cacheGet('public:blog:*')` no backend + `revalidate: 300` nas páginas.
 */
export async function triggerBlogRevalidate(): Promise<void> {
  const baseUrl = resolveSelfBaseUrl();
  if (!baseUrl) {
    console.warn("[blog-revalidate] baseUrl não resolvido — pulando revalidate");
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
        paths: ["/blog"],
        tags: ["public-blog"],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[blog-revalidate] HTTP", res.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

function resolveSelfBaseUrl(): string {
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
