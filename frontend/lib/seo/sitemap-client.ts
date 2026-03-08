// frontend/lib/seo/sitemap-client.ts

export interface PublicSitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string | number;
  clusterType?: string;
  stage?: string;
  moneyPage?: boolean;
  state?: string;
}

interface PublicSitemapResponse {
  success: boolean;
  data: PublicSitemapEntry[];
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ||
    process.env.API_URL?.replace(/\/+$/, "") ||
    "http://localhost:4000"
  );
}

async function fetchJson<T>(url: string, revalidateSeconds = 3600): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    next: {
      revalidate: revalidateSeconds,
    },
  });

  if (!response.ok) {
    throw new Error(`Sitemap API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeEntry(entry: PublicSitemapEntry): PublicSitemapEntry {
  return {
    ...entry,
    loc: String(entry.loc || "").trim(),
    lastmod: entry.lastmod || undefined,
    changefreq: entry.changefreq || undefined,
    priority:
      entry.priority !== undefined && entry.priority !== null
        ? Number(entry.priority)
        : undefined,
    clusterType: entry.clusterType || undefined,
    stage: entry.stage || undefined,
    state: entry.state || undefined,
    moneyPage: Boolean(entry.moneyPage),
  };
}

function dedupeEntries(entries: PublicSitemapEntry[]): PublicSitemapEntry[] {
  const map = new Map<string, PublicSitemapEntry>();

  for (const entry of entries) {
    if (!entry.loc) continue;

    const current = map.get(entry.loc);

    if (!current) {
      map.set(entry.loc, entry);
      continue;
    }

    const currentPriority = Number(current.priority || 0);
    const nextPriority = Number(entry.priority || 0);

    if (nextPriority >= currentPriority) {
      map.set(entry.loc, entry);
    }
  }

  return [...map.values()];
}

export async function fetchPublicSitemap(
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  const apiBase = getApiBaseUrl();
  const json = await fetchJson<PublicSitemapResponse>(
    `${apiBase}/api/public/seo/sitemap?limit=${limit}`,
    3600
  );

  if (!json.success || !Array.isArray(json.data)) {
    return [];
  }

  return dedupeEntries(json.data.map(normalizeEntry));
}

export async function fetchPublicSitemapByType(
  type: string,
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  const apiBase = getApiBaseUrl();
  const json = await fetchJson<PublicSitemapResponse>(
    `${apiBase}/api/public/seo/sitemap/type/${encodeURIComponent(type)}?limit=${limit}`,
    3600
  );

  if (!json.success || !Array.isArray(json.data)) {
    return [];
  }

  return dedupeEntries(json.data.map(normalizeEntry));
}

export async function fetchPublicSitemapByRegion(
  state: string,
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  const apiBase = getApiBaseUrl();
  const json = await fetchJson<PublicSitemapResponse>(
    `${apiBase}/api/public/seo/sitemap/region/${encodeURIComponent(state)}?limit=${limit}`,
    3600
  );

  if (!json.success || !Array.isArray(json.data)) {
    return [];
  }

  return dedupeEntries(json.data.map(normalizeEntry));
}

export async function fetchPublicSitemapByTypes(
  types: string[],
  limit = 50000
): Promise<PublicSitemapEntry[]> {
  const results = await Promise.all(
    types.map((type) => fetchPublicSitemapByType(type, limit))
  );

  return dedupeEntries(results.flat());
}

export async function detectAvailableStates(
  limit = 100000
): Promise<string[]> {
  const entries = await fetchPublicSitemap(limit);
  const states = new Set<string>();

  for (const entry of entries) {
    if (entry.state) {
      states.add(String(entry.state).trim().toUpperCase());
    }
  }

  return [...states].sort((a, b) => a.localeCompare(b));
}
